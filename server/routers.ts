import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  allocateStat,
  buyItem,
  createPlayer,
  getAllItems,
  getPlayerByUserId,
  getPlayerItems,
  getPlayerStats,
  seedItemsIfEmpty,
  toggleEquipItem,
  updatePlayerPhoto,
  recoverFatigueIfNeeded,
  addFatigueCost,
  updateFatigue,
  getAllUsers,
  updatePlayerByAdmin,
  resetPlayerStats,
  resetPlayerProgress,
  createEvent,
  updateEvent,
  deleteEvent,
  getAllEvents,
  getActiveEvents,
  updateUserRole,
  getPlayerWithUser,
  seedMapsIfEmpty,
  getAllMaps,
  createGame,
  getGameById,
  completeGame,
  createGameResult,
  getPlayerGameHistory,
  findOpponentByDifficulty,
} from "./db";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, MAPS, calcGradeIndex, calcTotalStats, STAT_KEYS } from "@shared/gameConstants";

// ── Player Router ────────────────────────────────────────────────

const playerRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) return null;
    const stats = await getPlayerStats(player.id);
    return { ...player, stats: stats ?? null };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(20),
        race: z.enum(["terran", "zerg", "protoss"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getPlayerByUserId(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "이미 선수가 존재합니다" });
      const playerId = await createPlayer({
        userId: ctx.user.id,
        name: input.name,
        race: input.race,
      });
      return { playerId };
    }),

  uploadPhoto: protectedProcedure
    .input(
      z.object({
        base64: z.string(),
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });

      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] ?? "jpg";
      const key = `player-photos/${ctx.user.id}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      await updatePlayerPhoto(player.id, url);
      return { photoUrl: url };
    }),

  allocateStat: protectedProcedure
    .input(
      z.object({
        statKey: z.enum(["sense", "control", "attack", "harass", "strategy", "supply", "defense", "scout"]),
        points: z.number().int().min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      if (player.statPoints < input.points)
        throw new TRPCError({ code: "BAD_REQUEST", message: "포인트가 부족합니다" });
      const result = await allocateStat(player.id, input.statKey, input.points, player.statPoints);
      return result;
    }),

  // 테스트용: 경험치 추가 (나중에 게임 결과로 대체)
  addExp: protectedProcedure
    .input(z.object({ amount: z.number().int().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });

      const { getDb } = await import("./db");
      const { players } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let { exp, level, expToNext, statPoints } = player;
      exp += input.amount;
      let leveledUp = false;
      let levelsGained = 0;

      while (exp >= expToNext) {
        exp -= expToNext;
        level += 1;
        levelsGained += 1;
        expToNext = level * 100;
        statPoints += 20;
        leveledUp = true;
      }

      await db.update(players).set({ exp, level, expToNext, statPoints }).where(eq(players.id, player.id));
      return { level, exp, expToNext, statPoints, leveledUp, levelsGained };
    }),

  recoverFatigue: protectedProcedure.mutation(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
    const recovered = await recoverFatigueIfNeeded(player.id);
    return { recovered };
  }),

  addFatigueCost: protectedProcedure
    .input(z.object({ cost: z.number().int().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      const newFatigue = await addFatigueCost(player.id, input.cost);
      return { fatigue: newFatigue };
    }),

  addFatigue: protectedProcedure
    .input(z.object({ amount: z.number().int().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      const newFatigue = Math.min(100, player.fatigue + input.amount);
      await updateFatigue(player.id, newFatigue);
      return { fatigue: newFatigue };
    }),
});

// ── Shop Router ──────────────────────────────────────────────────

const shopRouter = router({
  listItems: publicProcedure.query(async () => {
    await seedItemsIfEmpty();
    return getAllItems();
  }),

  getPlayerItems: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) return [];
    return getPlayerItems(player.id);
  }),

  buyItem: protectedProcedure
    .input(z.object({ itemId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      const item = await buyItem(player.id, input.itemId, player.gold);
      return item;
    }),

  equipItem: protectedProcedure
    .input(z.object({ playerItemId: z.number().int(), equip: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      await toggleEquipItem(player.id, input.playerItemId, input.equip);
      return { success: true };
    }),
});

// ── App Router ───────────────────────────────────────────────────

// ── Admin Router ────────────────────────────────────────────────

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "관리자 권한이 필요합니다" });
  }
  return next({ ctx });
});

const adminRouter = router({
  listUsers: adminProcedure.query(async () => {
    return await getAllUsers();
  }),

  updatePlayer: adminProcedure
    .input(
      z.object({
        playerId: z.number().int(),
        gold: z.number().int().optional(),
        level: z.number().int().optional(),
        exp: z.number().int().optional(),
        statPoints: z.number().int().optional(),
        fatigue: z.number().int().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await updatePlayerByAdmin(input.playerId, {
        gold: input.gold,
        level: input.level,
        exp: input.exp,
        statPoints: input.statPoints,
        fatigue: input.fatigue,
      });
      return { success: true };
    }),

  resetPlayerStats: adminProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(async ({ input }) => {
      await resetPlayerStats(input.playerId);
      return { success: true };
    }),

  resetPlayerProgress: adminProcedure
    .input(z.object({ playerId: z.number().int() }))
    .mutation(async ({ input }) => {
      await resetPlayerProgress(input.playerId);
      return { success: true };
    }),

  updateUserRole: adminProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input }) => {
      await updateUserRole(input.userId, input.role);
      return { success: true };
    }),

  getPlayerInfo: adminProcedure
    .input(z.object({ playerId: z.number().int() }))
    .query(async ({ input }) => {
      const result = await getPlayerWithUser(input.playerId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      const { player, user } = result;
      return {
        playerId: player.id,
        userId: user?.id ?? null,
        userName: user?.name ?? "Unknown",
        userRole: user?.role ?? "user",
        gold: player.gold,
        level: player.level,
        exp: player.exp,
        statPoints: player.statPoints,
        fatigue: player.fatigue,
      };
    }),
});

// ── Event Router ────────────────────────────────────────────────

const eventRouter = router({
  listAll: adminProcedure.query(async () => {
    return await getAllEvents();
  }),

  listActive: publicProcedure.query(async () => {
    return await getActiveEvents();
  }),

  create: adminProcedure
    .input(
      z.object({
        type: z.enum(["exp_double", "fatigue_unlimited", "gold_double", "stat_boost"]),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await createEvent(input);
      return { success: true };
    }),

  update: adminProcedure
    .input(
      z.object({
        eventId: z.number().int(),
        isActive: z.boolean().optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { eventId, ...updates } = input;
      await updateEvent(eventId, updates);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ eventId: z.number().int() }))
    .mutation(async ({ input }) => {
      await deleteEvent(input.eventId);
      return { success: true };
    }),
});

// appRouter는 아래에서 정의됨

// ── Practice Game Router ────────────────────────────────────────

const practiceRouter = router({
  getMaps: publicProcedure.query(async () => {
    await seedMapsIfEmpty();
    return await getAllMaps();
  }),

  findOpponent: protectedProcedure
    .input(z.object({
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      mapId: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      
      if (player.fatigue < FATIGUE_COST[input.difficulty]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "피로도가 부족합니다" });
      }

      // 상대 찾기
      const opponent = await findOpponentByDifficulty(player.id, input.difficulty, 0);
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대를 찾을 수 없습니다" });

      // 선수 능력치 조회
      const playerStats = await getPlayerStats(player.id);
      const opponentStats = await getPlayerStats(opponent.id);
      if (!playerStats || !opponentStats) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "능력치 조회 실패" });

      // 게임 생성
      const gameResult = await createGame({
        player1Id: player.id,
        player2Id: opponent.id,
        mapId: input.mapId,
        difficulty: input.difficulty,
        player1Race: player.race as "terran" | "zerg" | "protoss",
        player2Race: opponent.race as "terran" | "zerg" | "protoss",
        player1WinProbability: 50, // 기본값, 나중에 계산
      });

      return { gameId: 1, opponent }; // TODO: 실제 게임 ID 반환
    }),

  playGame: protectedProcedure
    .input(z.object({
      gameId: z.number().int(),
    }))
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "게임을 찾을 수 없습니다" });

      const player = await getPlayerByUserId(ctx.user.id);
      if (!player || (player.id !== game.player1Id && player.id !== game.player2Id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "이 게임에 참여할 수 없습니다" });
      }

      // 게임 결과 계산 (간단한 로직: 50% 확률)
      const isPlayer1 = player.id === game.player1Id;
      const winnerId = Math.random() < 0.5 ? game.player1Id : game.player2Id;
      const isWinner = winnerId === player.id;

      // 보상 계산
      const rewards = GAME_REWARDS[game.difficulty];
      const expGained = isWinner ? rewards.expWin : rewards.expLose;
      const goldGained = isWinner ? rewards.goldWin : rewards.goldLose;
      const fatigueUsed = FATIGUE_COST[game.difficulty];

      // 게임 완료
      await completeGame(input.gameId, winnerId, 60, 40);

      // 게임 결과 저장
      const statChanges: Record<string, number> = {};
      STAT_KEYS.forEach(key => {
        statChanges[key] = isWinner ? 10 : -5; // 승리 시 +10, 패배 시 -5
      });

      await createGameResult({
        gameId: input.gameId,
        playerId: player.id,
        isWinner,
        expGained,
        goldGained,
        statChanges,
        fatigueUsed,
      });

      return { isWinner, expGained, goldGained, fatigueUsed };
    }),

  getGameHistory: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
    return await getPlayerGameHistory(player.id, 10);
  }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  player: playerRouter,
  shop: shopRouter,
  admin: adminRouter,
  event: eventRouter,
  practice: practiceRouter,
});

export type AppRouter = typeof appRouter;


