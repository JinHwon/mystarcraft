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
  getPlayerById,
  createBotPlayer,
  autoAllocateBotStatPoints,
  applyGameStatChange,
  getRankingList,
  getHeadToHeadRecord,
  seedQuestsIfEmpty,
  getAllQuests,
  getPlayerQuestProgress,
  getOrCreateQuestProgress,
  updateQuestProgress,
  claimQuestReward,
  getDailyGameCount,
  getDailyWinCount,
  getDailyAdvancedGameCount,
  getTotalGoldEarned,
  getPlayerGradeIndex,
} from "./db";
import { eq, and } from "drizzle-orm";
import { players, playerItems, items } from "../drizzle/schema";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { DIFFICULTY_RANGES, GAME_REWARDS, FATIGUE_COST, FATIGUE_MIN_TO_PLAY, MAPS, calcGradeIndex, calcTotalStats, STAT_KEYS, StatKey, calcFatigueStatPenalty } from "@shared/gameConstants";
import { simulateGame, calculateWinProbability, estimateWinRate } from "./gameSimulation";
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
    
    // 착용 아이템 보너스 포함 등급 계산 및 유효 능력치 계산
    const playerItems = await getPlayerItems(player.id);
    let effectiveGrade: string = grade;
    let effectiveStats: Record<string, number> = {};
    
    if (stats) {
      const itemBoosts: Record<string, number> = {};
      playerItems.forEach((pi: any) => {
        if (!pi.equipped) return;
        const boosts = (pi.item?.statBoosts ?? {}) as Record<string, number>;
        Object.entries(boosts).forEach(([k, v]) => {
          itemBoosts[k] = (itemBoosts[k] ?? 0) + (v ?? 0);
        });
      });
      
      // 기본 능력치 + 아이템 부스트
      const boostedStats: Record<string, number> = {};
      STAT_KEYS.forEach((key) => {
        boostedStats[key] = Math.min(((stats as any)[key] ?? 0) + (itemBoosts[key] ?? 0), 1200);
      });
      
      // 피로도 페널티 적용
      const penalty = calcFatigueStatPenalty(player.fatigue ?? 0);
      STAT_KEYS.forEach((key) => {
        effectiveStats[key] = Math.floor(boostedStats[key] * (1 - penalty));
      });
      
      const effectiveTotal = STAT_KEYS.reduce((sum, key) => {
        return sum + Math.min(((stats as any)[key] ?? 0) + (itemBoosts[key] ?? 0), 1200);
      }, 0);
      const { calcGrade } = await import("@shared/gameConstants");
      effectiveGrade = calcGrade(effectiveTotal);
    }
    
    return { ...player, stats: stats ?? null, gameRecord, grade: effectiveGrade, playerItems, effectiveStats };
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
      // 능력치 행을 바로 만들어 두어야 다른 선수의 상대 매칭 대상에 포함된다
      await ensurePlayerStats(playerId);
      return { playerId };
    }),

  uploadPhoto: protectedProcedure
    .input(
      z.object({
        base64: z.string(),
        mimeType: z.string().regex(/^image\/(png|jpe?g|gif|webp)$/, "지원하지 않는 이미지 형식입니다").default("image/jpeg"),
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

      // 퀘스트 진행도 업데이트 (능력치 배분)
      try {
        const allQuestsList = await getAllQuests();
        for (const quest of allQuestsList) {
          if (quest.conditionType === 'stat_allocate' && quest.type === 'daily') {
            const prog = await getOrCreateQuestProgress(player.id, quest.id, quest.type);
            if (prog.rewardClaimed !== 1) {
              await updateQuestProgress(player.id, quest.id, prog.progress + 1, quest.conditionValue);
            }
          }
        }
      } catch (e) { /* quest tracking should not block main action */ }

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
      const { calcExpToNext, LEVEL_MAX } = await import("@shared/gameConstants");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let { exp, level, expToNext, statPoints } = player;
      exp += input.amount;
      let leveledUp = false;
      let levelsGained = 0;

      while (level < LEVEL_MAX && exp >= expToNext) {
        exp -= expToNext;
        level += 1;
        levelsGained += 1;
        expToNext = calcExpToNext(level);
        statPoints += 20;
        leveledUp = true;
      }

      // 최대 레벨이면 경험치 초과분 제거
      if (level >= LEVEL_MAX) {
        exp = 0;
        expToNext = 0;
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
      await updateFatigue(player.id, input.amount);
      const updated = await getPlayerByUserId(ctx.user.id);
      return { fatigue: updated?.fatigue ?? player.fatigue };
    }),

  // 시간 기반 피로도 회복 (10분마다 5씩)
  tickFatigueRecovery: protectedProcedure.mutation(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
    if (player.fatigue >= 100) return { fatigue: 100, recovered: 0 };
    const recovery = Math.min(5, 100 - player.fatigue);
    await updateFatigue(player.id, recovery);
    return { fatigue: Math.min(100, player.fatigue + recovery), recovered: recovery };
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

      // 퀘스트 진행도 업데이트 (아이템 구매)
      try {
        const allQuestsList = await getAllQuests();
        for (const quest of allQuestsList) {
          if (quest.conditionType === 'item_buy' && quest.type === 'daily') {
            const prog = await getOrCreateQuestProgress(player.id, quest.id, quest.type);
            if (prog.rewardClaimed !== 1) {
              await updateQuestProgress(player.id, quest.id, prog.progress + 1, quest.conditionValue);
            }
          }
        }
      } catch (e) { /* quest tracking should not block main action */ }

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

  useItem: protectedProcedure
    .input(z.object({ playerItemId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      
      // 아이템 사용 차감 (피로도 회복 아이템)
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      
      const playerItem = await db.select().from(playerItems).where(
        and(eq(playerItems.id, input.playerItemId), eq(playerItems.playerId, player.id))
      ).limit(1);
      if (!playerItem.length) throw new TRPCError({ code: "NOT_FOUND", message: "아이템을 찾을 수 없습니다" });
      
      const pi = playerItem[0];
      const item = await db.select().from(items).where(eq(items.id, pi.itemId)).limit(1);
      if (!item.length || !item[0].fatigueRecover) throw new TRPCError({ code: "BAD_REQUEST", message: "피로도 회복 아이템이 아닙니다" });
      
      // 피로도 회복 적용
      const playerData = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
      if (!playerData.length) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
      
      // 피로도 회복 (감소 아님)
      const fatigueRecover = Number(item[0].fatigueRecover) || 0;
      const newFatigue = Math.min(100, Math.max(0, playerData[0].fatigue - fatigueRecover));
      await db.update(players).set({ fatigue: newFatigue }).where(eq(players.id, player.id));
      
      // 아이템 사용 차감
      const newCount = pi.usageCount - 1;
      if (newCount <= 0) {
        await db.delete(playerItems).where(eq(playerItems.id, pi.id));
      } else {
        await db.update(playerItems).set({ usageCount: newCount }).where(eq(playerItems.id, pi.id));
      }
      
      return { success: true, newFatigue };
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
    try {
      return await getAllUsers();
    } catch (error) {
      console.error("[Admin] Failed to list users:", error);
      throw new TRPCError({ 
        code: "INTERNAL_SERVER_ERROR", 
        message: "사용자 목록을 불러올 수 없습니다. 데이터베이스 연결을 확인해주세요." 
      });
    }
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

// ── Quest Router ────────────────────────────────────────────────

const questRouter = router({
  list: protectedProcedure.query(async () => {
    await seedQuestsIfEmpty();
    return await getAllQuests();
  }),

  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) return [];

    await seedQuestsIfEmpty();
    const allQuestsList = await getAllQuests();
    const progressList = [];

    for (const quest of allQuestsList) {
      const prog = await getOrCreateQuestProgress(player.id, quest.id, quest.type);

      // 자동으로 진행도 계산
      let currentProgress = prog.progress;

      if (quest.type === 'daily') {
        if (quest.conditionType === 'practice_games') {
          currentProgress = await getDailyGameCount(player.id);
        } else if (quest.conditionType === 'practice_wins') {
          currentProgress = await getDailyWinCount(player.id);
        } else if (quest.conditionType === 'practice_advanced') {
          currentProgress = await getDailyAdvancedGameCount(player.id);
        }
        // stat_allocate, item_buy는 액션 시점에 증가시킴
      } else if (quest.type === 'cumulative') {
        const record = await getPlayerGameRecord(player.id);
        if (quest.conditionType === 'total_wins') {
          currentProgress = record?.wins ?? 0;
        } else if (quest.conditionType === 'total_games') {
          currentProgress = record?.total ?? 0;
        } else if (quest.conditionType === 'total_gold_earned') {
          currentProgress = await getTotalGoldEarned(player.id);
        } else if (quest.conditionType === 'player_level') {
          currentProgress = player.level;
        } else if (quest.conditionType === 'player_grade') {
          currentProgress = await getPlayerGradeIndex(player.id);
        }
      }

      // 진행도 업데이트
      if (currentProgress !== prog.progress) {
        await updateQuestProgress(player.id, quest.id, currentProgress, quest.conditionValue);
      }

      const completed = currentProgress >= quest.conditionValue;
      progressList.push({
        questId: quest.id,
        progress: Math.min(currentProgress, quest.conditionValue),
        completed,
        rewardClaimed: prog.rewardClaimed === 1,
      });
    }

    return progressList;
  }),

  getRewardableCount: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) return 0;

    await seedQuestsIfEmpty();
    const allQuestsList = await getAllQuests();
    let rewardableCount = 0;

    for (const quest of allQuestsList) {
      const prog = await getOrCreateQuestProgress(player.id, quest.id, quest.type);
      
      // 완료했지만 보상을 수령하지 않은 퀘스트
      if (prog.completed === 1 && prog.rewardClaimed !== 1) {
        rewardableCount++;
      }
    }

    return rewardableCount;
  }),

  claimReward: protectedProcedure
    .input(z.object({ questId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const player = await getPlayerByUserId(ctx.user.id);
      if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });

      const allQuestsList = await getAllQuests();
      const quest = allQuestsList.find(q => q.id === input.questId);
      if (!quest) throw new TRPCError({ code: "NOT_FOUND", message: "퀘스트를 찾을 수 없습니다" });

      const prog = await getOrCreateQuestProgress(player.id, quest.id, quest.type);

      // 이미 보상 수령했는지 확인
      if (prog.rewardClaimed === 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "이미 보상을 수령했습니다" });
      }

      // 완료 여부 확인
      if (prog.completed !== 1 && prog.progress < quest.conditionValue) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "퀘스트를 아직 완료하지 않았습니다" });
      }

      // 보상 지급
      if (quest.rewardType === 'gold') {
        await updatePlayerGold(player.id, quest.rewardValue);
      } else if (quest.rewardType === 'exp') {
        await updatePlayerExp(player.id, quest.rewardValue);
      } else if (quest.rewardType === 'fatigue') {
        const db = await getDb();
        if (db) {
          const p = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
          if (p.length > 0) {
            const newFatigue = Math.min(100, p[0].fatigue + quest.rewardValue);
            await db.update(players).set({ fatigue: newFatigue }).where(eq(players.id, player.id));
          }
        }
      } else if (quest.rewardType === 'stat_points') {
        const db = await getDb();
        if (db) {
          const p = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
          if (p.length > 0) {
            await db.update(players).set({ statPoints: p[0].statPoints + quest.rewardValue }).where(eq(players.id, player.id));
          }
        }
      }

      // 보상 수령 처리
      await claimQuestReward(player.id, quest.id);

      return {
        success: true,
        rewardType: quest.rewardType,
        rewardValue: quest.rewardValue,
      };
    }),
});

