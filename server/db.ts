import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, items, playerItems, players, playerStats, users, events, maps, games, gameResults } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { StatKey } from "@shared/gameConstants";
import { desc, eq, and } from "drizzle-orm";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date().toISOString();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date().toISOString();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function createPlayer(userId: number, playerData: { name: string; race: string; photo?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(players).values({
    userId,
    name: playerData.name,
    race: playerData.race,
    photoUrl: playerData.photo || null,
    gold: 500,
    level: 1,
    exp: 0,
    statPoints: 0,
    fatigue: 100,
    grade: "D",
  });
  return Number(result.insertId as any);
}

export async function getPlayerByUserId(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(players).where(eq(players.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllItems() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(items);
}

export async function getPlayerItems(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      playerItemId: playerItems.id,
      equipped: playerItems.equipped,
      purchasedAt: playerItems.purchasedAt,
      usageCount: playerItems.usageCount,
      item: items,
    })
    .from(playerItems)
    .innerJoin(items, eq(playerItems.itemId, items.id))
    .where(eq(playerItems.playerId, playerId));
  return result.map((r) => ({
    playerItemId: r.playerItemId,
    equipped: r.equipped,
    purchasedAt: r.purchasedAt,
    usageCount: r.usageCount,
    item: r.item,
  }));
}

export async function buyItem(
  playerId: number,
  itemId: number,
  playerGold: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const itemResult = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!itemResult.length) throw new Error("아이템을 찾을 수 없습니다");
  const item = itemResult[0];

  if (playerGold < item.price) throw new Error("골드가 부족합니다");

  // 피로도 회복 아이템인 경우 즉시 사용
  if (item.fatigueRecover && item.fatigueRecover > 0) {
    // 골드만 차감
    await db.update(players).set({ gold: playerGold - item.price }).where(eq(players.id, playerId));
    
    // 피로도 회복
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (player.length > 0) {
      const newFatigue = Math.min(100, player[0].fatigue + item.fatigueRecover);
      await db.update(players).set({ fatigue: newFatigue }).where(eq(players.id, playerId));
    }
    
    return item;
  }

  // 일반 아이템: 소유권 추가
  const existing = await db
    .select()
    .from(playerItems)
    .where(and(eq(playerItems.playerId, playerId), eq(playerItems.itemId, itemId)))
    .limit(1);
  if (existing.length > 0) throw new Error("이미 보유한 아이템입니다");

  await db.insert(playerItems).values({ playerId, itemId, equipped: 0 });
  await db.update(players).set({ gold: playerGold - item.price }).where(eq(players.id, playerId));
  return item;
}

export async function toggleEquipItem(
  playerId: number,
  playerItemId: number,
  equip: boolean
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(playerItems)
    .set({ equipped: equip ? 1 : 0 })
    .where(and(eq(playerItems.id, playerItemId), eq(playerItems.playerId, playerId)));
}

// ── Seed Items ───────────────────────────────────────────────────

export async function seedItemsIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(items).limit(1);
  if (existing.length > 0) return;

  const seedItems = [
    { name: "피로도 회복제", description: "피로도를 즉시 회복하는 에너지 드링크", price: 100, rarity: "common" as const, iconEmoji: "🥤", statBoosts: {}, fatigueRecover: 10 },
    { name: "스캔 모듈", description: "정찰 능력을 향상시키는 첨단 스캔 장비", price: 200, rarity: "common" as const, iconEmoji: "🔭", statBoosts: { scout: 30 } },
    { name: "전술 지휘봉", description: "전략적 판단력을 높이는 지휘 도구", price: 300, rarity: "common" as const, iconEmoji: "📡", statBoosts: { strategy: 40 } },
    { name: "마린 헬멧", description: "방어력을 강화하는 테란 표준 헬멧", price: 250, rarity: "common" as const, iconEmoji: "⛑️", statBoosts: { defense: 35 } },
    { name: "자극제 주사", description: "공격 속도와 컨트롤을 향상시키는 스팀팩", price: 400, rarity: "rare" as const, iconEmoji: "💉", statBoosts: { control: 50, attack: 30 } },
    { name: "사이오닉 크리스탈", description: "프로토스의 정신력을 증폭하는 수정", price: 500, rarity: "rare" as const, iconEmoji: "💎", statBoosts: { sense: 60, strategy: 30 } },
    { name: "저그 히드라 독침", description: "공격력을 대폭 향상시키는 독침 강화제", price: 450, rarity: "rare" as const, iconEmoji: "🦂", statBoosts: { attack: 70, harass: 20 } },
    { name: "아칸 에너지 코어", description: "모든 능력치를 균형 있게 향상시키는 에너지 코어", price: 800, rarity: "epic" as const, iconEmoji: "⚡", statBoosts: { sense: 30, control: 30, attack: 30, harass: 30 } },
    { name: "울트라리스크 갑옷", description: "수비력과 물량을 극대화하는 최강의 갑옷", price: 900, rarity: "epic" as const, iconEmoji: "🛡️", statBoosts: { defense: 80, supply: 60 } },
    { name: "캐리어 지휘 시스템", description: "전략과 견제 능력을 최고 수준으로 끌어올리는 시스템", price: 1200, rarity: "legendary" as const, iconEmoji: "🚀", statBoosts: { strategy: 100, harass: 80, scout: 50 } },
    { name: "케리건의 유산", description: "저그 여왕의 힘을 담은 전설의 유물", price: 1500, rarity: "legendary" as const, iconEmoji: "👑", statBoosts: { sense: 80, control: 80, attack: 80, supply: 80 } },
    { name: "타소니스의 검", description: "프로토스 집행관의 검에서 깃든 용맹", price: 1800, rarity: "legendary" as const, iconEmoji: "⚔️", statBoosts: { attack: 120, harass: 100, defense: 60 } },
    { name: "레이너의 C-14 라이플", description: "테란 최고의 저격수가 사용한 전설의 소총", price: 2000, rarity: "legendary" as const, iconEmoji: "🔫", statBoosts: { control: 100, scout: 100, attack: 100 } },
  ];

  for (const item of seedItems) {
    await db.insert(items).values(item);
  }
}

