/**
 * 선수 키우기 모드 API: 세이브는 rookie_careers (사용자당 하나), 요청마다 전체 상태를 돌려준다
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { rookieCareers } from "../../drizzle/schema";
import { STAT_KEYS } from "@shared/gameConstants";
import { CONCEPTS, TIERS, type Concept, type RookieState, type Tier } from "@shared/rookie/model";
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
  const s = JSON.parse(rows[0].state) as RookieState;
  cache.set(userId, s);
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return s;
}
async function save(userId: number, s: RookieState) {
  const d = await db();
  const json = JSON.stringify(s);
  const rows = await d.select({ id: rookieCareers.id }).from(rookieCareers).where(eq(rookieCareers.userId, userId)).limit(1);
  if (rows[0]) await d.update(rookieCareers).set({ state: json }).where(eq(rookieCareers.id, rows[0].id));
  else await d.insert(rookieCareers).values({ userId, state: json });
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
      await save(userId, s);
      return { result, state: s, today: L.todayInfo(s) };
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
const p = protectedProcedure;

export const rookieRouter = router({
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
  nextDay: p.mutation(({ ctx }) => mutate(ctx.user.id, s => L.nextDay(s))),
});
