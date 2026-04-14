import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getPlayerByUserId,
  getPlayerStats,
  getAllMaps,
  seedMapsIfEmpty,
  getAllPlayers,
  updatePlayerExp,
  updatePlayerGold,
  addFatigueCost,
} from "./db";
import { DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, calcGradeIndex, calcTotalStats, STAT_KEYS } from "@shared/gameConstants";

export const practiceRouter = router({
  // 맵 목록 조회
  getMaps: protectedProcedure.query(async () => {
    await seedMapsIfEmpty();
    return await getAllMaps();
  }),

  // 난이도별 상대 찾기
  findOpponent: protectedProcedure
    .input(z.object({
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      mapId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) {
        throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      }

      // 피로도 확인
      if (player.fatigue < FATIGUE_COST[input.difficulty]) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `피로도가 부족합니다 (필요: ${FATIGUE_COST[input.difficulty]}, 현재: ${player.fatigue})`,
        });
      }

      // 현재 선수의 능력치와 등급 계산
      const playerStats = await getPlayerStats(player.id);
      if (!playerStats) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "능력치 조회 실패" });
      }

      const playerTotalStats = calcTotalStats(playerStats);
      const playerGradeIndex = calcGradeIndex(playerTotalStats);

      // 난이도별 등급 범위 확인
      const range = DIFFICULTY_RANGES[input.difficulty];
      if (playerGradeIndex < range.minIndex || playerGradeIndex > range.maxIndex) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `현재 등급이 ${input.difficulty} 난이도 범위를 벗어났습니다`,
        });
      }

      // 모든 선수 조회
      const allPlayers = await getAllPlayers();
      if (!allPlayers || allPlayers.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "상대를 찾을 수 없습니다" });
      }

      // 같은 난이도 범위의 다른 선수 필터링
      const candidates = [];
      for (const candidate of allPlayers) {
        if (candidate.id === player.id) continue; // 자신 제외

        const candidateStats = await getPlayerStats(candidate.id);
        if (!candidateStats) continue;

        const candidateTotalStats = calcTotalStats(candidateStats);
        const candidateGradeIndex = calcGradeIndex(candidateTotalStats);

        if (candidateGradeIndex >= range.minIndex && candidateGradeIndex <= range.maxIndex) {
          candidates.push(candidate);
        }
      }

      if (candidates.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "같은 난이도의 상대를 찾을 수 없습니다" });
      }

      // 랜덤 상대 선택
      const opponent = candidates[Math.floor(Math.random() * candidates.length)];
      const opponentStats = await getPlayerStats(opponent.id);

      return {
        opponent: {
          id: opponent.id,
          name: opponent.name,
          race: opponent.race,
          photoUrl: opponent.photoUrl,
          level: opponent.level,
        },
        opponentStats,
        playerStats,
      };
    }),

  // 게임 진행 및 결과 처리
  playGame: protectedProcedure
    .input(z.object({
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      mapId: z.number().int().positive(),
      opponentId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) {
        throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      }

      const opponent = await getPlayerByUserId(input.opponentId);
      if (!opponent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "상대를 찾을 수 없습니다" });
      }

      // 피로도 차감
      await addFatigueCost(player.id, FATIGUE_COST[input.difficulty]);

      // 게임 결과 계산 (50% 확률로 승리)
      const isWinner = Math.random() < 0.5;
      const rewards = GAME_REWARDS[input.difficulty];

      const expGained = isWinner ? rewards.expWin : rewards.expLose;
      const goldGained = isWinner ? rewards.goldWin : rewards.goldLose;

      // 선수 정보 업데이트
      await updatePlayerExp(player.id, expGained);
      await updatePlayerGold(player.id, goldGained);

      return {
        isWinner,
        expGained,
        goldGained,
        fatigueUsed: FATIGUE_COST[input.difficulty],
      };
    }),
});