// ── Fatigue Management ────────────────────────────────────────────

export async function recoverFatigueIfNeeded(playerId: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const p = player[0];
  const now = new Date();
  const lastRecovery = p.lastFatigueRecovery ? new Date(p.lastFatigueRecovery) : null;

  // 자정 기준으로 회복 여부 판단
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastRecoveryDate = lastRecovery ? new Date(lastRecovery.getFullYear(), lastRecovery.getMonth(), lastRecovery.getDate()) : null;

  if (!lastRecoveryDate || lastRecoveryDate < today) {
    // 새로운 날이므로 피로도 회복
    await db
      .update(players)
      .set({ fatigue: 100, lastFatigueRecovery: now.toISOString() })
      .where(eq(players.id, playerId));
  }
}

export async function addFatigueCost(playerId: number, cost: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const newFatigue = Math.max(0, player[0].fatigue - cost);
  await db
    .update(players)
    .set({ fatigue: newFatigue })
    .where(eq(players.id, playerId));
}

export async function updateFatigue(playerId: number, amount: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const newFatigue = Math.min(100, Math.max(0, player[0].fatigue + amount));
  await db
    .update(players)
    .set({ fatigue: newFatigue })
    .where(eq(players.id, playerId));
}

export async function allocateStat(playerId: number, stat: StatKey, points: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) throw new Error("선수를 찾을 수 없습니다");
  if (player[0].statPoints < points) throw new Error("미배분 포인트가 부족합니다");

  const stats = await getPlayerStats(playerId);
  if (!stats) throw new Error("선수 능력치를 찾을 수 없습니다");

  const currentValue = stats[stat] ?? 0;
  await db.update(playerStats).set({ [stat]: currentValue + points }).where(eq(playerStats.playerId, playerId));
  await db.update(players).set({ statPoints: player[0].statPoints - points }).where(eq(players.id, playerId));
}

export async function updatePlayerPhoto(playerId: number, photoUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(players).set({ photoUrl: photoUrl }).where(eq(players.id, playerId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(users);
}

export async function updatePlayerByAdmin(playerId: number, updates: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(players).set(updates).where(eq(players.id, playerId));
}

export async function resetPlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const stats = await getPlayerStats(playerId);
  if (!stats) throw new Error("선수 능력치를 찾을 수 없습니다");

  const totalPoints = Object.values(stats).reduce((sum: number, val: any) => sum + (val || 0), 0);
  const resetStats: Record<string, number> = {};
  const statKeys: StatKey[] = ["sense", "control", "attack", "harass", "scout", "strategy", "defense", "supply"];
  statKeys.forEach((key) => {
    resetStats[key] = 0;
  });

  await db.update(playerStats).set(resetStats).where(eq(playerStats.playerId, playerId));
  await db.update(players).set({ statPoints: totalPoints }).where(eq(players.id, playerId));
}

export async function resetPlayerProgress(playerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(players).set({ level: 1, exp: 0, gold: 500 }).where(eq(players.id, playerId));
}

export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getPlayerWithUser(playerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (result.length === 0) return null;
  const player = result[0];
  const userResult = await db.select().from(users).where(eq(users.id, player.userId)).limit(1);
  const user = userResult.length > 0 ? userResult[0] : null;
  return { player, user };
}

export async function createEvent(eventData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(events).values(eventData);
  return Number((result as any).insertId);
}

export async function updateEvent(eventId: number, eventData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(events).set(eventData).where(eq(events.id, eventId));
}

export async function deleteEvent(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq(events.id, eventId));
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(events);
}

export async function getActiveEvents() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  const result = await db
    .select()
    .from(events)
    .where(and(
      eq(events.isActive, 1),
    ));
  return result;
}

