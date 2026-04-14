import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// DB 모듈 모킹
vi.mock("./db", () => ({
  getPlayerByUserId: vi.fn(),
  createPlayer: vi.fn(),
  getPlayerStats: vi.fn(),
  getAllItems: vi.fn(),
  getPlayerItems: vi.fn(),
  buyItem: vi.fn(),
  toggleEquipItem: vi.fn(),
  updatePlayerPhoto: vi.fn(),
  allocateStat: vi.fn(),
  seedItemsIfEmpty: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

import * as db from "./db";
import type { Player, PlayerStats, Item } from "../drizzle/schema";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `user-${userId}`,
    email: `user${userId}@example.com`,
    name: `테스트 유저 ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockPlayer: Player = {
  id: 1,
  userId: 1,
  name: "테스트 선수",
  race: "terran",
  photoUrl: null,
  level: 1,
  exp: 0,
  expToNext: 100,
  statPoints: 0,
  gold: 1000,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockStats: PlayerStats = {
  id: 1,
  playerId: 1,
  sense: 500,
  control: 500,
  attack: 500,
  harass: 500,
  strategy: 500,
  supply: 500,
  defense: 500,
  scout: 500,
  updatedAt: new Date(),
};

describe("player.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("새 선수를 정상적으로 생성한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue(undefined);
    vi.mocked(db.createPlayer).mockResolvedValue(1);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.player.create({ name: "홍길동", race: "terran" });

    expect(result).toEqual({ playerId: 1 });
    expect(db.createPlayer).toHaveBeenCalledWith({
      userId: 1,
      name: "홍길동",
      race: "terran",
    });
  });

  it("이미 선수가 있으면 CONFLICT 에러를 반환한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue(mockPlayer);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.player.create({ name: "홍길동", race: "terran" }))
      .rejects.toThrow("이미 선수가 존재합니다");
  });

  it("이름이 빈 문자열이면 유효성 검사 에러가 발생한다", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.player.create({ name: "", race: "terran" }))
      .rejects.toThrow();
  });

  it("유효하지 않은 종족이면 에러가 발생한다", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.player.create({ name: "홍길동", race: "invalid" as any }))
      .rejects.toThrow();
  });
});

describe("player.get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("선수가 없으면 null을 반환한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.player.get();

    expect(result).toBeNull();
  });

  it("선수가 있으면 선수 정보와 능력치를 반환한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue(mockPlayer);
    vi.mocked(db.getPlayerStats).mockResolvedValue(mockStats);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.player.get();

    expect(result).not.toBeNull();
    expect(result?.name).toBe("테스트 선수");
    expect(result?.race).toBe("terran");
    expect(result?.stats).toEqual(mockStats);
  });
});

describe("shop.buyItem", () => {
  const mockItem: Item = {
    id: 1,
    name: "스캔 모듈",
    description: "정찰 능력 향상",
    price: 200,
    rarity: "common",
    statBoosts: { scout: 30 },
    iconEmoji: "🔭",
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("충분한 골드가 있으면 아이템을 구매한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue({ ...mockPlayer, gold: 500 });
    vi.mocked(db.buyItem).mockResolvedValue(mockItem);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shop.buyItem({ itemId: 1 });

    expect(result.name).toBe("스캔 모듈");
    expect(db.buyItem).toHaveBeenCalledWith(1, 1, 500);
  });

  it("선수가 없으면 NOT_FOUND 에러를 반환한다", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue(undefined);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.shop.buyItem({ itemId: 1 }))
      .rejects.toThrow("선수를 찾을 수 없습니다");
  });
});
