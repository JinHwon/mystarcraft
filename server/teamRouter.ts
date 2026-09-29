import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getPlayerByUserId } from "./db";
import { MAX_ROSTER, ROOKIE_SCOUT_COST, TEAM_EMBLEMS, TRAINING_MENUS } from "@shared/teamConstants";
import {
  ensureTeam,
  getRoster,
  getScoutList,
  recruitPlayer,
  releasePlayer,
  renameTeam,
  restPlayer,
  scoutRookie,
  trainPlayer,
} from "./team";

/** 로그인한 유저의 본인 선수(골드 지갑)와 팀 */
async function loadTeam(userId: number) {
  const main = await getPlayerByUserId(userId);
  if (!main) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 먼저 만들어주세요" });
  const team = await ensureTeam(userId, main);
  return { main, team };
}

/** 로직 오류(Error)를 사용자에게 보여줄 BAD_REQUEST 로 변환 */
async function userAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "요청을 처리할 수 없습니다" });
  }
}

const trainingKeys = TRAINING_MENUS.map(m => m.key) as [string, ...string[]];

export const teamRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { main, team } = await loadTeam(ctx.user.id);
    const roster = await getRoster(team);
    return { team, roster, gold: main.gold, maxRoster: MAX_ROSTER };
  }),

  rename: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(20), emblem: z.string().refine(e => TEAM_EMBLEMS.includes(e), "지원하지 않는 엠블럼입니다") }))
    .mutation(async ({ ctx, input }) => {
      const { team } = await loadTeam(ctx.user.id);
      await renameTeam(team.id, input.name, input.emblem);
      return { success: true };
    }),

  scoutList: protectedProcedure.query(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return getScoutList(team);
  }),

  recruit: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { main, team } = await loadTeam(ctx.user.id);
      return userAction(() => recruitPlayer(team, main, input.playerId));
    }),

  scoutRookie: protectedProcedure.mutation(async ({ ctx }) => {
    const { main, team } = await loadTeam(ctx.user.id);
    return userAction(() => scoutRookie(team, main, ROOKIE_SCOUT_COST));
  }),

  release: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { team } = await loadTeam(ctx.user.id);
      return userAction(() => releasePlayer(team, input.playerId));
    }),

  train: protectedProcedure
    .input(z.object({ playerId: z.number().int(), menu: z.enum(trainingKeys) }))
    .mutation(async ({ ctx, input }) => {
      const { main, team } = await loadTeam(ctx.user.id);
      return userAction(() => trainPlayer(team, main, input.playerId, input.menu as any));
    }),

  rest: protectedProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const { team } = await loadTeam(ctx.user.id);
      return userAction(() => restPlayer(team, input.playerId));
    }),
});
