import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { careers } from "../../drizzle/schema";
import type { CareerState } from "@shared/career/rules";
import { ACTIONS } from "@shared/career/rules";
import {
  CareerError,
  advanceWeek,
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

async function load(userId: number): Promise<CareerState | null> {
  const db = await requireDb();
  const rows = await db.select().from(careers).where(eq(careers.userId, userId)).limit(1);
  if (!rows[0]) return null;
  const s = JSON.parse(rows[0].state) as CareerState;
  migrateCareer(s);
  return s;
}

async function save(userId: number, state: CareerState) {
  const db = await requireDb();
  const json = JSON.stringify(state);
  const existing = await db.select({ id: careers.id }).from(careers).where(eq(careers.userId, userId)).limit(1);
  if (existing[0]) await db.update(careers).set({ state: json }).where(eq(careers.id, existing[0].id));
  else await db.insert(careers).values({ userId, state: json });
}

// 같은 유저의 요청은 순서대로 처리 (세이브 덮어쓰기 방지)
const locks = new Map<number, Promise<unknown>>();
function withLock<T>(userId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(userId, run);
  return run.finally(() => { if (locks.get(userId) === run) locks.delete(userId); });
}

/** 세이브를 불러와 수정하고 저장. 게임 규칙 오류는 사용자에게 보여줄 메시지로 변환 */
function mutate<T>(userId: number, fn: (s: CareerState) => T) {
  return withLock(userId, async () => {
    const s = await load(userId);
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "진행 중인 커리어가 없습니다. 새 게임을 시작하세요" });
    try {
      const result = fn(s);
      await save(userId, s);
      return { state: s, result };
    } catch (e) {
      if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
      throw e;
    }
  });
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
        await save(ctx.user.id, state);
        return { state };
      } catch (e) {
        if (e instanceof CareerError) throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        throw e;
      }
    })),

  setAction: protectedProcedure
    .input(z.object({ playerId: z.number().int(), action: z.enum(actionKeys).nullable() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => setAction(s, input.playerId, input.action as any))),

  /** 행동력 안에서 컨디션 낮은 선수는 휴식, 나머지는 훈련으로 자동 배정 */
  autoActions: protectedProcedure.mutation(({ ctx }) => mutate(ctx.user.id, s => {
    const roster = rosterOf(s, s.myTeam);
    for (const p of roster) p.action = null;
    let ap = s.ap;
    for (const p of [...roster].sort((a, b) => a.cond - b.cond)) {
      if (p.cond <= 4) p.action = "rest";
      else if (ap >= 1) { p.action = "train"; ap -= 1; }
      else p.action = "rest";
    }
  })),

  advance: protectedProcedure
    .input(z.object({ entry: z.array(z.number().int()).optional() }))
    .mutation(({ ctx, input }) => mutate(ctx.user.id, s => advanceWeek(s, input.entry))),

  nextSeason: protectedProcedure.mutation(({ ctx }) => mutate(ctx.user.id, s => startNextSeason(s))),

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
});
