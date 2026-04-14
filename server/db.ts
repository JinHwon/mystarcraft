import { eq, and, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, items, playerItems, players, playerStats, users, events, maps, games, gameResults } from "../drizzle/schema";
import { ENV } from "./_core/env";

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
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ── Player Queries ──────────────────────────────────────────────

export async function getPlayerByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(players).where(eq(players.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getPlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createPlayer(data: {
  userId: number;
  name: string;
  race: "terran" | "zerg" | "protoss";
  photoUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(players).values({
    userId: data.userId,
    name: data.name,
    race: data.race,
    photoUrl: data.photoUrl ?? null,
    level: 1,
    exp: 0,
    expToNext: 100,
    statPoints: 0,
    gold: 1000,
  });
  const playerId = (result as any).insertId as number;
  await db.insert(playerStats).values({
    playerId,
    sense: 500,
    control: 500,
    attack: 500,
    harass: 500,
    strategy: 500,
    supply: 500,
    defense: 500,
    scout: 500,
  });
  return playerId;
}

export async function updatePlayerPhoto(playerId: number, photoUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(players).set({ photoUrl }).where(eq(players.id, playerId));
}

export async function allocateStat(
  playerId: number,
  statKey: string,
  points: number,
  currentStatPoints: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (currentStatPoints < points) throw new Error("포인트가 부족합니다");

  const validKeys = ["sense", "control", "attack", "harass", "strategy", "supply", "defense", "scout"];
  if (!validKeys.includes(statKey)) throw new Error("유효하지 않은 능력치 항목입니다");

  // 현재 능력치 조회 후 최대값 체크
  const stats = await getPlayerStats(playerId);
  if (!stats) throw new Error("능력치 정보를 찾을 수 없습니다");
  const current = (stats as any)[statKey] as number;
  const newVal = Math.min(current + points, 1200);
  const actualPoints = newVal - current;

  await db.update(playerStats).set({ [statKey]: newVal }).where(eq(playerStats.playerId, playerId));
  await db.update(players).set({ statPoints: currentStatPoints - actualPoints }).where(eq(players.id, playerId));
  return { newVal, usedPoints: actualPoints };
}

// ── Item Queries ─────────────────────────────────────────────────

export async function getAllItems() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(items);
}

export async function getPlayerItems(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      playerItemId: playerItems.id,
      equipped: playerItems.equipped,
      purchasedAt: playerItems.purchasedAt,
      item: items,
    })
    .from(playerItems)
    .innerJoin(items, eq(playerItems.itemId, items.id))
    .where(eq(playerItems.playerId, playerId));
  return result;
}

export async function buyItem(playerId: number, itemId: number, playerGold: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const itemResult = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!itemResult.length) throw new Error("아이템을 찾을 수 없습니다");
  const item = itemResult[0];

  // 이미 보유 중인지 확인
  const existing = await db
    .select()
    .from(playerItems)
    .where(and(eq(playerItems.playerId, playerId), eq(playerItems.itemId, itemId)))
    .limit(1);
  if (existing.length > 0) throw new Error("이미 보유한 아이템입니다");

  if (playerGold < item.price) throw new Error("골드가 부족합니다");

  await db.insert(playerItems).values({ playerId, itemId, equipped: false });
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
    .set({ equipped: equip })
    .where(and(eq(playerItems.id, playerItemId), eq(playerItems.playerId, playerId)));
}

// ── Seed Items ───────────────────────────────────────────────────

export async function seedItemsIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(items).limit(1);
  if (existing.length > 0) return;

  const seedItems = [
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
      .set({ fatigue: 100, lastFatigueRecovery: now })
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


// ── Admin Functions ──────────────────────────────────────────────

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  const userList = await db.select().from(users);
  // 각 사용자에 대해 선수 정보 조회
  const usersWithPlayers = await Promise.all(
    userList.map(async (user) => {
      const playerResult = await db.select().from(players).where(eq(players.userId, user.id)).limit(1);
      return {
        ...user,
        playerId: playerResult.length > 0 ? playerResult[0].id : null,
      };
    })
  );
  return usersWithPlayers;
}

