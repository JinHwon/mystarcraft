import { describe, it, expect, beforeEach, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";

// Mock the database module
vi.mock("./db", () => ({
  getPlayerByUserId: vi.fn(),
  createPlayer: vi.fn(),
  updatePlayerExp: vi.fn(),
  updatePlayerGold: vi.fn(),
  allocateStat: vi.fn(),
  getPlayerStats: vi.fn(),
  getPlayerByName: vi.fn(),
  buyItem: vi.fn(),
  getPlayerInventory: vi.fn(),
  decreaseItemUsageCount: vi.fn(),
  getAllUsers: vi.fn(),
  getPlayerGameHistory: vi.fn(),
}));

function createAuthContext(userId: number) {
  return {
    user: {
      id: userId,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      role: "user" as const,
    },
  };
}

describe("player management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  it("should allocate stat points correctly", async () => {
    vi.mocked(db.getPlayerByUserId).mockResolvedValue({
      id: 1,
      userId: 1,
      name: "테스트",
      race: "terran",
      level: 1,
      exp: 0,
      gold: 1000,
      grade: "D",
      fatigue: 0,
      photoUrl: null,
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-15T00:00:00Z",
      lastFatigueRecovery: "2026-04-15T00:00:00Z",
    });

    vi.mocked(db.allocateStat).mockResolvedValue({
      id: 1,
      playerId: 1,
      sense: 5,
      control: 5,
      attack: 5,
      harass: 5,
      strategy: 5,
      supply: 5,
      defense: 5,
      scout: 5,
      availablePoints: 0,
    });

    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.player.allocateStat({
      statKey: "attack",
      points: 5,
    });

    expect(result.attack).toBe(5);
  });

  it("should handle fatigue recovery item purchase", async () => {
    const mockPlayer = {
      id: 1,
      userId: 1,
      name: "테스트",
      race: "terran",
      level: 1,
      exp: 0,
      gold: 1000,
      grade: "D",
      fatigue: 50,
      photoUrl: null,
      createdAt: "2026-04-15T00:00:00Z",
      updatedAt: "2026-04-15T00:00:00Z",
      lastFatigueRecovery: "2026-04-15T00:00:00Z",
    };

    vi.mocked(db.getPlayerByUserId).mockResolvedValue(mockPlayer);
    vi.mocked(db.buyItem).mockResolvedValue({
      id: 1,
      playerId: 1,
      itemId: 30001,
      quantity: 1,
      equipped: 0,
    });

    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.shop.buyItem({
      itemId: 30001,
    });

    expect(result.itemId).toBe(30001);
    expect(result.quantity).toBe(1);
  });


});

describe("game results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return game history with opponent information", async () => {
    const mockGameHistory = [
      {
        id: 1,
        gameId: 1,
        playerId: 1,
        opponentId: 2,
        isWinner: 1,
        expGained: 50,
        goldGained: 10,
        statChanges: { attack: 5, defense: -2 },
        fatigueUsed: 10,
        createdAt: "2026-04-15T00:00:00Z",
        opponentName: "테스트 상대",
        opponentRace: "terran",
        opponentGrade: "C",
      },
    ];

    vi.mocked(db.getPlayerGameHistory).mockResolvedValue(mockGameHistory);

    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.practice.getGameHistory();

    expect(result).toHaveLength(1);
    expect(result[0].opponentName).toBe("테스트 상대");
    expect(result[0].opponentRace).toBe("terran");
    expect(result[0].statChanges.attack).toBe(5);
  });

  it("should handle missing opponent information gracefully", async () => {
    const mockGameHistory = [
      {
        id: 1,
        gameId: 1,
        playerId: 1,
        opponentId: 0,
        isWinner: 1,
        expGained: 50,
        goldGained: 10,
        statChanges: {},
        fatigueUsed: 10,
        createdAt: "2026-04-15T00:00:00Z",
        opponentName: "익명 유저",
        opponentRace: "unknown",
        opponentGrade: "D",
      },
    ];

    vi.mocked(db.getPlayerGameHistory).mockResolvedValue(mockGameHistory);

    const ctx = createAuthContext(1);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.practice.getGameHistory();

    expect(result).toHaveLength(1);
    expect(result[0].opponentName).toBe("익명 유저");
    expect(result[0].opponentRace).toBe("unknown");
  });
});

describe("admin functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list all users with players", async () => {
    const mockUsers = [
      {
        id: 1,
        openId: "test-open-id-1",
        name: "User 1",
        email: "user1@example.com",
        loginMethod: "google",
        role: "user",
        createdAt: "2026-04-15T00:00:00Z",
        updatedAt: "2026-04-15T00:00:00Z",
        lastSignedIn: "2026-04-15T00:00:00Z",
        playerCount: 1,
      },
    ];

    vi.mocked(db.getAllUsers).mockResolvedValue(mockUsers);

    const ctx = createAuthContext(1);
    ctx.user.role = "admin";
    const caller = appRouter.createCaller(ctx);
    const result = await caller.admin.listUsers();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("User 1");
    expect(result[0].playerCount).toBe(1);
  });
});
