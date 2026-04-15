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
  getDb,
  updatePlayerExp,
  updatePlayerGold,
  decreaseItemUsageCount,
  getPlayerGameRecord,
  getPlayerGrade,
  ensurePlayerStats,
  applyGameStatChange,
} from "./db";
import { eq } from "drizzle-orm";
import { players } from "../drizzle/schema";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, MAPS, calcGradeIndex, calcTotalStats, STAT_KEYS, StatKey } from "@shared/gameConstants";
import { simulateGame, calculateWinProbability } from "./gameSimulation";
import { type MapCharacteristic } from "./buildSystem";
import { generatePlayerActions, generateGameCommentary } from "./buildActions";
import { calculateStatChanges, applyReverseSystem } from "./statDynamicSystem";

// ── Player Router ────────────────────────────────────────────────

const playerRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) return null;
    const stats = await getPlayerStats(player.id);
    const gameRecord = await getPlayerGameRecord(player.id);
    const grade = await getPlayerGrade(player.id);
    return { ...player, stats: stats ?? null, gameRecord, grade };
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(20),
        race: z.enum(["terran", "zerg", "protoss"]),
        photoUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getPlayerByUserId(ctx.user.id);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "이미 선수가 존재합니다" });
      const playerId = await createPlayer(ctx.user.id, {
        name: input.name,
        race: input.race,
        photo: input.photoUrl || undefined,
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
        points: z.number().int().min(1), // 제한 없음 - 사용자가 원하는 만큼 배분 가능
      })
    )
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      if (player.statPoints < input.points)
        throw new TRPCError({ code: "BAD_REQUEST", message: "포인트가 부족합니다" });
      const result = await allocateStat(player.id, input.statKey, input.points);
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
      
      // 무제한 피로도 이벤트 중에는 피로도 체크 안 함
      const activeEvents = await getActiveEvents();
      const hasUnlimitedFatigueEvent = activeEvents.some(e => e.type === 'fatigue_unlimited');
      
      if (!hasUnlimitedFatigueEvent && player.fatigue < FATIGUE_COST[input.difficulty]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "피로도가 부족합니다" });
      }

      // 상대 찾기
      const opponent = await findOpponentByDifficulty(input.difficulty, player.id);
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대를 찾을 수 없습니다" });

      // 선수 능력치 조회 (없으면 초기화)
      const playerStats = await getPlayerStats(player.id) || await ensurePlayerStats(player.id);
      const opponentStats = await getPlayerStats(opponent.id) || await ensurePlayerStats(opponent.id);
      if (!playerStats || !opponentStats) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "능력치 조회 실패" });

      // 맵 정보 조회
      const maps = await getAllMaps();
      const map = maps.find(m => m.id === input.mapId);
      if (!map) throw new TRPCError({ code: "NOT_FOUND", message: "맵을 찾을 수 없습니다" });

      // 승률 계산
      const raceAdvantage = typeof map.raceAdvantage === 'string' 
        ? JSON.parse(map.raceAdvantage) 
        : map.raceAdvantage;
      
      const playerStatsRecord = Object.fromEntries(
        STAT_KEYS.map(key => [key, (playerStats as any)[key]])
      ) as Record<StatKey, number>;
      const opponentStatsRecord = Object.fromEntries(
        STAT_KEYS.map(key => [key, (opponentStats as any)[key]])
      ) as Record<StatKey, number>;

      const winProbability = calculateWinProbability(
        playerStatsRecord,
        opponentStatsRecord,
        player.race as "terran" | "zerg" | "protoss",
        opponent.race as "terran" | "zerg" | "protoss",
        raceAdvantage
      );

      // 게임 생성
      const gameId = await createGame({
        player1Id: player.id,
        player2Id: opponent.id,
        mapId: input.mapId,
        difficulty: input.difficulty,
        player1Race: player.race as "terran" | "zerg" | "protoss",
        player2Race: opponent.race as "terran" | "zerg" | "protoss",
        player1WinProbability: winProbability,
      });

      const opponentGrade = await getPlayerGrade(opponent.id);
      return { gameId, opponent, opponentGrade, winProbability };
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

      // 상대 선수 정보 조회
      const opponentPlayerId = player.id === game.player1Id ? game.player2Id : game.player1Id;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const opponentUser = await db.select().from(players).where(eq(players.id, opponentPlayerId)).limit(1);
      const opponent = opponentUser.length > 0 ? opponentUser[0] : null;
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대 선수를 찾을 수 없습니다" });

      // 맵 정보 조회
      const maps = await getAllMaps();
      const map = maps.find(m => m.id === game.mapId);
      if (!map) throw new TRPCError({ code: "NOT_FOUND", message: "맵을 찾을 수 없습니다" });

      const raceAdvantage = typeof map.raceAdvantage === 'string' 
        ? JSON.parse(map.raceAdvantage) 
        : map.raceAdvantage;

      // 게임 시뮬레이션 실행
      const player1 = player.id === game.player1Id ? player : opponent;
      const player2 = player.id === game.player2Id ? player : opponent;
      
      const simulation = await simulateGame(
        game.player1Id,
        game.player2Id,
        player1.name,
        player2.name,
        game.player1Race,
        game.player2Race,
        game.difficulty,
        raceAdvantage,
        player1.fatigue,
        player2.fatigue,
        "balanced" // 기본값으로 균형잡힌 맵 사용
      );

      const winnerId = simulation.winnerId;
      const isWinner = winnerId === player.id;

      // 보상 계산 - 난이도별 골드 보상 조정
      const rewards = GAME_REWARDS[game.difficulty];
      const expGained = isWinner ? rewards.expWin : rewards.expLose;
      
      // 난이도별 골드 보상: 초보(10/5), 중수(20/10), 고수(30/15)
      let goldGained: number;
      if (game.difficulty === 'beginner') {
        goldGained = isWinner ? 10 : 5;
      } else if (game.difficulty === 'intermediate') {
        goldGained = isWinner ? 20 : 10;
      } else {
        goldGained = isWinner ? 30 : 15;
      }
      
      const fatigueUsed = FATIGUE_COST[game.difficulty];

      // 게임 완료
      await completeGame(input.gameId, winnerId, simulation.player1FinalScore, simulation.player2FinalScore);

      // 게임 결과 저장 - 능력치 동적 변경 시스템 적용
      const gameEvents = {
        attackSuccess: simulation.player1Events?.filter((e: any) => e.type === 'engagement' && e.winner === (isWinner ? 1 : 2)).length || 0,
        attackFailure: simulation.player1Events?.filter((e: any) => e.type === 'engagement' && e.winner === (isWinner ? 2 : 1)).length || 0,
        defenseSuccess: 0, // 향후 구현
        defenseFailure: 0, // 향후 구현
        multiExpanded: simulation.player1Events?.filter((e: any) => e.type === 'multi_expansion').length || 0,
        resourceDrained: simulation.player1Events?.filter((e: any) => e.type === 'resource_drain').length || 0,
        scoutingSuccess: simulation.player1Events?.filter((e: any) => e.type === 'scouting_success').length || 0,
        scoutingFailure: simulation.player1Events?.filter((e: any) => e.type === 'scouting_failure').length || 0,
      };
      
      const baseStatChanges = calculateStatChanges(isWinner, gameEvents);
      const opponentId = winnerId === player.id ? opponent.id : player.id;
      const opponentStatsData = await getPlayerStats(opponentId);
      const playerStatsData = await getPlayerStats(player.id);
      
      const playerStatsMap = {
        attack: playerStatsData?.attack || 0,
        defense: playerStatsData?.defense || 0,
        economy: playerStatsData?.strategy || 0,
        intelligence: playerStatsData?.scout || 0,
      };
      
      const opponentStatsMap = {
        attack: opponentStatsData?.attack || 0,
        defense: opponentStatsData?.defense || 0,
        economy: opponentStatsData?.strategy || 0,
        intelligence: opponentStatsData?.scout || 0,
      };
      
      const finalStatChanges = applyReverseSystem(
        isWinner,
        playerStatsMap,
        opponentStatsMap,
        baseStatChanges
      );
      
      const statChanges: Record<string, number> = {
        sense: 0,
        control: 0,
        attack: finalStatChanges.attack,
        harass: 0,
        strategy: finalStatChanges.economy,
        supply: 0,
        defense: finalStatChanges.defense,
        scout: finalStatChanges.intelligence,
      };

      await createGameResult({
        gameId: input.gameId,
        playerId: player.id,
        isWinner,
        expGained,
        goldGained,
        statChanges,
        fatigueUsed,
      });

      // 리워드 적용 - 경뗘치, 골드, 능력치, 피로도 업데이트
      await updatePlayerExp(player.id, expGained);
      await updatePlayerGold(player.id, goldGained);
      
      // 능력치 업데이트 - 게임 결과에 의한 변동 (미배분 포인트 차감 없음)
      for (const [key, value] of Object.entries(statChanges)) {
        if (value !== 0) {
          await applyGameStatChange(player.id, key as StatKey, value);
        }
      }
      
      // 아이템 사용 횟수 감소 (게임 진행 시마다 1씩 감소)
      await decreaseItemUsageCount(player.id);
      
      // 무제한 피로도 이벤트 중에는 피로도 감소 안 함
      const activeEvents = await getActiveEvents();
      const hasUnlimitedFatigueEvent = activeEvents.some(e => e.type === 'fatigue_unlimited');
      if (!hasUnlimitedFatigueEvent) {
        await addFatigueCost(player.id, fatigueUsed);
      }

      return { 
        isWinner, 
        expGained, 
        goldGained, 
        fatigueUsed,
        turns: simulation.turns,
        finalScore: isWinner ? simulation.player1FinalScore : simulation.player2FinalScore,
        statChanges,
      };
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


