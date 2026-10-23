/**
 * 선수 키우기 모드 API: 세이브는 rookie_careers (사용자당 하나), 요청마다 전체 상태를 돌려준다
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { rookieAllowed, rookieOpen, rookiePicks } from "../settings";
import { getDb } from "../db";
import { rookieCareers, rookieHof, users } from "../../drizzle/schema";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { ACH_BY_ID, CONCEPTS, DAILY_PICKS, kstDate, picksLeft, RANK_SORTS, TIERS, sumStats, type Concept, type RankSort, type RookieState, type Tier } from "@shared/rookie/model";
import * as L from "./logic";
import { answerMail, readMail } from "./inbox";
import { applyLegacy, retire } from "./world";
import type { HofEntry } from "@shared/rookie/world";

const cache = new Map<number, RookieState>();
const locks = new Map<number, Promise<unknown>>();
function withLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(userId, run);
  return run.finally(() => { if (locks.get(userId) === run) locks.delete(userId); });
}
async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
  return d;
}
async function load(userId: number): Promise<RookieState | null> {
  const hit = cache.get(userId);
  if (hit) return hit;
  const rows = await (await db()).select().from(rookieCareers).where(eq(rookieCareers.userId, userId)).limit(1);
  if (!rows[0]) return null;
  const s = L.upgrade(JSON.parse(rows[0].state) as RookieState);
  cache.set(userId, s);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return s;
}
async function save(userId: number, s: RookieState) {
  const d = await db();
  const json = JSON.stringify(s);
  const summary = {
    state: json, name: s.name, race: s.race, status: s.fa ? "fa" : s.status, team: s.team?.team ?? null, ladder: s.ladder.score,
    total: sumStats(s.stats), fame: s.fame, badges: Object.keys(s.achievements).length, title: s.title ? ACH_BY_ID[s.title]?.title ?? null : null,
  };
  const rows = await d.select({ id: rookieCareers.id }).from(rookieCareers).where(eq(rookieCareers.userId, userId)).limit(1);
  if (rows[0]) await d.update(rookieCareers).set(summary).where(eq(rookieCareers.id, rows[0].id));
  else await d.insert(rookieCareers).values({ userId, ...summary });
  cache.set(userId, s);
}

type Who = { id: number; role: string };
/** 실제 하루에 직접 고를 수 있는 횟수 (관리자는 제한 없음 = 0) */
const limitOf = async (user: Who) => (user.role === "admin" ? 0 : await rookiePicks(DAILY_PICKS));
/** 화면용 요약 + 오늘 남은 선택 */
const todayOf = (s: RookieState, limit: number) => ({ ...L.todayInfo(s), picks: { left: picksLeft(s, limit), limit } });

/** 세이브를 고치고 저장, 결과와 새 상태를 돌려줌 (규칙 오류면 되돌림) */
function mutate<T>(user: Who, fn: (s: RookieState, limit: number) => T) {
  const userId = user.id;
  return withLock(userId, async () => {
    const limit = await limitOf(user);
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "키우는 선수가 없습니다. 새 선수를 만드세요" });
    const backup = JSON.stringify(s);
    try {
      const result = fn(s, limit);
      const gained = L.checkAchievements(s);
      await save(userId, s);
      return { result, state: s, today: todayOf(s, limit), gained };
    } catch (e) {
      cache.set(userId, JSON.parse(backup) as RookieState);
      if (e instanceof L.RookieError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  });
}

