import { z } from "zod";
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
} from "./db";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";

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
});

export type AppRouter = typeof appRouter;