/**
 * 경기 결과에 따른 능력치 변동 계산 (능력치 동적 변경 + 역전 시스템)
 * 플레이어와 AI 상대 모두 같은 규칙으로 성장/하락한다.
 */
function computeGameStatChanges(
  isWinner: boolean,
  gameEvents: Parameters<typeof calculateStatChanges>[1],
  myStatsData: any,
  opponentStatsData: any,
  hasStatBoost: boolean
): Record<string, number> {
  const baseStatChanges = calculateStatChanges(isWinner, gameEvents);

  const myStatsMap = {
    attack: myStatsData?.attack || 0,
    defense: myStatsData?.defense || 0,
    economy: myStatsData?.strategy || 0,
    intelligence: myStatsData?.scout || 0,
  };
  const opponentStatsMap = {
    attack: opponentStatsData?.attack || 0,
    defense: opponentStatsData?.defense || 0,
    economy: opponentStatsData?.strategy || 0,
    intelligence: opponentStatsData?.scout || 0,
  };

  // 등급 인덱스 계산 (능력치 합산 기반)
  const myTotalForGrade = STAT_KEYS.reduce((sum, key) => sum + (myStatsData?.[key] || 0), 0);
  const opponentTotalForGrade = STAT_KEYS.reduce((sum, key) => sum + (opponentStatsData?.[key] || 0), 0);

  const finalStatChanges = applyReverseSystem(
    isWinner,
    myStatsMap,
    opponentStatsMap,
    baseStatChanges,
    calcGradeIndex(myTotalForGrade),
    calcGradeIndex(opponentTotalForGrade)
  );

  // attack → 공격력, defense → 수비력, economy → 전략, intelligence → 정찰
  // 추가로 sense, control, harass, supply도 게임 결과에 따라 변동
  const attackChange = finalStatChanges.attack;
  const defenseChange = finalStatChanges.defense;
  const economyChange = finalStatChanges.economy;
  const intelligenceChange = finalStatChanges.intelligence;

  const derive = (base: number) => isWinner
    ? Math.max(0, Math.min(6, base + Math.floor(Math.random() * 3)))
    : Math.max(-8, Math.min(1, base + Math.floor(Math.random() * 2) - 2));

  // 센스: 경제/정찰, 컨트롤: 공격/방어, 견제: 공격/정찰, 물량: 경제/방어
  const senseChange = derive(Math.round((economyChange + intelligenceChange) / 2));
  const controlChange = derive(Math.round((attackChange + defenseChange) / 2));
  const harassChange = derive(Math.round((attackChange + intelligenceChange) / 2));
  const supplyChange = derive(Math.round((economyChange + defenseChange) / 2));

  const boostStat = (v: number) => hasStatBoost && v > 0 ? v * 2 : v;

  return {
    sense: boostStat(senseChange),
    control: boostStat(controlChange),
    attack: boostStat(attackChange),
    harass: boostStat(harassChange),
    strategy: boostStat(economyChange),
    supply: boostStat(supplyChange),
    defense: boostStat(defenseChange),
    scout: boostStat(intelligenceChange),
  };
}