const statsSchema = z.object(Object.fromEntries(STAT_KEYS.map(k => [k, z.number().int()])) as Record<(typeof STAT_KEYS)[number], z.ZodNumber>);
const conceptKeys = Object.keys(CONCEPTS) as [Concept, ...Concept[]];
const tierKeys = Object.keys(TIERS) as [Tier, ...Tier[]];
/** 공개 전에는 관리자·베타 테스터만 (관리자 패널에서 공개/비공개 · 베타 명단) */
const p = protectedProcedure.use(async ({ ctx, next }) => {
  if (!(await rookieAllowed(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "선수 키우기 모드는 아직 준비 중입니다" });
  return next();
});

const watchN = z.number().int().min(0).max(3).optional();
/** 오늘 하루 동안 할 활동 하나 (고르면 오늘이 끝나고 다음 선택일까지 자동으로 지나감) */
const activitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lobby"), tier: z.enum(tierKeys).optional(), mapId: z.number().int().min(0).optional(), watch: watchN }),
  z.object({ kind: z.literal("ladder"), watch: watchN }),
  z.object({ kind: z.literal("clan"), target: z.string().max(40).optional(), watch: watchN }),
  z.object({ kind: z.literal("internal"), watch: watchN }),
  z.object({ kind: z.literal("friendly"), watch: watchN }),
  z.object({ kind: z.literal("war") }),
  z.object({ kind: z.literal("stream") }), z.object({ kind: z.literal("rest") }), z.object({ kind: z.literal("work") }),
  z.object({ kind: z.literal("mentor"), stat: z.enum(STAT_KEYS as unknown as [StatKey, ...StatKey[]]), pro: z.number().int() }),
  z.object({ kind: z.literal("clanTest"), id: z.string().max(30) }),
  z.object({ kind: z.literal("tryout"), team: z.number().int() }),
  z.object({ kind: z.literal("event"), id: z.number().int() }),
  z.object({ kind: z.literal("courage") }), z.object({ kind: z.literal("draft") }), z.object({ kind: z.literal("promo") }),
]);