export async function seedMapsIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(maps).limit(1);
  if (existing.length > 0) return;

  const seedMaps = [
    {
      name: "아이스크라운 글레이시어",
      description: "얼음으로 뒤덮인 광활한 평원",
      raceAdvantage: JSON.stringify({ terran: 1.0, zerg: 0.9, protoss: 1.1 }),
    },
    {
      name: "칼라의 계곡",
      description: "프로토스의 신성한 땅",
      raceAdvantage: JSON.stringify({ terran: 0.9, zerg: 0.8, protoss: 1.3 }),
    },
    {
      name: "저그의 소굴",
      description: "저그 종족의 본거지",
      raceAdvantage: JSON.stringify({ terran: 0.8, zerg: 1.3, protoss: 0.9 }),
    },
  ];

  for (const map of seedMaps) {
    await db.insert(maps).values(map);
  }
}

export async function getAllMaps() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(maps);
}

export async function createGame(gameData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(games).values(gameData);
  return Number((result as any).insertId);
}

export async function getGameById(gameId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function completeGame(gameId: number, winnerId: number, player1Score: number, player2Score: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(games).set({ winnerId, player1ActualScore: player1Score, player2ActualScore: player2Score, completedAt: new Date().toISOString() }).where(eq(games.id, gameId));
}

export async function createGameResult(resultData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gameResults).values(resultData);
  return Number((result as any).insertId);
}

export async function getPlayerGameHistory(playerId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(gameResults)
    .where(eq(gameResults.playerId, playerId))
    .orderBy(desc(gameResults.createdAt))
    .limit(limit);

  return Promise.all(
    result.map(async (record) => {
      const opponentPlayerId = record.opponentId;
      const opponentResult = await db.select().from(players).where(eq(players.id, opponentPlayerId)).limit(1);
      const opponent = opponentResult.length > 0 ? opponentResult[0] : null;

      const opponentRace = opponent?.race || "unknown";
      const opponentName = opponent?.name || "익명 유저";
      const opponentGrade = opponent?.grade || "D";

      return {
        ...record,
        opponentName,
        opponentRace,
        opponentGrade,
      };
    })
  );
}

export async function findOpponentByDifficulty(difficulty: string, currentPlayerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let gradeFilter: string[];
  if (difficulty === "beginner") {
    gradeFilter = ["D", "C", "B"];
  } else if (difficulty === "intermediate") {
    gradeFilter = ["B", "C", "D"];
  } else {
    gradeFilter = ["S", "A", "B"];
  }

  const allPlayers = await db.select().from(players).where(eq(players.id, currentPlayerId));
  if (allPlayers.length === 0) throw new Error("선수를 찾을 수 없습니다");

  const opponents = await db.select().from(players).where(
    and(
      eq(players.id, currentPlayerId),
    )
  );

  if (opponents.length === 0) throw new Error("상대를 찾을 수 없습니다");
  return opponents[Math.floor(Math.random() * opponents.length)];
}

export async function updatePlayerExp(playerId: number, expGained: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const newExp = player[0].exp + expGained;
  await db.update(players).set({ exp: newExp }).where(eq(players.id, playerId));
}

export async function updatePlayerGold(playerId: number, goldGained: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const newGold = player[0].gold + goldGained;
  await db.update(players).set({ gold: newGold }).where(eq(players.id, playerId));
}

export async function decreaseItemUsageCount(playerId: number) {
  const db = await getDb();
  if (!db) return;

  const playerItemsResult = await db.select().from(playerItems).where(eq(playerItems.playerId, playerId));
  for (const pi of playerItemsResult) {
    if (pi.usageCount > 0) {
      await db.update(playerItems).set({ usageCount: pi.usageCount - 1 }).where(eq(playerItems.id, pi.id));
    }
  }
}

export async function getPlayerGameRecord(playerId: number) {
  const db = await getDb();
  if (!db) return null;

  const results = await db.select().from(gameResults).where(eq(gameResults.playerId, playerId));
  const wins = results.filter((r) => r.isWinner === 1).length;
  const losses = results.length - wins;

  return { wins, losses, total: results.length };
}

export async function getPlayerGrade(playerId: number) {
  const db = await getDb();
  if (!db) return "D";

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return player.length > 0 ? player[0].grade : "D";
}

export async function ensurePlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId)).limit(1);
  if (existing.length > 0) return;

  await db.insert(playerStats).values({
    playerId,
    sense: 0,
    control: 0,
    attack: 0,
    harass: 0,
    scout: 0,
    strategy: 0,
    defense: 0,
    supply: 0,
  });
}

export async function applyGameStatChange(playerId: number, stat: StatKey, amount: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stats = await getPlayerStats(playerId);
  if (!stats) throw new Error("선수 능력치를 찾을 수 없습니다");

  const currentValue = stats[stat] ?? 0;
  await db.update(playerStats).set({ [stat]: currentValue + amount }).where(eq(playerStats.playerId, playerId));
}

export async function getPlayerById(playerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllPlayers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(players);
}

export async function getAllRealUsers() {
  const db = await getDb();
  if (!db) return [];
  // 실제 사용자만 조회 (users 테이블에서 role이 'user' 또는 'admin'인 사용자)
  const realUsers = await db.select().from(users);
  return realUsers;
}

export async function getAllPlayersWithUsers() {
  const db = await getDb();
  if (!db) return [];
  // 실제 사용자의 선수만 조회
  const result = await db.select().from(players).innerJoin(users, eq(players.userId, users.id));
  return result.map(r => r.players);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : null;
}
