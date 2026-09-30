import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { careers } from "../../drizzle/schema";
import type { CareerState } from "@shared/career/rules";
import { diffOf, snapshot } from "./diff";
import { ACTIONS } from "@shared/career/rules";
import { negotiateMainSponsor } from "./club";
import { acceptJob, bidPlayer, chooseSponsor, demotePlayer, negotiateContract, respondOffer, signReserve } from "./club";
import {
  CareerError,
  advanceWeek,
  beginMatch,
  buyItem,
  useStockItem,
  playLiveSet,
  migrateCareer,
  newCareer,
  proposeTrade,
  releasePlayer,
  rosterOf,
  scoutPlayer,
  setAction,
  startNextSeason,
} from "./logic";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
  return db;
}

/**
 * 세이브 메모리 캐시: 요청마다 DB 에서 큰 JSON 을 읽고 파싱하지 않도록 (서버는 한 프로세스)
 * - json 은 마지막으로 저장된 모습: 규칙 오류로 중간에 멈춘 변경은 이것으로 되돌린다
 * - DB 쓰기는 응답 뒤에 (사용자마다 최신 것만, 순서대로). 서버 종료 시 남은 쓰기를 마친다
 */
const cache = new Map<number, { state: CareerState; json: string }>();
const CACHE_MAX = 300;

async function load(userId: number): Promise<CareerState | null> {
  const hit = cache.get(userId);
  if (hit) return hit.state;
  const db = await requireDb();
  const rows = await db.select().from(careers).where(eq(careers.userId, userId)).limit(1);
  if (!rows[0]) return null;
  const s = JSON.parse(rows[0].state) as CareerState;
  migrateCareer(s);
  remember(userId, s, JSON.stringify(s));
  return s;
}

function remember(userId: number, state: CareerState, json: string) {
  cache.delete(userId);
  cache.set(userId, { state, json });
  if (cache.size > CACHE_MAX) {
    // 아직 DB 에 안 쓴 세이브는 캐시에서 빼지 않음
    for (const k of cache.keys()) { if (!pendingWrites.has(k)) { cache.delete(k); break; } }
  }
}

const pendingWrites = new Map<number, string>();
const flushing = new Map<number, Promise<void>>();

async function writeDb(userId: number, json: string) {
  const db = await requireDb();
  const existing = await db.select({ id: careers.id }).from(careers).where(eq(careers.userId, userId)).limit(1);
  if (existing[0]) await db.update(careers).set({ state: json }).where(eq(careers.id, existing[0].id));
  else await db.insert(careers).values({ userId, state: json });
}

function flush(userId: number): Promise<void> {
  const running = flushing.get(userId);
  if (running) return running;
  const run = (async () => {
    for (let json = pendingWrites.get(userId); json !== undefined; json = pendingWrites.get(userId)) {
      pendingWrites.delete(userId);
      try { await writeDb(userId, json); } catch (e) {
        console.error("[career] 세이브 저장 실패", userId, e);
        if (!pendingWrites.has(userId)) pendingWrites.set(userId, json);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  })().finally(() => flushing.delete(userId));
  flushing.set(userId, run);
  return run;
}

function save(userId: number, state: CareerState, json = JSON.stringify(state)) {
  remember(userId, state, json);
  pendingWrites.set(userId, json);
  void flush(userId);
}

/** 서버 종료 전 남은 세이브 쓰기 */
export async function flushAllCareers() {
  await Promise.all([...new Set([...pendingWrites.keys(), ...flushing.keys()])].map(flush));
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => { void flushAllCareers().finally(() => process.exit(0)); });
}

// 같은 유저의 요청은 순서대로 처리 (세이브 덮어쓰기 방지)
const locks = new Map<number, Promise<unknown>>();
function withLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(userId, run);
  return run.finally(() => { if (locks.get(userId) === run) locks.delete(userId); });
}

/** 세이브를 불러와 수정하고 저장. 바뀐 부분(diff)만 돌려준다. 게임 규칙 오류는 사용자에게 보여줄 메시지로 변환 */
function mutate<T>(userId: number, fn: (s: CareerState) => T) {
  return withLock(userId, async () => {
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "진행 중인 커리어가 없습니다. 새 게임을 시작하세요" });
    const before = snapshot(s);
    try {
      if (s.gameOver) throw new CareerError(`게임이 종료되었습니다: ${s.gameOver.reason}. 새 게임을 시작하세요`);
      const result = fn(s);
      save(userId, s);
      return { result, diff: diffOf(before, s) };
    } catch (e) {
      // 중간에 멈춘 변경은 버리고 마지막 저장 상태로
      const hit = cache.get(userId);
      if (hit) remember(userId, JSON.parse(hit.json) as CareerState, hit.json);
      if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  });
}

/** 결과만 돌려주는 가벼운 변경 (화면은 미리 반영해 둠) */
function mutateLite<T>(userId: number, fn: (s: CareerState) => T) {
  return mutate(userId, fn).then(r => ({ result: r.result }));
}

const actionKeys = ACTIONS.map(a => a.key) as [string, ...string[]];