export const rookieRouter = router({
  /** 화면에 메뉴를 보여줄지 (누구나 물어볼 수 있음) */
  access: protectedProcedure.query(async ({ ctx }) => {
    const open = await rookieOpen();
    return { open, allowed: await rookieAllowed(ctx.user) };
  }),
  get: p.query(async ({ ctx }) => { const state = await load(ctx.user.id); return { state, today: state ? todayOf(state, await limitOf(ctx.user)) : null }; }),
  create: p.input(z.object({
    name: z.string().max(20), race: z.enum(["terran", "zerg", "protoss"]), concept: z.enum(conceptKeys), stats: statsSchema, photo: z.string().max(70_000).optional(),
    replace: z.boolean().optional(),
    /** 은퇴한 선배의 뒤를 이어서 (돈·인지도 일부·조언을 물려받음) */
    successor: z.boolean().optional(),
  })).mutation(({ ctx, input }) => withLock(ctx.user.id, async () => {
    const old = await load(ctx.user.id);
    if (old && !input.replace && !old.retired) throw new TRPCError({ code: "BAD_REQUEST", message: "이미 키우는 선수가 있습니다" });
    try {
      const s = L.newRookie(input);
      if (input.successor && old?.retired) applyLegacy(s, old);
      // 새로 만들어도 오늘 쓴 선택 횟수는 그대로 (다시 만들어서 제한을 피하지 못하게)
      if (old?.quota) s.quota = old.quota;
      await save(ctx.user.id, s);
      return { state: s, today: todayOf(s, await limitOf(ctx.user)) };
    } catch (e) {
      if (e instanceof L.RookieError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  })),
  ladderMaps: p.input(z.object({ sel: z.array(z.number().int()).min(1).max(5) })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.setLadderMaps(s, input.sel))),
  buy: p.input(z.object({ key: z.string(), qty: z.number().int().min(1).max(99) })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.buy(s, input.key, input.qty))),
  use: p.input(z.object({ key: z.string() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.useItem(s, input.key))),
  register: p.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.registerEvent(s, input.id))),
  /** 준프로·FA: 프로팀에 입단 테스트 신청 (한 달에 한 번) */
  applyTryout: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.applyTryout(s, input.team))),
  requestTransfer: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.requestTransfer(s, input.team))),
  acceptOffer: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.acceptOffer(s, input.team))),
  negotiate: p.input(z.object({ ask: z.number().int(), clause: z.enum(["none", "promise", "bonus"]).optional() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.negotiate(s, input.ask, input.clause))),
  acceptNego: p.input(z.object({ clause: z.enum(["none", "promise", "bonus"]).optional() }).optional()).mutation(({ ctx, input }) => mutate(ctx.user, s => L.acceptNego(s, input?.clause))),
  /** 팀 내 입지: 감독 면담(출전 요구) · 임대 요청 · 에이전트 */
  askPlayTime: p.mutation(({ ctx }) => mutate(ctx.user, s => L.askPlayTime(s))),
  requestLoan: p.mutation(({ ctx }) => mutate(ctx.user, s => L.requestLoan(s))),
  hireAgent: p.input(z.object({ tier: z.union([z.literal(1), z.literal(2), z.literal(3)]) })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.hireAgent(s, input.tier))),
  fireAgent: p.mutation(({ ctx }) => mutate(ctx.user, s => L.fireAgent(s))),
  setTitle: p.input(z.object({ id: z.string().nullable() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.setTitle(s, input.id))),
  /** 랭킹 보드: 다른 유저들의 키운 선수 (상위 50 + 내 순위) */
  ranking: p.input(z.object({ sort: z.enum(Object.keys(RANK_SORTS) as [RankSort, ...RankSort[]]) })).query(async ({ ctx, input }) => {
    const d = await db();
    const col = rookieCareers[input.sort];
    // 감독 이름 · 마지막 접속(로그인) · 마지막 게임(세이브가 마지막으로 바뀐 때)
    const cols = {
      userId: rookieCareers.userId, name: rookieCareers.name, race: rookieCareers.race, status: rookieCareers.status, team: rookieCareers.team, ladder: rookieCareers.ladder, total: rookieCareers.total, fame: rookieCareers.fame, badges: rookieCareers.badges, title: rookieCareers.title,
      manager: users.managerName, lastSeen: users.lastSignedIn, lastPlay: rookieCareers.updatedAt,
    };
    const base = () => d.select(cols).from(rookieCareers).leftJoin(users, eq(users.id, rookieCareers.userId));
    const rows = await base().orderBy(desc(col), rookieCareers.id).limit(50);
    const mine = await base().where(eq(rookieCareers.userId, ctx.user.id)).limit(1);
    let myRank: number | null = null;
    if (mine[0]) {
      const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(rookieCareers).where(sql`${col} > ${mine[0][input.sort]}`);
      myRank = Number(n) + 1;
    }
    // 시각은 숫자(ms)로: 세이브 시각은 DB 문자열(UTC)
    const ms = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v.getTime() : Date.parse(v.replace(" ", "T") + "Z"));
    const strip = ({ userId, lastSeen, lastPlay, ...r }: (typeof rows)[number]) => ({ ...r, lastSeen: ms(lastSeen), lastPlay: ms(lastPlay), me: userId === ctx.user.id });
    return { rows: rows.map(strip), me: mine[0] ? strip(mine[0]) : null, myRank };
  }),
  clanFeedback: p.mutation(({ ctx }) => mutate(ctx.user, s => L.clanFeedback(s))),
  /** 은퇴: 경력 점수를 매겨 명예의 전당에 올림 (데뷔 1년 뒤부터) */
  retire: p.mutation(async ({ ctx }) => {
    const r = await mutate(ctx.user, s => retire(s));
    const e = r.result as HofEntry;
    await (await db()).insert(rookieHof).values({ userId: ctx.user.id, name: e.name, race: e.race, score: e.score, data: JSON.stringify(e) });
    return r;
  }),
  /** 명예의 전당 (점수 순 50명) */
  hof: p.query(async () => {
    const rows = await (await db()).select().from(rookieHof).orderBy(desc(rookieHof.score)).limit(50);
    return rows.map(r => ({ id: r.id, userId: r.userId, at: String(r.createdAt), ...(JSON.parse(r.data) as HofEntry) }));
  }),
  /** 메일 읽음 · 답장 (선택) */
  mailRead: p.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user, s => readMail(s, input.id))),
  mailAnswer: p.input(z.object({ id: z.number().int(), choice: z.string().min(1).max(20) })).mutation(({ ctx, input }) => mutate(ctx.user, s => answerMail(s, input.id, input.choice))),
  leaveClan: p.mutation(({ ctx }) => mutate(ctx.user, s => L.leaveClan(s))),
  act: p.input(activitySchema).mutation(({ ctx, input }) => mutate(ctx.user, (s, limit) => { L.spendPick(s, kstDate(), limit); return L.act(s, input as L.Activity); })),
  /** 진행 중인 대회: 내 다음 경기 하나 (quick = 중계 없이 결과만) */
  bracketPlay: p.input(z.object({ quick: z.boolean().optional() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.bracketPlay(s, input.quick))),
  /** 클랜전: 길드장이 엔트리 제출 · 다음 세트 진행 */
  warEntry: p.input(z.object({ names: z.array(z.string().max(40)).length(5) })).mutation(({ ctx, input }) => mutate(ctx.user, s => { L.warEntry(s, input.names); return { war: s.war }; })),
  warPlay: p.input(z.object({ quick: z.boolean().optional() })).mutation(({ ctx, input }) => mutate(ctx.user, s => L.warPlay(s, input.quick))),
});
