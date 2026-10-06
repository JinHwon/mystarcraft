/**
 * 선수 키우기 모드 API: 세이브는 rookie_careers (사용자당 하나), 요청마다 전체 상태를 돌려준다
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { rookieOpen } from "../settings";
import { getDb } from "../db";
import { rookieCareers } from "../../drizzle/schema";
import { STAT_KEYS, type StatKey } from "@shared/gameConstants";
import { ACH_BY_ID, CONCEPTS, RANK_SORTS, TIERS, sumStats, type Concept, type RankSort, type RookieState, type Tier } from "@shared/rookie/model";
import * as L from "./logic";

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

/** 세이브를 고치고 저장, 결과와 새 상태를 돌려줌 (규칙 오류면 되돌림) */
function mutate<T>(userId: number, fn: (s: RookieState) => T) {
  return withLock(userId, async () => {
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "키우는 선수가 없습니다. 새 선수를 만드세요" });
    const backup = JSON.stringify(s);
    try {
      const result = fn(s);
      const gained = L.checkAchievements(s);
      await save(userId, s);
      return { result, state: s, today: L.todayInfo(s), gained };
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
/** 공개 전에는 관리자만 (관리자 패널에서 공개/비공개) */
const p = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "admin" && !(await rookieOpen())) throw new TRPCError({ code: "FORBIDDEN", message: "선수 키우기 모드는 아직 준비 중입니다" });
  return next();
});

export const rookieRouter = router({
  /** 화면에 메뉴를 보여줄지 (누구나 물어볼 수 있음) */
  access: protectedProcedure.query(async ({ ctx }) => {
    const open = await rookieOpen();
    return { open, allowed: open || ctx.user.role === "admin" };
  }),
  get: p.query(async ({ ctx }) => { const state = await load(ctx.user.id); return { state, today: state ? L.todayInfo(state) : null }; }),
  create: p.input(z.object({
    name: z.string().max(20), race: z.enum(["terran", "zerg", "protoss"]), concept: z.enum(conceptKeys), stats: statsSchema, photo: z.string().max(70_000).optional(),
    replace: z.boolean().optional(),
  })).mutation(({ ctx, input }) => withLock(ctx.user.id, async () => {
    const old = await load(ctx.user.id);
    if (old && !input.replace) throw new TRPCError({ code: "BAD_REQUEST", message: "이미 키우는 선수가 있습니다" });
    try {
      const s = L.newRookie(input);
      await save(ctx.user.id, s);
      return { state: s, today: L.todayInfo(s) };
    } catch (e) {
      if (e instanceof L.RookieError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  })),
  findLobby: p.input(z.object({ tier: z.enum(tierKeys), mapId: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.findLobby(s, input.tier, input.mapId))),
  kick: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.kickLobby(s))),
  playLobby: p.mutation(({ ctx }) => mutate(ctx.user.id, s => ({ games: [L.playLobby(s)] }))),
  ladder: p.mutation(({ ctx }) => mutate(ctx.user.id, s => ({ games: [L.playLadder(s)] }))),
  rest: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.rest(s))),
  stream: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.stream(s))),
  allowance: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.allowance(s))),
  buy: p.input(z.object({ key: z.string(), qty: z.number().int().min(1).max(99) })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.buy(s, input.key, input.qty))),
  use: p.input(z.object({ key: z.string() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.useItem(s, input.key))),
  register: p.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.registerEvent(s, input.id))),
  playEvent: p.input(z.object({ id: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.playEvent(s, input.id))),
  courage: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.playCourage(s))),
  draft: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.playDraft(s))),
  tryout: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.playTryout(s, input.team))),
  internal: p.mutation(({ ctx }) => mutate(ctx.user.id, s => ({ games: [L.playInternal(s)] }))),
  promo: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.playPromo(s))),
  proleague: p.mutation(({ ctx }) => mutate(ctx.user.id, s => ({ games: [L.playProleague(s)] }))),
  requestTransfer: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.requestTransfer(s, input.team))),
  acceptOffer: p.input(z.object({ team: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.acceptOffer(s, input.team))),
  mentor: p.input(z.object({ stat: z.enum(STAT_KEYS as unknown as [StatKey, ...StatKey[]]), pro: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.mentor(s, input.stat, input.pro))),
  negotiate: p.input(z.object({ ask: z.number().int() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.negotiate(s, input.ask))),
  acceptNego: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.acceptNego(s))),
  setTitle: p.input(z.object({ id: z.string().nullable() })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.setTitle(s, input.id))),
  /** 랭킹 보드: 다른 유저들의 키운 선수 (상위 50 + 내 순위) */
  ranking: p.input(z.object({ sort: z.enum(Object.keys(RANK_SORTS) as [RankSort, ...RankSort[]]) })).query(async ({ ctx, input }) => {
    const d = await db();
    const col = rookieCareers[input.sort];
    const cols = { userId: rookieCareers.userId, name: rookieCareers.name, race: rookieCareers.race, status: rookieCareers.status, team: rookieCareers.team, ladder: rookieCareers.ladder, total: rookieCareers.total, fame: rookieCareers.fame, badges: rookieCareers.badges, title: rookieCareers.title };
    const rows = await d.select(cols).from(rookieCareers).orderBy(desc(col), rookieCareers.id).limit(50);
    const mine = await d.select(cols).from(rookieCareers).where(eq(rookieCareers.userId, ctx.user.id)).limit(1);
    let myRank: number | null = null;
    if (mine[0]) {
      const [{ n }] = await d.select({ n: sql<number>`count(*)` }).from(rookieCareers).where(sql`${col} > ${mine[0][input.sort]}`);
      myRank = Number(n) + 1;
    }
    const strip = ({ userId, ...r }: (typeof rows)[number]) => ({ ...r, me: userId === ctx.user.id });
    return { rows: rows.map(strip), me: mine[0] ? strip(mine[0]) : null, myRank };
  }),
  clanTest: p.input(z.object({ id: z.string().max(30) })).mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.clanTest(s, input.id))),
  clanPractice: p.mutation(({ ctx }) => mutate(ctx.user.id, s => ({ games: [L.clanPractice(s)] }))),
  leaveClan: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.leaveClan(s))),
  batch: p.input(z.object({ kind: z.enum(["lobby", "ladder", "clan", "internal"]), tier: z.enum(tierKeys).optional(), mapId: z.number().int().min(0).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => L.batch(s, input.kind, { tier: input.tier, mapId: input.mapId }))),
  nextDay: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.nextDay(s))),
});
