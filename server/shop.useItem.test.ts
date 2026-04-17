import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { players, playerItems, items } from "../drizzle/schema";
import { eq } from "drizzle-orm";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `sample-user-${userId}`,
    email: `sample${userId}@example.com`,
    name: `Sample User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("shop.useItem", () => {
  let db: any;
  let testPlayerId: number;
  let testItemId: number;
  let testPlayerItemId: number;

  beforeAll(async () => {
    db = await getDb();
    if (!db) throw new Error("Database not available");

    // 테스트 플레이어 생성
    const playerResult = await db.insert(players).values({
      userId: 9999,
      name: "Test Player",
      race: "terran",
      level: 1,
      exp: 0,
      gold: 10000,
      fatigue: 80,
      stats: JSON.stringify({
        sense: 100,
        control: 100,
        attack: 100,
        harass: 100,
        strategy: 100,
        supply: 100,
        defense: 100,
        scout: 100,
      }),
    });

    // 테스트 플레이어 ID 조회
    const players_result = await db
      .select()
      .from(players)
      .where(eq(players.userId, 9999))
      .limit(1);
    testPlayerId = players_result[0].id;

    // 테스트 아이템 생성 (피로도 회복 아이템)
    const itemResult = await db.insert(items).values({
      name: "Test Recovery Item",
      description: "Test fatigue recovery item",
      price: 100,
      rarity: "common",
      iconEmoji: "🧪",
      statBoosts: JSON.stringify({}),
      fatigueRecover: 20,
    });

    // 테스트 아이템 ID 조회
    const items_result = await db
      .select()
      .from(items)
      .where(eq(items.name, "Test Recovery Item"))
      .limit(1);
    testItemId = items_result[0].id;

    // 테스트 플레이어 아이템 생성
    const playerItemResult = await db.insert(playerItems).values({
      playerId: testPlayerId,
      itemId: testItemId,
      equipped: 0,
      usageCount: 3,
    });

    // 테스트 플레이어 아이템 ID 조회
    const playerItems_result = await db
      .select()
      .from(playerItems)
      .where(eq(playerItems.playerId, testPlayerId))
      .limit(1);
    testPlayerItemId = playerItems_result[0].id;
  });

  afterAll(async () => {
    if (!db) return;

    // 테스트 데이터 정리
    await db.delete(playerItems).where(eq(playerItems.playerId, testPlayerId));
    await db.delete(items).where(eq(items.id, testItemId));
    await db.delete(players).where(eq(players.id, testPlayerId));
  });

  it("should use fatigue recovery item and decrease usageCount", async () => {
    const ctx = createAuthContext(9999);
    const caller = appRouter.createCaller(ctx);

    // 아이템 사용 전 상태 확인
    const playerBefore = await db
      .select()
      .from(players)
      .where(eq(players.id, testPlayerId))
      .limit(1);
    const fatigueBefore = playerBefore[0].fatigue;

    // 아이템 사용
    const result = await caller.shop.useItem({ playerItemId: testPlayerItemId });

    // 결과 확인
    expect(result.success).toBe(true);
    expect(result.newFatigue).toBeLessThan(fatigueBefore);
    expect(result.newFatigue).toBe(Math.max(0, fatigueBefore - 20));

    // 플레이어 피로도 확인
    const playerAfter = await db
      .select()
      .from(players)
      .where(eq(players.id, testPlayerId))
      .limit(1);
    expect(playerAfter[0].fatigue).toBe(result.newFatigue);

    // 플레이어 아이템 usageCount 확인
    const playerItemAfter = await db
      .select()
      .from(playerItems)
      .where(eq(playerItems.id, testPlayerItemId))
      .limit(1);
    expect(playerItemAfter[0].usageCount).toBe(2);
  });

  it("should delete item when usageCount reaches 0", async () => {
    const ctx = createAuthContext(9999);
    const caller = appRouter.createCaller(ctx);

    // usageCount를 1로 설정
    await db
      .update(playerItems)
      .set({ usageCount: 1 })
      .where(eq(playerItems.id, testPlayerItemId));

    // 아이템 사용
    const result = await caller.shop.useItem({ playerItemId: testPlayerItemId });

    expect(result.success).toBe(true);

    // 아이템이 삭제되었는지 확인
    const playerItemAfter = await db
      .select()
      .from(playerItems)
      .where(eq(playerItems.id, testPlayerItemId))
      .limit(1);
    expect(playerItemAfter).toHaveLength(0);
  });

  it("should throw error when item is not found", async () => {
    const ctx = createAuthContext(9999);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.shop.useItem({ playerItemId: 99999 });
      expect.fail("Should throw error");
    } catch (error: any) {
      expect(error.code).toBe("NOT_FOUND");
    }
  });

  it("should throw error when item is not a fatigue recovery item", async () => {
    const ctx = createAuthContext(9999);
    const caller = appRouter.createCaller(ctx);

    // 일반 아이템 생성 (피로도 회복 없음)
    const regularItemResult = await db.insert(items).values({
      name: "Regular Item",
      description: "Regular item without fatigue recovery",
      price: 100,
      rarity: "common",
      iconEmoji: "🎁",
      statBoosts: JSON.stringify({ sense: 10 }),
      fatigueRecover: 0,
    });

    // 일반 아이템 ID 조회
    const items_result = await db
      .select()
      .from(items)
      .where(eq(items.name, "Regular Item"))
      .limit(1);
    const regularItemId = items_result[0].id;

    // 플레이어 일반 아이템 추가
    const playerItemResult = await db.insert(playerItems).values({
      playerId: testPlayerId,
      itemId: regularItemId,
      equipped: 0,
      usageCount: 1,
    });

    // 일반 아이템 ID 조회
    const playerItems_result = await db
      .select()
      .from(playerItems)
      .where(eq(playerItems.playerId, testPlayerId))
      .limit(1);
    const regularPlayerItemId = playerItems_result[0].id;

    try {
      await caller.shop.useItem({ playerItemId: regularPlayerItemId });
      expect.fail("Should throw error");
    } catch (error: any) {
      expect(error.code).toBe("BAD_REQUEST");
    }

    // 테스트 데이터 정리
    await db
      .delete(playerItems)
      .where(eq(playerItems.itemId, regularItemId));
    await db.delete(items).where(eq(items.id, regularItemId));
  });
});