export const careerRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return { state: await load(ctx.user.id) };
  }),

  newGame: protectedProcedure
    .input(z.object({ teamId: z.number().int() }))
    .mutation(({ ctx, input }) => withLock(ctx.user.id, async () => {
      try {
        const state = newCareer(input.teamId);
        save(ctx.user.id, state);
        return { state };
      } catch (e) {
        if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        throw e;
      }
    })),

  setAction: protectedProcedure
    .input(z.object({ playerId: z.number().int(), action: z.enum(actionKeys).nullable() }))
    .mutation(({ ctx, input }) => mutateLite(ctx.user.id, s => { setAction(s, input.playerId, input.action as any); return { ok: true }; })),

  /** 행동력 안에서 컨디션 낮은 선수는 휴식, 나머지는 훈련으로 자동 배정 */
  autoActions: protectedProcedure.mutation(({ ctx }) => mutateLite(ctx.user.id, s => {
    if (s.live) throw new CareerError("경기 중에는 행동을 바꿀 수 없습니다");
    const roster = rosterOf(s, s.myTeam);
    for (const p of roster) p.action = null;
    let ap = s.ap;
    for (const p of [...roster].sort((a, b) => a.cond - b.cond)) {
      if (p.cond <= 4) p.action = "rest";
      else if (ap >= 1) { p.action = "train"; ap -= 1; }
      else p.action = "rest";
    }
    return { actions: Object.fromEntries(roster.map(p => [p.id, p.action ?? null])) as Record<number, string | null> };
  })),

  advance: protectedProcedure
    .input(z.object({ entry: z.array(z.number().int()).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => advanceWeek(s, input.entry))),

  nextSeason: protectedProcedure
    .input(z.object({ releaseExpiring: z.boolean().optional() }).optional())
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => startNextSeason(s, { releaseExpiring: input?.releaseExpiring }))),

  scout: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => scoutPlayer(s, input.playerId))),

  release: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => releasePlayer(s, input.playerId))),

  trade: protectedProcedure
    .input(z.object({
      teamId: z.number().int(),
      give: z.array(z.number().int()).max(5),
      take: z.array(z.number().int()).min(1).max(5),
      cash: z.number().int().min(0).max(1_000_000),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => proposeTrade(s, input.teamId, input.give, input.take, input.cash))),

  /** 우리 경기 시작 (1~(n-1)세트 엔트리) */
  beginMatch: protectedProcedure
    .input(z.object({
      entry: z.array(z.number().int()).min(1).max(8),
      items: z.record(z.string(), z.object({ key: z.string(), predict: z.number().int().optional() })).optional(),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => beginMatch(s, input.entry, Object.fromEntries(Object.entries(input.items ?? {}).map(([k, v]) => [Number(k), v]))))),

  /** 아이템 구입 (장비·즉시·포션은 target 선수에게 바로 사용) */
  buyItem: protectedProcedure
    .input(z.object({ key: z.string(), target: z.number().int().optional(), qty: z.number().int().min(1).max(99).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => buyItem(s, input.key, input.target, input.qty ?? 1))),

  /** 보관한 아이템 사용 (비타비타) */
  useItem: protectedProcedure
    .input(z.object({ key: z.string(), target: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => useStockItem(s, input.key, input.target))),

  /** 다음 세트 진행 (ACE 결정전이면 ace 선수) */
  playSet: protectedProcedure
    .input(z.object({ ace: z.number().int().optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => playLiveSet(s, input.ace))),

  /** 받은 영입 제안: 수락·거절·역제안(금액) */
  respondOffer: protectedProcedure
    .input(z.object({ offerId: z.number().int(), action: z.enum(["accept", "reject", "counter"]), fee: z.number().int().min(0).max(1_000_000).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => respondOffer(s, input.offerId, input.action, input.fee))),

  /** 다른 팀 선수 영입 요청 (이적료 제시) */
  bid: protectedProcedure
    .input(z.object({ playerId: z.number().int(), fee: z.number().int().min(0).max(1_000_000) }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => bidPlayer(s, input.playerId, input.fee))),

  /** 계약 협상 (영입 합의 후 또는 재계약) */
  contract: protectedProcedure
    .input(z.object({
      playerId: z.number().int(),
      salary: z.number().int().min(1).max(100_000),
      years: z.number().int().min(1).max(20),
      minApps: z.number().int().min(0).max(22).optional(),
      promote: z.boolean().optional(),
      bonus: z.object({
        proTitle: z.number().int().min(0).max(100_000).optional(),
        mslTitle: z.number().int().min(0).max(100_000).optional(),
        mostWins: z.number().int().min(0).max(100_000).optional(),
        topRank: z.number().int().min(0).max(100_000).optional(),
      }).optional(),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => negotiateContract(s, input.playerId, {
      salary: input.salary, years: input.years, minApps: input.minApps || undefined,
      bonus: Object.fromEntries(Object.entries(input.bonus ?? {}).filter(([, v]) => (v ?? 0) > 0)),
    }, { promote: input.promote }))),

  /** 다른 팀 감독 제의 수락 */
  acceptJob: protectedProcedure
    .input(z.object({ teamId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => acceptJob(s, input.teamId))),

  /** 스폰서 선택 (퀘스트 목표 조정) */
  chooseSponsor: protectedProcedure
    .input(z.object({ index: z.number().int().min(0).max(2), targets: z.array(z.number().int()).max(5) }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => chooseSponsor(s, input.index, input.targets))),

  /** 2부: 무소속 선수 영입 / 1부 → 2부 (승격은 contract 로 계약) */
  signReserve: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => signReserve(s, input.playerId))),
  demote: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => demotePlayer(s, input.playerId))),

  /** 메인 스폰서(모기업) 계약 협상 */
  mainSponsor: protectedProcedure
    .input(z.object({
      years: z.number().int().min(1).max(3),
      terms: z.object({ win: z.number().int().min(0).max(100_000), loss: z.number().int().min(0).max(100_000), proTitle: z.number().int().min(0).max(1_000_000), proRunnerUp: z.number().int().min(0).max(1_000_000), mslTitle: z.number().int().min(0).max(1_000_000), mslRunnerUp: z.number().int().min(0).max(1_000_000) }),
    }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => negotiateMainSponsor(s, input.terms, input.years))),
});