export async function updatePlayerByAdmin(playerId: number, updates: {
  gold?: number;
  level?: number;
  exp?: number;
  statPoints?: number;
  fatigue?: number;
}) {
  const db = await getDb();
  if (!db) return;

  const updateSet: Record<string, unknown> = {};
  if (updates.gold !== undefined) updateSet.gold = updates.gold;
  if (updates.level !== undefined) updateSet.level = updates.level;
  if (updates.exp !== undefined) updateSet.exp = updates.exp;
  if (updates.statPoints !== undefined) updateSet.statPoints = updates.statPoints;
  if (updates.fatigue !== undefined) updateSet.fatigue = updates.fatigue;

  if (Object.keys(updateSet).length > 0) {
    await db.update(players).set(updateSet).where(eq(players.id, playerId));
  }
}

export async function resetPlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) return;

  const STAT_KEYS = ["sense", "control", "attack", "harass", "strategy", "supply", "defense", "scout"];
  const resetStats: Record<string, number> = {};
  STAT_KEYS.forEach(key => {
    resetStats[key] = 500;
  });

  await db.update(playerStats).set(resetStats).where(eq(playerStats.playerId, playerId));
}

export async function resetPlayerProgress(playerId: number) {
  const db = await getDb();
  if (!db) return;

  await db.update(players).set({
    level: 1,
    exp: 0,
    statPoints: 0,
    fatigue: 100,
  }).where(eq(players.id, playerId));

  await resetPlayerStats(playerId);
}

// ── Event Functions ──────────────────────────────────────────────

export async function createEvent(eventData: {
  type: "exp_double" | "fatigue_unlimited" | "gold_double" | "stat_boost";
  name: string;
  description?: string;
  isActive?: boolean;
  startTime?: Date;
  endTime?: Date;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(events).values({
    type: eventData.type,
    name: eventData.name,
    description: eventData.description,
    isActive: eventData.isActive ?? false,
    startTime: eventData.startTime,
    endTime: eventData.endTime,
  });
}

export async function updateEvent(eventId: number, updates: {
  isActive?: boolean;
  startTime?: Date;
  endTime?: Date;
  name?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) return;

  const updateSet: Record<string, unknown> = {};
  if (updates.isActive !== undefined) updateSet.isActive = updates.isActive;
  if (updates.startTime !== undefined) updateSet.startTime = updates.startTime;
  if (updates.endTime !== undefined) updateSet.endTime = updates.endTime;
  if (updates.name !== undefined) updateSet.name = updates.name;
  if (updates.description !== undefined) updateSet.description = updates.description;

  if (Object.keys(updateSet).length > 0) {
    await db.update(events).set(updateSet).where(eq(events.id, eventId));
  }
}

export async function deleteEvent(eventId: number) {
  const db = await getDb();
  if (!db) return;
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
  return await db.select().from(events).where(eq(events.isActive, true));
}


export async function updateUserRole(userId: number, role: "admin" | "user") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function getPlayerWithUser(playerId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!result.length) return null;
  const player = result[0];
  const user = await db.select().from(users).where(eq(users.id, player.userId)).limit(1);
  return { player, user: user[0] ?? null };
}


// ── 맵 관련 함수 ────────────────────────────────────────────────────────────

