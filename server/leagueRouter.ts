import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getPlayerByUserId } from "./db";
import { ensureTeam } from "./team";
import {
  getIndividual,
  getLeagueHistory,
  getProleague,
  newIndividualSeason,
  newProSeason,
  playIndividualRound,
  playProRound,
  withTeamLock,
} from "./league";
import { PRO_SETS } from "@shared/leagueConstants";

async function loadTeam(userId: number) {
  const main = await getPlayerByUserId(userId);
  if (!main) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 먼저 만들어주세요" });
  const team = await ensureTeam(userId, main);
  return { main, team };
}

async function userAction<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    console.error("[League]", e);
    throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : "요청을 처리할 수 없습니다" });
  }
}

export const leagueRouter = router({
  proleague: protectedProcedure.query(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return withTeamLock(team.id, () => getProleague(team));
  }),

  playProRound: protectedProcedure
    .input(z.object({ entry: z.array(z.number().int()).length(PRO_SETS) }))
    .mutation(async ({ ctx, input }) => {
      const { main, team } = await loadTeam(ctx.user.id);
      return userAction(() => withTeamLock(team.id, () => playProRound(team, main, input.entry)));
    }),

  newProSeason: protectedProcedure.mutation(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return userAction(() => withTeamLock(team.id, async () => { await newProSeason(team); return { success: true }; }));
  }),

  individual: protectedProcedure.query(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return withTeamLock(team.id, () => getIndividual(team));
  }),

  playIndividualRound: protectedProcedure.mutation(async ({ ctx }) => {
    const { main, team } = await loadTeam(ctx.user.id);
    return userAction(() => withTeamLock(team.id, () => playIndividualRound(team, main)));
  }),

  newIndividualSeason: protectedProcedure.mutation(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return userAction(() => withTeamLock(team.id, async () => { await newIndividualSeason(team); return { success: true }; }));
  }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const { team } = await loadTeam(ctx.user.id);
    return getLeagueHistory(team);
  }),
});
