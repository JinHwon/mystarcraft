import { TRPCError } from "@trpc/server";
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
} from "./db";
import { storagePut } from "./storage";

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
});

export type AppRouter = typeof appRouter;