/** 시뮬레이션용 선수 능력치 (기본 능력치 + 착용 아이템 부스트, 피로도 미적용) */
async function getPlayerSimStats(playerId: number): Promise<Record<StatKey, number>> {
  const playerStatsRaw = await getPlayerStats(playerId);
  const statsForSim = Object.fromEntries(
    STAT_KEYS.map(key => [key, (playerStatsRaw as any)?.[key] || 500])
  ) as Record<StatKey, number>;

  const equippedItems = await getPlayerItems(playerId);
  for (const pi of equippedItems) {
    if (pi.equipped !== 1 || pi.usageCount <= 0) continue;
    const boosts = (typeof pi.item.statBoosts === 'string'
      ? (() => { try { return JSON.parse(pi.item.statBoosts as string); } catch { return {}; } })()
      : pi.item.statBoosts ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(boosts)) {
      if (k in statsForSim && typeof v === 'number') {
        (statsForSim as any)[k] = Math.min(1200, ((statsForSim as any)[k] || 0) + v);
      }
    }
  }
  return statsForSim;
}

// ── Practice Game Router ────────────────────────────────────────

const practiceRouter = router({
  getMaps: publicProcedure.query(async () => {
    await seedMapsIfEmpty();
    return await getAllMaps();
  }),

  // 실제 승률: playGame과 동일한 조건으로 게임 엔진을 여러 번 돌려 추정
  estimateWinRate: protectedProcedure
    .input(z.object({
      gameId: z.number().int(),
      aiOpponent: z.object({
        race: z.enum(["terran", "zerg", "protoss"]),
        stats: z.record(z.string(), z.number()),
      }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "게임을 찾을 수 없습니다" });

      const player = await getPlayerByUserId(ctx.user.id);
      if (!player || (player.id !== game.player1Id && player.id !== game.player2Id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "이 게임에 참여할 수 없습니다" });
      }

      const maps = await getAllMaps();
      const map = maps.find(m => m.id === game.mapId);
      if (!map) throw new TRPCError({ code: "NOT_FOUND", message: "맵을 찾을 수 없습니다" });
      const raceAdvantage = typeof map.raceAdvantage === 'string'
        ? JSON.parse(map.raceAdvantage)
        : map.raceAdvantage;

      const playerStatsForSim = await getPlayerSimStats(player.id);

      // 상대 (AI 선수 포함) 는 항상 DB 에서 조회. input.aiOpponent 는 예전 클라이언트 호환용으로 무시
      const opponentPlayerId = player.id === game.player1Id ? game.player2Id : game.player1Id;
      const opponent = await getPlayerById(opponentPlayerId);
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대 선수를 찾을 수 없습니다" });
      const raw = await getPlayerStats(opponent.id) || await ensurePlayerStats(opponent.id);
      const opponentStats = Object.fromEntries(
        STAT_KEYS.map(key => [key, (raw as any)?.[key] ?? 500])
      ) as Record<StatKey, number>;
      const opponentRace = opponent.race as "terran" | "zerg" | "protoss";
      const opponentFatigue = opponent.fatigue;

      return estimateWinRate(
        playerStatsForSim,
        opponentStats,
        player.race as "terran" | "zerg" | "protoss",
        opponentRace,
        raceAdvantage,
        player.fatigue,
        opponentFatigue,
        { rushDistance: map.rushDistance, resources: map.resources, complexity: map.complexity }
      );
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
      
      // 피로도 10 이하면 게임 불가
      if (!hasUnlimitedFatigueEvent && player.fatigue <= FATIGUE_MIN_TO_PLAY) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `피로도가 너무 낮습니다 (현재: ${player.fatigue}). 피로도가 ${FATIGUE_MIN_TO_PLAY}보다 높아야 게임을 할 수 있습니다.` });
      }
      
      if (!hasUnlimitedFatigueEvent && player.fatigue < FATIGUE_COST[input.difficulty]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "피로도가 부족합니다" });
      }

      // 맵 정보 조회 (상대/AI 생성 전에 확인)
      const maps = await getAllMaps();
      const map = maps.find(m => m.id === input.mapId);
      if (!map) throw new TRPCError({ code: "NOT_FOUND", message: "맵을 찾을 수 없습니다" });

      // 상대 찾기 - 난이도에 맞는 상대가 없으면 AI 선수를 DB 에 생성 (이후 전적/랭킹/성장이 쌓임)
      let opponent = await findOpponentByDifficulty(input.difficulty, player.id);
      if (!opponent) {
        opponent = await createBotPlayer(input.difficulty);
      }
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대를 찾을 수 없습니다" });
      const isAiOpponent = opponent.isBot === 1;

      // 선수 능력치 조회 (없으면 초기화)
      const playerStats = await getPlayerStats(player.id) || await ensurePlayerStats(player.id);
      const opponentStats = await getPlayerStats(opponent.id) || await ensurePlayerStats(opponent.id);
      if (!playerStats || !opponentStats) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "능력치 조회 실패" });

      // 승률 계산
      const raceAdvantage = typeof map.raceAdvantage === 'string' 
        ? JSON.parse(map.raceAdvantage) 
        : map.raceAdvantage;
      
      const playerStatsRecord = Object.fromEntries(
        STAT_KEYS.map(key => [key, (playerStats as any)[key]])
      ) as Record<StatKey, number>;

      // 상대 능력치에 착용 아이템 보너스 반영
      const opponentBaseStats = Object.fromEntries(
        STAT_KEYS.map(key => [key, (opponentStats as any)[key]])
      ) as Record<StatKey, number>;

      let opponentStatsRecord = { ...opponentBaseStats };
      {
        const opponentEquippedItems = await getPlayerItems(opponent.id);
        const opponentItemBoosts: Record<string, number> = {};
        opponentEquippedItems.forEach((pi: any) => {
          if (!pi.equipped) return;
          const boosts = (pi.item?.statBoosts ?? {}) as Record<string, number>;
          Object.entries(boosts).forEach(([k, v]) => {
            opponentItemBoosts[k] = (opponentItemBoosts[k] ?? 0) + (v ?? 0);
          });
        });
        STAT_KEYS.forEach(key => {
          opponentStatsRecord[key] = Math.min((opponentStatsRecord[key] ?? 0) + (opponentItemBoosts[key] ?? 0), 1200);
        });
      }

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

      // 상대방의 실제 등급 계산 (능력치 + 아이템 부스트 기반)
      const { calcGrade } = await import("@shared/gameConstants");
      const opponentTotalStats = STAT_KEYS.reduce((sum, key) => sum + (opponentStatsRecord[key] || 0), 0);
      const actualOpponentGrade = calcGrade(opponentTotalStats);
      
      return { 
        gameId, 
        opponent,
        opponentGrade: actualOpponentGrade, 
        winProbability,
        opponentStats: opponentStatsRecord,
        isAiOpponent,
      };
    }),

  playGame: protectedProcedure
    .input(z.object({
      gameId: z.number().int(),
      aiOpponent: z.object({
        name: z.string(),
        race: z.enum(["terran", "zerg", "protoss"]),
        stats: z.record(z.string(), z.number()),
        level: z.number().int(),
        grade: z.string(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);
      if (!game) throw new TRPCError({ code: "NOT_FOUND", message: "게임을 찾을 수 없습니다" });

      const player = await getPlayerByUserId(ctx.user.id);
      if (!player || (player.id !== game.player1Id && player.id !== game.player2Id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "이 게임에 참여할 수 없습니다" });
      }

      // 상대 선수 정보 (AI 선수도 DB 에 저장된 선수. input.aiOpponent 는 예전 클라이언트 호환용으로 무시)
      const opponentId = player.id === game.player1Id ? game.player2Id : game.player1Id;
      const opponent = await getPlayerById(opponentId);
      if (!opponent) throw new TRPCError({ code: "NOT_FOUND", message: "상대 선수를 찾을 수 없습니다" });
      const opponentName = opponent.name;
      const opponentRace = opponent.race as "terran" | "zerg" | "protoss";
      const opponentFatigue = opponent.fatigue;
      const isAiGame = opponent.isBot === 1;

      // 맵 정보 조회
      const maps = await getAllMaps();
      const map = maps.find(m => m.id === game.mapId);
      if (!map) throw new TRPCError({ code: "NOT_FOUND", message: "맵을 찾을 수 없습니다" });

      const raceAdvantage = typeof map.raceAdvantage === 'string' 
        ? JSON.parse(map.raceAdvantage) 
        : map.raceAdvantage;

      // 게임 시뮬레이션 실행
      // AI 상대인 경우 능력치를 직접 전달
      const playerStatsForSim = await getPlayerSimStats(player.id);
      
      const simulation = await simulateGame(
        player.id,
        opponentId,
        player.name,
        opponentName,
        player.race as "terran" | "zerg" | "protoss",
        opponentRace,
        game.difficulty,
        raceAdvantage,
        player.fatigue,
        opponentFatigue,
        "balanced",
        playerStatsForSim,
        undefined,
        { rushDistance: map.rushDistance, resources: map.resources, complexity: map.complexity }
      );

      const winnerId = simulation.winnerId;
      const isWinner = winnerId === player.id;

      // 보상 계산 - 난이도별 골드 보상 조정
      const rewards = GAME_REWARDS[game.difficulty];
      let expGained = isWinner ? rewards.expWin : rewards.expLose;
      
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

      // 활성 이벤트 보너스 적용 (경험치 2배, 골드 2배)
      const rewardEvents = await getActiveEvents();
      const hasExpDouble = rewardEvents.some(e => e.type === 'exp_double');
      const hasGoldDouble = rewardEvents.some(e => e.type === 'gold_double');
      if (hasExpDouble) expGained *= 2;
      if (hasGoldDouble) goldGained *= 2;

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
      
      const playerStatsData = await getPlayerStats(player.id);
      const opponentStatsData = await getPlayerStats(opponentId);

      // stat_boost 이벤트 활성 시 양수 능력치 변동 2배
      const hasStatBoost = rewardEvents.some(e => e.type === 'stat_boost');
      const statChanges = computeGameStatChanges(isWinner, gameEvents, playerStatsData, opponentStatsData, hasStatBoost);

      await createGameResult({
        gameId: input.gameId,
        playerId: player.id,
        opponentId,
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
      const hasUnlimitedFatigueEvent = rewardEvents.some(e => e.type === 'fatigue_unlimited');
      if (!hasUnlimitedFatigueEvent) {
        await addFatigueCost(player.id, fatigueUsed);
        
        // 게임 결과에 따른 피로도 변동
        // 이겼으면 -1 ~ +3 (피로도가 오르거나 약간 줄 수 있음)
        // 졌으면 -5 ~ 0 (피로도가 줄어듦)
        let fatigueChange: number;
        if (isWinner) {
          fatigueChange = Math.floor(Math.random() * 5) - 1; // -1 ~ +3
        } else {
          fatigueChange = Math.floor(Math.random() * 6) - 5; // -5 ~ 0
        }
        if (fatigueChange !== 0) {
          await updateFatigue(player.id, fatigueChange);
        }
      }

      // AI 상대도 전적/경험치/능력치가 쌓이며 함께 성장
      if (isAiGame) {
        const botWon = !isWinner;
        const botEvents = simulation.player2Events?.length ? simulation.player2Events : simulation.player1Events ?? [];
        const botGameEvents = {
          attackSuccess: botEvents.filter((e: any) => e.type === 'engagement' && e.winner === 2).length,
          attackFailure: botEvents.filter((e: any) => e.type === 'engagement' && e.winner === 1).length,
          defenseSuccess: 0,
          defenseFailure: 0,
          multiExpanded: botEvents.filter((e: any) => e.type === 'multi_expansion').length,
          resourceDrained: botEvents.filter((e: any) => e.type === 'resource_drain').length,
          scoutingSuccess: botEvents.filter((e: any) => e.type === 'scouting_success').length,
          scoutingFailure: botEvents.filter((e: any) => e.type === 'scouting_failure').length,
        };
        const botStatChanges = computeGameStatChanges(
          botWon,
          botGameEvents,
          opponentStatsData,
          playerStatsData,
          false
        );
        const botExp = botWon ? rewards.expWin : rewards.expLose;
        await createGameResult({
          gameId: input.gameId,
          playerId: opponentId,
          opponentId: player.id,
          isWinner: botWon,
          expGained: botExp,
          goldGained: 0,
          statChanges: botStatChanges,
          fatigueUsed: 0,
        });
        await updatePlayerExp(opponentId, botExp);
        await autoAllocateBotStatPoints(opponentId);
        for (const [key, value] of Object.entries(botStatChanges)) {
          if (value !== 0) await applyGameStatChange(opponentId, key as StatKey, value);
        }
      }

      return { 
        isWinner, 
        expGained, 
        goldGained, 
        fatigueUsed,
        turns: simulation.turns,
        finalScore: isWinner ? simulation.player1FinalScore : simulation.player2FinalScore,
        statChanges,
        opponentName,
        opponentRace,
        isAiOpponent: isAiGame,
      };
    }),

  getGameHistory: protectedProcedure.query(async ({ ctx }) => {
    const player = await getPlayerByUserId(ctx.user.id);
    if (!player) throw new TRPCError({ code: "NOT_FOUND", message: "선수를 찾을 수 없습니다" });
    return await getPlayerGameHistory(player.id, 100);
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
  quest: questRouter,
  ranking: router({
    list: publicProcedure.query(async () => {
      return await getRankingList();
    }),
    // 상대전적 조회
    headToHead: protectedProcedure
      .input(z.object({ opponentPlayerId: z.number().int() }))
      .query(async ({ ctx, input }) => {
        const player = await getPlayerByUserId(ctx.user.id);
        if (!player) return { wins: 0, losses: 0, total: 0 };
        return await getHeadToHeadRecord(player.id, input.opponentPlayerId);
      }),
  }),
});

export type AppRouter = typeof appRouter;