export async function seedMapsIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(maps).limit(1);
  if (existing.length > 0) return;
  
  const mapsData = [
    {
      name: "네오일드트릭셋",
      description: "균형잡힌 맵",
      raceAdvantage: JSON.stringify({ terran: 50, zerg: 50, protoss: 50 }),
      rushDistance: 50,
      resources: 50,
      complexity: 50,
      iconEmoji: "🗺️",
    },
    {
      name: "스카이 테라스",
      description: "높이 차이가 많은 맵",
      raceAdvantage: JSON.stringify({ terran: 55, zerg: 45, protoss: 50 }),
      rushDistance: 60,
      resources: 45,
      complexity: 65,
      iconEmoji: "⛰️",
    },
    {
      name: "용암 분화구",
      description: "자원이 풍부한 맵",
      raceAdvantage: JSON.stringify({ terran: 48, zerg: 52, protoss: 50 }),
      rushDistance: 40,
      resources: 70,
      complexity: 45,
      iconEmoji: "🌋",
    },
    {
      name: "얼음 계곡",
      description: "좁은 통로, 빠른 러쉬",
      raceAdvantage: JSON.stringify({ terran: 45, zerg: 55, protoss: 50 }),
      rushDistance: 30,
      resources: 40,
      complexity: 60,
      iconEmoji: "❄️",
    },
  ];
  
  for (const mapData of mapsData) {
    await db.insert(maps).values(mapData as any);
  }
}

export async function getAllMaps() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(maps);
}

// ── 게임 관련 함수 ────────────────────────────────────────────────────────────

export async function createGame(gameData: {
  player1Id: number;
  player2Id: number;
  mapId: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  player1Race: "terran" | "zerg" | "protoss";
  player2Race: "terran" | "zerg" | "protoss";
  player1WinProbability: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(games).values(gameData as any);
  return result;
}

export async function getGameById(gameId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  return result[0] ?? null;
}

export async function completeGame(gameId: number, winnerId: number, player1Score: number, player2Score: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(games).set({
    winnerId,
    player1ActualScore: player1Score,
    player2ActualScore: player2Score,
    completedAt: new Date(),
  }).where(eq(games.id, gameId));
}

export async function createGameResult(resultData: {
  gameId: number;
  playerId: number;
  isWinner: boolean;
  expGained: number;
  goldGained: number;
  statChanges: Record<string, number>;
  fatigueUsed: number;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(gameResults).values({
    ...resultData,
    statChanges: JSON.stringify(resultData.statChanges),
  } as any);
  return result;
}

export async function getPlayerGameHistory(playerId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(gameResults)
    .where(eq(gameResults.playerId, playerId))
    .limit(limit);
}

// 난이도별 상대 찾기
export async function findOpponentByDifficulty(
  currentPlayerId: number,
  difficulty: "beginner" | "intermediate" | "advanced",
  gradeIndex: number
) {
  const db = await getDb();
  if (!db) return null;
  
  // 난이도별 등급 범위
  const ranges = {
    beginner: { min: 0, max: 2 },
    intermediate: { min: 2, max: 4 },
    advanced: { min: 4, max: 7 },
  };
  
  const range = ranges[difficulty];
  
  // 같은 난이도 범위의 다른 선수 찾기
  const allPlayers = await db.select().from(players);
  const candidates = allPlayers.filter(p => p.id !== currentPlayerId);
  
  // 필터링: 난이도 범위에 맞는 선수 찾기
  // (실제 등급 계산은 클라이언트에서 수행)
  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}


// ── 연습게임 관련 함수 ────────────────────────────────────────────────────────

export async function getAllPlayers() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(players);
}

export async function updatePlayerExp(playerId: number, expGain: number) {
  const db = await getDb();
  if (!db) return;
  
  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player.length) return;
  
  const currentPlayer = player[0];
  let newExp = currentPlayer.exp + expGain;
  let newLevel = currentPlayer.level;
  let newStatPoints = currentPlayer.statPoints;
  
  // 레벨업 처리
  while (newExp >= currentPlayer.expToNext) {
    newExp -= currentPlayer.expToNext;
    newLevel += 1;
    newStatPoints += 20; // 레벨당 20포인트
  }
  
  await db.update(players).set({
    exp: newExp,
    level: newLevel,
    statPoints: newStatPoints,
  }).where(eq(players.id, playerId));
}

export async function updatePlayerGold(playerId: number, goldGain: number) {
  const db = await getDb();
  if (!db) return;
  
  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player.length) return;
  
  const newGold = Math.max(0, player[0].gold + goldGain);
  await db.update(players).set({ gold: newGold }).where(eq(players.id, playerId));
}

