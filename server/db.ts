import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, items, playerItems, players, playerStats, users, events, maps, games, gameResults, quests, playerQuestProgress } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { StatKey } from "@shared/gameConstants";
import { desc, eq, and, ne, sql } from "drizzle-orm";

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

export async function createPlayer(userId: number, playerData: { name: string; race: string; photo?: string }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(players).values({
    userId,
    name: playerData.name,
    race: playerData.race as "terran" | "zerg" | "protoss",
    photoUrl: playerData.photo || null,
    gold: 500,
    level: 1,
    exp: 0,
    statPoints: 0,
    fatigue: 100,
    grade: "D",
  });
  return Number((result as any)[0]?.insertId ?? (result as any).insertId);
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
    // 현재 피로도 확인
    const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (player.length === 0) throw new Error("플레이어를 찾을 수 없습니다");
    
    // 피로도 100 이상이면 사용 불가
    if (player[0].fatigue >= 100) {
      throw new Error("피로도가 100 이상이면 사용할 수 없습니다");
    }
    
    // 골드만 차감
    await db.update(players).set({ gold: playerGold - item.price }).where(eq(players.id, playerId));
    
    // 피로도 회복
    const newFatigue = Math.min(100, player[0].fatigue + item.fatigueRecover);
    await db.update(players).set({ fatigue: newFatigue }).where(eq(players.id, playerId));
    
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

  // 착용 시 사용 횟수 체크
  if (equip) {
    const item = await db.select().from(playerItems).where(and(eq(playerItems.id, playerItemId), eq(playerItems.playerId, playerId))).limit(1);
    if (item.length > 0 && item[0].usageCount <= 0) {
      throw new Error("사용 횟수가 소진된 아이템은 착용할 수 없습니다");
    }
  }

  await db
    .update(playerItems)
    .set({ equipped: equip ? 1 : 0 })
    .where(and(eq(playerItems.id, playerItemId), eq(playerItems.playerId, playerId)));
}

// ── Seed Items ───────────────────────────────────────────────────

export async function seedItemsIfEmpty() {
  const db = await getDb();
  if (!db) return;

  // 기존 아이템 이름 목록 조회
  const existingItems = await db.select({ name: items.name }).from(items);
  const existingNames = new Set(existingItems.map(i => i.name));

  const seedItems = [
    // ── 피로도 회복 아이템 ──
    { name: "에너지 드링크", description: "피로도를 10 회복하는 에너지 드링크", price: 50, rarity: "common" as const, iconEmoji: "🥤", statBoosts: {}, fatigueRecover: 10 },
    { name: "고급 에너지 드링크", description: "피로도를 25 회복하는 프리미엄 드링크", price: 150, rarity: "rare" as const, iconEmoji: "🧃", statBoosts: {}, fatigueRecover: 25 },
    { name: "풀 회복 물약", description: "피로도를 50 회복하는 특제 물약", price: 400, rarity: "epic" as const, iconEmoji: "🧪", statBoosts: {}, fatigueRecover: 50 },
    { name: "불사의 영약", description: "피로도를 완전히 회복하는 전설의 영약", price: 800, rarity: "legendary" as const, iconEmoji: "✨", statBoosts: {}, fatigueRecover: 100 },

    // ── 일반 능력치 아이템 ──
    { name: "스캔 모듈", description: "정찰 능력을 향상시키는 첨단 스캔 장비", price: 200, rarity: "common" as const, iconEmoji: "🔭", statBoosts: { scout: 30 }, fatigueRecover: 0 },
    { name: "전술 지휘봉", description: "전략적 판단력을 높이는 지휘 도구", price: 250, rarity: "common" as const, iconEmoji: "📡", statBoosts: { strategy: 40 }, fatigueRecover: 0 },
    { name: "마린 헬멧", description: "방어력을 강화하는 테란 표준 헬멧", price: 200, rarity: "common" as const, iconEmoji: "⛑️", statBoosts: { defense: 35 }, fatigueRecover: 0 },
    { name: "저글링 발톱", description: "공격 속도를 높이는 저글링의 발톱", price: 200, rarity: "common" as const, iconEmoji: "🦎", statBoosts: { attack: 30 }, fatigueRecover: 0 },
    { name: "프로브 코어", description: "경제 감각을 높이는 프로토스 코어", price: 250, rarity: "common" as const, iconEmoji: "💠", statBoosts: { sense: 35 }, fatigueRecover: 0 },
    { name: "벌쳐 엔진", description: "견제 능력을 향상시키는 벌쳐 엔진", price: 250, rarity: "common" as const, iconEmoji: "🏍️", statBoosts: { harass: 35 }, fatigueRecover: 0 },
    { name: "오버로드 눈", description: "시야를 넓혀주는 오버로드의 눈", price: 200, rarity: "common" as const, iconEmoji: "👁️", statBoosts: { scout: 25, sense: 15 }, fatigueRecover: 0 },

    // ── 희귀 능력치 아이템 ──
    { name: "자극제 주사", description: "공격 속도와 컨트롤을 향상시키는 스팀팩", price: 400, rarity: "rare" as const, iconEmoji: "💉", statBoosts: { control: 50, attack: 30 }, fatigueRecover: 0 },
    { name: "사이오닉 크리스탈", description: "프로토스의 정신력을 증폭하는 수정", price: 500, rarity: "rare" as const, iconEmoji: "💎", statBoosts: { sense: 60, strategy: 30 }, fatigueRecover: 0 },
    { name: "저그 히드라 독침", description: "공격력을 대폭 향상시키는 독침 강화제", price: 450, rarity: "rare" as const, iconEmoji: "🦂", statBoosts: { attack: 70, harass: 20 }, fatigueRecover: 0 },
    { name: "시즈탱크 조준경", description: "정밀 사격 능력을 높이는 조준 장비", price: 500, rarity: "rare" as const, iconEmoji: "🎯", statBoosts: { attack: 40, control: 40 }, fatigueRecover: 0 },
    { name: "드래군 사거리 모듈", description: "원거리 공격 능력을 강화하는 모듈", price: 450, rarity: "rare" as const, iconEmoji: "🔫", statBoosts: { attack: 50, defense: 30 }, fatigueRecover: 0 },
    { name: "뮤탈리스크 날개", description: "기동력과 견제 능력을 높이는 날개", price: 500, rarity: "rare" as const, iconEmoji: "🦅", statBoosts: { harass: 60, scout: 30 }, fatigueRecover: 0 },
    { name: "해처리 유전자", description: "물량 생산 능력을 높이는 유전자 강화제", price: 450, rarity: "rare" as const, iconEmoji: "🧬", statBoosts: { supply: 60, sense: 20 }, fatigueRecover: 0 },

    // ── 영웅 능력치 아이템 ──
    { name: "아칸 에너지 코어", description: "모든 능력치를 균형 있게 향상시키는 에너지 코어", price: 800, rarity: "epic" as const, iconEmoji: "⚡", statBoosts: { sense: 30, control: 30, attack: 30, harass: 30 }, fatigueRecover: 0 },
    { name: "울트라리스크 갑옷", description: "수비력과 물량을 극대화하는 최강의 갑옷", price: 900, rarity: "epic" as const, iconEmoji: "🛡️", statBoosts: { defense: 80, supply: 60 }, fatigueRecover: 0 },
    { name: "리버 스캐럽 팩", description: "강력한 스플래시 공격력을 부여하는 스캐럽", price: 850, rarity: "epic" as const, iconEmoji: "💣", statBoosts: { attack: 80, strategy: 40 }, fatigueRecover: 0 },
    { name: "아비터 클로킹 장치", description: "전략과 센스를 극대화하는 클로킹 기술", price: 900, rarity: "epic" as const, iconEmoji: "🌀", statBoosts: { strategy: 70, sense: 50, scout: 30 }, fatigueRecover: 0 },
    { name: "디파일러 독안개", description: "수비와 전략을 극대화하는 다크 스웜", price: 850, rarity: "epic" as const, iconEmoji: "🌫️", statBoosts: { defense: 70, strategy: 60, supply: 30 }, fatigueRecover: 0 },
    { name: "하이템플러 사이오닉", description: "컨트롤과 공격을 극대화하는 사이오닉 에너지", price: 900, rarity: "epic" as const, iconEmoji: "🔮", statBoosts: { control: 70, attack: 50, sense: 30 }, fatigueRecover: 0 },

    // ── 전설 능력치 아이템 ──
    { name: "캐리어 지휘 시스템", description: "전략과 견제 능력을 최고 수준으로 끌어올리는 시스템", price: 1500, rarity: "legendary" as const, iconEmoji: "🚀", statBoosts: { strategy: 100, harass: 80, scout: 50 }, fatigueRecover: 0 },
    { name: "케리건의 유산", description: "저그 여왕의 힘을 담은 전설의 유물", price: 2000, rarity: "legendary" as const, iconEmoji: "👑", statBoosts: { sense: 80, control: 80, attack: 80, supply: 80 }, fatigueRecover: 0 },
    { name: "타사다르의 검", description: "프로토스 집행관의 검에서 깃든 용맹", price: 2000, rarity: "legendary" as const, iconEmoji: "⚔️", statBoosts: { attack: 120, harass: 100, defense: 60 }, fatigueRecover: 0 },
    { name: "레이너의 C-14 라이플", description: "테란 최고의 저격수가 사용한 전설의 소총", price: 2500, rarity: "legendary" as const, iconEmoji: "🔫", statBoosts: { control: 100, scout: 100, attack: 100 }, fatigueRecover: 0 },
    { name: "제라툴의 워프 블레이드", description: "다크템플러 지도자의 전설적인 무기", price: 2500, rarity: "legendary" as const, iconEmoji: "🗡️", statBoosts: { attack: 100, harass: 100, sense: 80 }, fatigueRecover: 0 },
    { name: "아르타니스의 방패", description: "프로토스 대의회 의장의 불멸의 방패", price: 2500, rarity: "legendary" as const, iconEmoji: "🛡️", statBoosts: { defense: 120, strategy: 100, supply: 80 }, fatigueRecover: 0 },
    { name: "오버마인드의 의지", description: "저그 오버마인드의 정신력을 담은 유물. 모든 능력치 대폭 상승", price: 3000, rarity: "legendary" as const, iconEmoji: "🧠", statBoosts: { sense: 100, control: 100, strategy: 100, supply: 100 }, fatigueRecover: 0 },

    // ── 특수 아이템 (능력치 + 피로도) ──
    { name: "메딕의 치료 키트", description: "피로도 15 회복 + 수비력 향상", price: 350, rarity: "rare" as const, iconEmoji: "🏥", statBoosts: { defense: 30 }, fatigueRecover: 15 },
    { name: "프로토스 실드 배터리", description: "피로도 20 회복 + 방어력 향상", price: 500, rarity: "rare" as const, iconEmoji: "🔋", statBoosts: { defense: 40, sense: 20 }, fatigueRecover: 20 },
    { name: "저그 여왕의 축복", description: "피로도 30 회복 + 물량/센스 향상", price: 700, rarity: "epic" as const, iconEmoji: "🐛", statBoosts: { supply: 40, sense: 30 }, fatigueRecover: 30 },

    // ── 추가 일반 아이템 ──
    { name: "고스트 클로킹 장치", description: "은밀한 정찰 능력을 부여하는 클로킹 기술", price: 300, rarity: "common" as const, iconEmoji: "👻", statBoosts: { scout: 40, harass: 15 }, fatigueRecover: 0 },
    { name: "파이어뱃 화염방사기", description: "근접 전투력을 높이는 화염 무기", price: 250, rarity: "common" as const, iconEmoji: "🔥", statBoosts: { attack: 35, defense: 10 }, fatigueRecover: 0 },
    { name: "드론 채취 모듈", description: "자원 채취 효율을 높이는 모듈", price: 200, rarity: "common" as const, iconEmoji: "⛏️", statBoosts: { supply: 30, sense: 10 }, fatigueRecover: 0 },
    { name: "질럿 사이블레이드", description: "근접 전투의 달인이 되는 사이블레이드", price: 280, rarity: "common" as const, iconEmoji: "⚔️", statBoosts: { attack: 25, control: 20 }, fatigueRecover: 0 },
    { name: "SCV 수리 키트", description: "건물 수리 속도를 높이는 도구", price: 180, rarity: "common" as const, iconEmoji: "🔧", statBoosts: { defense: 25, supply: 15 }, fatigueRecover: 0 },

    // ── 추가 희귀 아이템 ──
    { name: "발키리 미사일 팩", description: "광역 공격력을 부여하는 미사일 시스템", price: 480, rarity: "rare" as const, iconEmoji: "🚀", statBoosts: { attack: 55, harass: 25 }, fatigueRecover: 0 },
    { name: "럴커 가시 강화제", description: "매복 공격력을 극대화하는 강화제", price: 520, rarity: "rare" as const, iconEmoji: "🦔", statBoosts: { defense: 50, attack: 35 }, fatigueRecover: 0 },
    { name: "옵저버 센서 어레이", description: "은폐 유닛 탐지 능력을 높이는 센서", price: 450, rarity: "rare" as const, iconEmoji: "📡", statBoosts: { scout: 55, sense: 30 }, fatigueRecover: 0 },
    { name: "배틀크루저 야마토 포", description: "강력한 단일 타격 능력을 부여", price: 550, rarity: "rare" as const, iconEmoji: "💥", statBoosts: { attack: 65, strategy: 20 }, fatigueRecover: 0 },
    { name: "코르세어 디스럽션 웹", description: "적 공중 유닛을 무력화하는 기술", price: 480, rarity: "rare" as const, iconEmoji: "🕸️", statBoosts: { control: 45, defense: 35 }, fatigueRecover: 0 },

    // ── 추가 영웅 아이템 ──
    { name: "사이언스 베슬 이레디에이트", description: "적 생체 유닛을 녹이는 방사능 무기", price: 850, rarity: "epic" as const, iconEmoji: "☢️", statBoosts: { attack: 60, strategy: 50, sense: 25 }, fatigueRecover: 0 },
    { name: "가디언 아스펙트", description: "공중에서 지상을 폭격하는 변태 능력", price: 880, rarity: "epic" as const, iconEmoji: "🐉", statBoosts: { attack: 70, harass: 50, scout: 20 }, fatigueRecover: 0 },
    { name: "다크 아칸 마엘스트롬", description: "적 생체 유닛을 마비시키는 사이오닉", price: 920, rarity: "epic" as const, iconEmoji: "🌊", statBoosts: { control: 65, defense: 55, sense: 25 }, fatigueRecover: 0 },
    { name: "인페스티드 테란 폭탄", description: "자폭 공격으로 적진을 초토화", price: 800, rarity: "epic" as const, iconEmoji: "💀", statBoosts: { attack: 75, harass: 55 }, fatigueRecover: 0 },

    // ── 추가 전설 아이템 ──
    { name: "멩스크의 황제 왕관", description: "테란 황제의 카리스마가 깃든 왕관. 전략과 센스 극대화", price: 2800, rarity: "legendary" as const, iconEmoji: "👑", statBoosts: { strategy: 110, sense: 90, defense: 70 }, fatigueRecover: 0 },
    { name: "피닉스의 불멸 갑옷", description: "전설의 프로토스 영웅의 갑옷. 죽음도 두렵지 않다", price: 2500, rarity: "legendary" as const, iconEmoji: "🦾", statBoosts: { defense: 120, attack: 80, control: 60 }, fatigueRecover: 0 },
    { name: "듀란의 비밀 연구 자료", description: "사미르 듀란의 극비 연구. 모든 능력을 균형있게 강화", price: 3000, rarity: "legendary" as const, iconEmoji: "📜", statBoosts: { sense: 80, control: 80, strategy: 80, scout: 80 }, fatigueRecover: 0 },

    // ── 추가 특수 아이템 (능력치 + 피로도) ──
    { name: "테란 보급품 상자", description: "피로도 10 회복 + 물량 향상", price: 300, rarity: "common" as const, iconEmoji: "📦", statBoosts: { supply: 25 }, fatigueRecover: 10 },
    { name: "프로토스 넥서스 에너지", description: "피로도 25 회복 + 전략/센스 향상", price: 600, rarity: "rare" as const, iconEmoji: "💫", statBoosts: { strategy: 30, sense: 25 }, fatigueRecover: 25 },
    { name: "저그 진화 촉매제", description: "피로도 40 회복 + 공격/컨트롤 향상", price: 900, rarity: "epic" as const, iconEmoji: "🧫", statBoosts: { attack: 45, control: 35 }, fatigueRecover: 40 },
  ];

  for (const item of seedItems) {
    if (!existingNames.has(item.name)) {
      await db.insert(items).values(item);
    }
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

  // KST(UTC+9) 기준 자정으로 회복 여부 판단
  const kstOffset = 9 * 60; // KST는 UTC+9
  const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);
  const todayKST = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(kstNow.getUTCDate()).padStart(2, '0')}`;

  let lastRecoveryKST: string | null = null;
  if (lastRecovery) {
    const kstLast = new Date(lastRecovery.getTime() + kstOffset * 60 * 1000);
    lastRecoveryKST = `${kstLast.getUTCFullYear()}-${String(kstLast.getUTCMonth() + 1).padStart(2, '0')}-${String(kstLast.getUTCDate()).padStart(2, '0')}`;
  }

  if (!lastRecoveryKST || lastRecoveryKST < todayKST) {
    // KST 기준 새로운 날이므로 피로도 회복
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
  if (!db) throw new Error("Database not available");
  
  try {
    // 모든 사용자 반환 (선수가 있는 경우 playerId와 선수 이름 포함)
    const usersWithPlayers = await db
      .select({ users: users, playerId: players.id, playerName: players.name })
      .from(users)
      .leftJoin(players, eq(users.id, players.userId));
    
    return usersWithPlayers.map(row => ({ 
      ...row.users, 
      playerId: row.playerId ?? null,
      playerName: row.playerName ?? null,
      // name이 null이면 playerName 또는 email에서 추출
      name: row.users.name || row.playerName || row.users.email?.split('@')[0] || `사용자#${row.users.id}`,
    }));
  } catch (error) {
    console.error("[Database] getAllUsers failed:", error);
    throw error;
  }
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
  const normalizedData = {
    ...eventData,
    startTime: eventData.startTime instanceof Date ? eventData.startTime.toISOString() : eventData.startTime,
    endTime: eventData.endTime instanceof Date ? eventData.endTime.toISOString() : eventData.endTime,
  };
  const result = await db.insert(events).values(normalizedData);
  return Number((result as any)[0]?.insertId ?? (result as any).insertId);
}

export async function updateEvent(eventId: number, eventData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedData = {
    ...eventData,
    startTime: eventData.startTime instanceof Date ? eventData.startTime.toISOString() : eventData.startTime,
    endTime: eventData.endTime instanceof Date ? eventData.endTime.toISOString() : eventData.endTime,
  };
  await db.update(events).set(normalizedData).where(eq(events.id, eventId));
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
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  return Number(insertId);
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
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  return Number(insertId);
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
      let opponentName = "익명 유저";
      let opponentRace = "unknown";
      let opponentGrade = "D";
      let isAiOpponent = false;

      if (opponentPlayerId === 0) {
        // AI 상대
        isAiOpponent = true;
        opponentName = "AI 상대";
        
        // 게임 테이블에서 종족 정보 가져오기
        if (record.gameId) {
          const gameResult = await db.select().from(games).where(eq(games.id, record.gameId)).limit(1);
          if (gameResult.length > 0) {
            const game = gameResult[0];
            opponentRace = game.player1Id === playerId ? game.player2Race : game.player1Race;
          }
        }
        opponentGrade = "AI";
      } else if (opponentPlayerId && opponentPlayerId > 0) {
        // 1. 상대 선수 정보에서 이름/종족 조회
        const opponentResult = await db.select().from(players).where(eq(players.id, opponentPlayerId)).limit(1);
        if (opponentResult.length > 0) {
          const opponent = opponentResult[0];
          opponentName = opponent.name;
          opponentRace = opponent.race;
          opponentGrade = opponent.grade;
        }
      }

      // 2. 선수 정보가 없으면 게임 테이블에서 종족 정보 가져오기
      if (opponentRace === "unknown" && record.gameId) {
        const gameResult = await db.select().from(games).where(eq(games.id, record.gameId)).limit(1);
        if (gameResult.length > 0) {
          const game = gameResult[0];
          // 현재 플레이어가 player1이면 상대는 player2, 반대도 마찬가지
          if (game.player1Id === playerId) {
            opponentRace = game.player2Race;
          } else {
            opponentRace = game.player1Race;
          }
        }
      }

      return {
        ...record,
        statChanges: record.statChanges,
        opponentName,
        opponentRace,
        opponentGrade,
        isAiOpponent,
      };
    })
  );
}

export async function findOpponentByDifficulty(difficulty: string, currentPlayerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 난이도별 상대 등급 범위 (상대방 등급 기준)
  // 초보: F~D (index 0~2), 중수: D~B (index 2~4), 고수: B~SSS (index 4~8)
  const { DIFFICULTY_RANGES, calcTotalStats, calcGradeIndex, STAT_KEYS } = await import("@shared/gameConstants");
  const range = DIFFICULTY_RANGES[difficulty as keyof typeof DIFFICULTY_RANGES];
  if (!range) throw new Error("잘못된 난이도입니다");

  // 자신을 제외한 모든 플레이어 조회
  const opponents = await db.select().from(players)
    .where(ne(players.id, currentPlayerId))
    .limit(200);

  if (opponents.length === 0) return null;
  
  // 상대방의 등급을 계산하여 난이도 범위에 맞는 상대만 필터링
  const validOpponents = [];
  for (const opponent of opponents) {
    const stats = await db.select().from(playerStats)
      .where(eq(playerStats.playerId, opponent.id))
      .limit(1);
    
    if (stats.length === 0) continue;
    
    const totalStats = STAT_KEYS.reduce((sum: number, key: string) => sum + ((stats[0] as any)[key] || 0), 0);
    const gradeIndex = calcGradeIndex(totalStats);
    
    if (gradeIndex >= range.minIndex && gradeIndex <= range.maxIndex) {
      validOpponents.push(opponent);
    }
  }

  if (validOpponents.length === 0) return null;
  
  // 랜덤 선택
  return validOpponents[Math.floor(Math.random() * validOpponents.length)];
}

export async function updatePlayerExp(playerId: number, expGained: number) {
  const db = await getDb();
  if (!db) return;

  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (player.length === 0) return;

  const { calcExpToNext, LEVEL_MAX } = await import("@shared/gameConstants");

  let { exp, level, expToNext, statPoints } = player[0];
  exp += expGained;

  // 레벨업 처리 (최대 레벨 제한)
  while (level < LEVEL_MAX && exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = calcExpToNext(level);
    statPoints += 20;
  }

  // 최대 레벨이면 경험치 초과분 제거
  if (level >= LEVEL_MAX) {
    exp = 0;
    expToNext = 0;
  }

  await db.update(players).set({ exp, level, expToNext, statPoints }).where(eq(players.id, playerId));
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

  // 착용 중인 아이템만 사용 횟수 감소
  const playerItemsResult = await db.select().from(playerItems).where(
    and(eq(playerItems.playerId, playerId), eq(playerItems.equipped, 1))
  );
  for (const pi of playerItemsResult) {
    if (pi.usageCount > 0) {
      const newCount = pi.usageCount - 1;
      if (newCount <= 0) {
        // 사용 횟수가 0이 되면 아이템 삭제
        await db.delete(playerItems).where(eq(playerItems.id, pi.id));
      } else {
        await db.update(playerItems).set({ usageCount: newCount }).where(eq(playerItems.id, pi.id));
      }
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
  if (existing.length > 0) return existing[0];

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

  const created = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId)).limit(1);
  return created[0];
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

export async function getRankingList() {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select({
      player: players,
      stats: playerStats,
      lastSignedIn: users.lastSignedIn,
    })
    .from(players)
    .innerJoin(users, eq(players.userId, users.id))
    .leftJoin(playerStats, eq(players.id, playerStats.playerId));

  const { calcGrade } = await import("@shared/gameConstants");

  // 각 플레이어의 전적 및 아이템 보너스 조회
  const rankings = [];
  for (const row of result) {
    // 착용 아이템 보너스 계산
    const equippedItemsResult = await db
      .select({ item: items, equipped: playerItems.equipped })
      .from(playerItems)
      .innerJoin(items, eq(playerItems.itemId, items.id))
      .where(and(eq(playerItems.playerId, row.player.id), eq(playerItems.equipped, 1)));

    const itemBoosts: Record<string, number> = {};
    equippedItemsResult.forEach((pi) => {
      const boosts = (pi.item?.statBoosts ?? {}) as Record<string, number>;
      Object.entries(boosts).forEach(([k, v]) => {
        itemBoosts[k] = (itemBoosts[k] ?? 0) + (v ?? 0);
      });
    });

    const sense = Math.min((row.stats?.sense ?? 0) + (itemBoosts.sense ?? 0), 1200);
    const control = Math.min((row.stats?.control ?? 0) + (itemBoosts.control ?? 0), 1200);
    const attack = Math.min((row.stats?.attack ?? 0) + (itemBoosts.attack ?? 0), 1200);
    const harass = Math.min((row.stats?.harass ?? 0) + (itemBoosts.harass ?? 0), 1200);
    const strategy = Math.min((row.stats?.strategy ?? 0) + (itemBoosts.strategy ?? 0), 1200);
    const supply = Math.min((row.stats?.supply ?? 0) + (itemBoosts.supply ?? 0), 1200);
    const defense = Math.min((row.stats?.defense ?? 0) + (itemBoosts.defense ?? 0), 1200);
    const scout = Math.min((row.stats?.scout ?? 0) + (itemBoosts.scout ?? 0), 1200);
    const totalStats = sense + control + attack + harass + strategy + supply + defense + scout;

    // 전적 조회
    const gameResultsData = await db.select().from(gameResults).where(eq(gameResults.playerId, row.player.id));
    const wins = gameResultsData.filter((r) => r.isWinner === 1).length;
    const losses = gameResultsData.length - wins;

    rankings.push({
      playerId: row.player.id,
      name: row.player.name,
      race: row.player.race,
      grade: calcGrade(totalStats),
      level: row.player.level,
      sense,
      control,
      attack,
      harass,
      strategy,
      supply,
      defense,
      scout,
      totalStats,
      lastSignedIn: row.lastSignedIn,
      wins,
      losses,
      totalGames: gameResultsData.length,
    });
  }

  return rankings.sort((a, b) => b.totalStats - a.totalStats);
}

/**
 * 상대전적 조회 - 특정 두 선수 간의 전적
 */
export async function getHeadToHeadRecord(playerId: number, opponentPlayerId: number) {
  const db = await getDb();
  if (!db) return { wins: 0, losses: 0, total: 0 };

  // playerId가 opponentPlayerId를 상대로 한 게임 결과 조회
  const results = await db.select().from(gameResults)
    .where(and(eq(gameResults.playerId, playerId), eq(gameResults.opponentId, opponentPlayerId)));

  const wins = results.filter(r => r.isWinner === 1).length;
  const losses = results.length - wins;

  return { wins, losses, total: results.length };
}


// ── Quest System ─────────────────────────────────────────────────

export async function seedQuestsIfEmpty() {
  const db = await getDb();
  if (!db) return;

  // 기존 퀘스트 제목 목록 조회
  const existingQuests = await db.select({ title: quests.title }).from(quests);
  const existingTitles = new Set(existingQuests.map(q => q.title));

  const seedData = [
    // 일일퀘스트
    { type: "daily" as const, title: "연습게임 3판 완료", description: "오늘 연습게임을 3판 플레이하세요", iconEmoji: "🎮", conditionType: "practice_games", conditionValue: 3, rewardType: "gold", rewardValue: 80, sortOrder: 1 },
    { type: "daily" as const, title: "연습게임 7판 완료", description: "오늘 연습게임을 7판 플레이하세요", iconEmoji: "🎯", conditionType: "practice_games", conditionValue: 7, rewardType: "gold", rewardValue: 150, sortOrder: 2 },
    { type: "daily" as const, title: "연습게임 15판 완료", description: "오늘 연습게임을 15판 플레이하세요", iconEmoji: "⚡", conditionType: "practice_games", conditionValue: 15, rewardType: "fatigue", rewardValue: 30, sortOrder: 3 },
    { type: "daily" as const, title: "3승 달성", description: "오늘 연습게임에서 3번 승리하세요", iconEmoji: "🏆", conditionType: "practice_wins", conditionValue: 3, rewardType: "exp", rewardValue: 150, sortOrder: 4 },
    { type: "daily" as const, title: "5승 달성", description: "오늘 연습게임에서 5번 승리하세요", iconEmoji: "🔥", conditionType: "practice_wins", conditionValue: 5, rewardType: "gold", rewardValue: 200, sortOrder: 5 },
    { type: "daily" as const, title: "10승 달성", description: "오늘 연습게임에서 10번 승리하세요", iconEmoji: "💪", conditionType: "practice_wins", conditionValue: 10, rewardType: "stat_points", rewardValue: 10, sortOrder: 6 },
    { type: "daily" as const, title: "능력치 배분 1회", description: "능력치 포인트를 1회 배분하세요", iconEmoji: "📊", conditionType: "stat_allocate", conditionValue: 1, rewardType: "gold", rewardValue: 50, sortOrder: 7 },
    { type: "daily" as const, title: "아이템 구매 1회", description: "상점에서 아이템을 1개 구매하세요", iconEmoji: "🛒", conditionType: "item_buy", conditionValue: 1, rewardType: "exp", rewardValue: 80, sortOrder: 8 },
    { type: "daily" as const, title: "고수 난이도 도전", description: "고수 난이도 연습게임을 1판 플레이하세요", iconEmoji: "⚔️", conditionType: "practice_advanced", conditionValue: 1, rewardType: "gold", rewardValue: 150, sortOrder: 9 },
    { type: "daily" as const, title: "고수 난이도 3판", description: "고수 난이도 연습게임을 3판 플레이하세요", iconEmoji: "🗡️", conditionType: "practice_advanced", conditionValue: 3, rewardType: "stat_points", rewardValue: 5, sortOrder: 10 },

    // 누적보상퀘스트 - 초반
    { type: "cumulative" as const, title: "첫 승리", description: "연습게임에서 첫 승리를 거두세요", iconEmoji: "🌟", conditionType: "total_wins", conditionValue: 1, rewardType: "gold", rewardValue: 200, sortOrder: 1 },
    { type: "cumulative" as const, title: "10승 달성", description: "누적 10승을 달성하세요", iconEmoji: "🎯", conditionType: "total_wins", conditionValue: 10, rewardType: "gold", rewardValue: 500, sortOrder: 2 },
    { type: "cumulative" as const, title: "30승 달성", description: "누적 30승을 달성하세요", iconEmoji: "🏅", conditionType: "total_wins", conditionValue: 30, rewardType: "gold", rewardValue: 1000, sortOrder: 3 },
    { type: "cumulative" as const, title: "50승 달성", description: "누적 50승을 달성하세요", iconEmoji: "💎", conditionType: "total_wins", conditionValue: 50, rewardType: "gold", rewardValue: 2000, sortOrder: 4 },
    { type: "cumulative" as const, title: "100승 달성", description: "누적 100승을 달성하세요", iconEmoji: "👑", conditionType: "total_wins", conditionValue: 100, rewardType: "stat_points", rewardValue: 50, sortOrder: 5 },
    { type: "cumulative" as const, title: "200승 달성", description: "누적 200승을 달성하세요. 진정한 프로게이머!", iconEmoji: "🏆", conditionType: "total_wins", conditionValue: 200, rewardType: "stat_points", rewardValue: 100, sortOrder: 6 },
    { type: "cumulative" as const, title: "500승 달성", description: "누적 500승! 전설의 선수입니다", iconEmoji: "⭐", conditionType: "total_wins", conditionValue: 500, rewardType: "stat_points", rewardValue: 200, sortOrder: 7 },

    // 누적보상퀘스트 - 게임 수
    { type: "cumulative" as const, title: "연습게임 30판", description: "연습게임을 총 30판 플레이하세요", iconEmoji: "🎮", conditionType: "total_games", conditionValue: 30, rewardType: "gold", rewardValue: 300, sortOrder: 8 },
    { type: "cumulative" as const, title: "연습게임 100판", description: "연습게임을 총 100판 플레이하세요", iconEmoji: "🎲", conditionType: "total_games", conditionValue: 100, rewardType: "gold", rewardValue: 1000, sortOrder: 9 },
    { type: "cumulative" as const, title: "연습게임 300판", description: "연습게임을 총 300판 플레이하세요", iconEmoji: "🏅", conditionType: "total_games", conditionValue: 300, rewardType: "stat_points", rewardValue: 80, sortOrder: 10 },
    { type: "cumulative" as const, title: "연습게임 500판", description: "연습게임을 총 500판 플레이하세요. 끈기의 달인!", iconEmoji: "💪", conditionType: "total_games", conditionValue: 500, rewardType: "stat_points", rewardValue: 150, sortOrder: 11 },
    { type: "cumulative" as const, title: "연습게임 1000판", description: "연습게임을 총 1000판! 진정한 프로의 길", iconEmoji: "🔥", conditionType: "total_games", conditionValue: 1000, rewardType: "stat_points", rewardValue: 300, sortOrder: 12 },

    // 누적보상퀘스트 - 골드
    { type: "cumulative" as const, title: "골드 부자", description: "골드를 총 5000 이상 획득하세요", iconEmoji: "💰", conditionType: "total_gold_earned", conditionValue: 5000, rewardType: "gold", rewardValue: 1000, sortOrder: 13 },
    { type: "cumulative" as const, title: "골드 재벌", description: "골드를 총 20000 이상 획득하세요", iconEmoji: "💎", conditionType: "total_gold_earned", conditionValue: 20000, rewardType: "stat_points", rewardValue: 50, sortOrder: 14 },
    { type: "cumulative" as const, title: "골드 황제", description: "골드를 총 100000 이상 획득하세요", iconEmoji: "👑", conditionType: "total_gold_earned", conditionValue: 100000, rewardType: "stat_points", rewardValue: 200, sortOrder: 15 },

    // 누적보상퀘스트 - 레벨
    { type: "cumulative" as const, title: "레벨 5 달성", description: "선수 레벨 5를 달성하세요", iconEmoji: "⬆️", conditionType: "player_level", conditionValue: 5, rewardType: "gold", rewardValue: 300, sortOrder: 16 },
    { type: "cumulative" as const, title: "레벨 10 달성", description: "선수 레벨 10을 달성하세요", iconEmoji: "📈", conditionType: "player_level", conditionValue: 10, rewardType: "gold", rewardValue: 500, sortOrder: 17 },
    { type: "cumulative" as const, title: "레벨 20 달성", description: "선수 레벨 20을 달성하세요", iconEmoji: "🚀", conditionType: "player_level", conditionValue: 20, rewardType: "stat_points", rewardValue: 50, sortOrder: 18 },
    { type: "cumulative" as const, title: "레벨 30 달성", description: "선수 레벨 30을 달성하세요", iconEmoji: "🌟", conditionType: "player_level", conditionValue: 30, rewardType: "stat_points", rewardValue: 80, sortOrder: 19 },
    { type: "cumulative" as const, title: "레벨 40 달성", description: "선수 레벨 40을 달성하세요", iconEmoji: "💫", conditionType: "player_level", conditionValue: 40, rewardType: "stat_points", rewardValue: 120, sortOrder: 20 },
    { type: "cumulative" as const, title: "레벨 50 달성 (MAX)", description: "최대 레벨 50 달성! 전설의 선수!", iconEmoji: "🏆", conditionType: "player_level", conditionValue: 50, rewardType: "stat_points", rewardValue: 300, sortOrder: 21 },

    // 누적보상퀘스트 - 등급
    { type: "cumulative" as const, title: "E등급 달성", description: "선수 등급 E를 달성하세요", iconEmoji: "📊", conditionType: "player_grade", conditionValue: 1, rewardType: "gold", rewardValue: 300, sortOrder: 22 },
    { type: "cumulative" as const, title: "D등급 달성", description: "선수 등급 D를 달성하세요", iconEmoji: "📈", conditionType: "player_grade", conditionValue: 2, rewardType: "gold", rewardValue: 500, sortOrder: 23 },
    { type: "cumulative" as const, title: "C등급 달성", description: "선수 등급 C를 달성하세요", iconEmoji: "🎯", conditionType: "player_grade", conditionValue: 3, rewardType: "gold", rewardValue: 800, sortOrder: 24 },
    { type: "cumulative" as const, title: "B등급 달성", description: "선수 등급 B를 달성하세요", iconEmoji: "⭐", conditionType: "player_grade", conditionValue: 4, rewardType: "stat_points", rewardValue: 50, sortOrder: 25 },
    { type: "cumulative" as const, title: "A등급 달성", description: "선수 등급 A를 달성하세요", iconEmoji: "🌠", conditionType: "player_grade", conditionValue: 5, rewardType: "stat_points", rewardValue: 100, sortOrder: 26 },
    { type: "cumulative" as const, title: "S등급 달성", description: "선수 등급 S를 달성하세요. 프로 중의 프로!", iconEmoji: "💎", conditionType: "player_grade", conditionValue: 6, rewardType: "stat_points", rewardValue: 200, sortOrder: 27 },
    { type: "cumulative" as const, title: "SS등급 달성", description: "선수 등급 SS! 전설의 영역!", iconEmoji: "👑", conditionType: "player_grade", conditionValue: 7, rewardType: "stat_points", rewardValue: 300, sortOrder: 28 },
    { type: "cumulative" as const, title: "SSS등급 달성", description: "최고 등급 SSS! 신의 경지!", iconEmoji: "🏆", conditionType: "player_grade", conditionValue: 8, rewardType: "stat_points", rewardValue: 500, sortOrder: 29 },

    // ── 추가 일일퀘스트 ──
    { type: "daily" as const, title: "연습게임 20판 완료", description: "오늘 연습게임을 20판 플레이하세요", iconEmoji: "🎮", conditionType: "practice_games", conditionValue: 20, rewardType: "stat_points", rewardValue: 15, sortOrder: 11 },
    { type: "daily" as const, title: "15승 달성", description: "오늘 연습게임에서 15번 승리하세요", iconEmoji: "🏅", conditionType: "practice_wins", conditionValue: 15, rewardType: "gold", rewardValue: 300, sortOrder: 12 },
    { type: "daily" as const, title: "고수 난이도 5판", description: "고수 난이도 연습게임을 5판 플레이하세요", iconEmoji: "💀", conditionType: "practice_advanced", conditionValue: 5, rewardType: "gold", rewardValue: 250, sortOrder: 13 },
    { type: "daily" as const, title: "고수 난이도 10판", description: "고수 난이도 연습게임을 10판 플레이하세요", iconEmoji: "🔱", conditionType: "practice_advanced", conditionValue: 10, rewardType: "stat_points", rewardValue: 10, sortOrder: 14 },
    { type: "daily" as const, title: "능력치 배분 3회", description: "능력치 포인트를 3회 배분하세요", iconEmoji: "📈", conditionType: "stat_allocate", conditionValue: 3, rewardType: "gold", rewardValue: 100, sortOrder: 15 },
    { type: "daily" as const, title: "아이템 구매 3회", description: "상점에서 아이템을 3개 구매하세요", iconEmoji: "🛍️", conditionType: "item_buy", conditionValue: 3, rewardType: "exp", rewardValue: 200, sortOrder: 16 },

    // ── 추가 누적보상퀘스트 - 승수 ──
    { type: "cumulative" as const, title: "1000승 달성", description: "누적 1000승! 불멸의 전설!", iconEmoji: "🌟", conditionType: "total_wins", conditionValue: 1000, rewardType: "stat_points", rewardValue: 500, sortOrder: 30 },

    // ── 추가 누적보상퀘스트 - 게임 수 ──
    { type: "cumulative" as const, title: "연습게임 2000판", description: "연습게임을 총 2000판! 끝없는 도전!", iconEmoji: "🎖️", conditionType: "total_games", conditionValue: 2000, rewardType: "stat_points", rewardValue: 500, sortOrder: 31 },

    // ── 추가 누적보상퀘스트 - 골드 ──
    { type: "cumulative" as const, title: "골드 대부호", description: "골드를 총 50000 이상 획득하세요", iconEmoji: "💸", conditionType: "total_gold_earned", conditionValue: 50000, rewardType: "stat_points", rewardValue: 100, sortOrder: 32 },
    { type: "cumulative" as const, title: "골드 전설", description: "골드를 총 500000 이상 획득하세요", iconEmoji: "🏦", conditionType: "total_gold_earned", conditionValue: 500000, rewardType: "stat_points", rewardValue: 500, sortOrder: 33 },
  ];

  for (const quest of seedData) {
    if (!existingTitles.has(quest.title)) {
      await db.insert(quests).values(quest);
    }
  }
}

export async function getAllQuests() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(quests).where(eq(quests.isActive, 1));
}

export async function getPlayerQuestProgress(playerId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(playerQuestProgress).where(eq(playerQuestProgress.playerId, playerId));
}

function getTodayDateString(): string {
  // KST(UTC+9) 기준으로 오늘 날짜 반환 - 한국 시간 자정에 초기화되도록
  const now = new Date();
  const kstOffset = 9 * 60; // KST는 UTC+9
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  return `${kstTime.getUTCFullYear()}-${String(kstTime.getUTCMonth() + 1).padStart(2, '0')}-${String(kstTime.getUTCDate()).padStart(2, '0')}`;
}

export async function getOrCreateQuestProgress(playerId: number, questId: number, questType: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(playerQuestProgress)
    .where(and(eq(playerQuestProgress.playerId, playerId), eq(playerQuestProgress.questId, questId)))
    .limit(1);

  const today = getTodayDateString();

  if (existing.length > 0) {
    const record = existing[0];
    // 일일퀘스트: 날짜가 바뀌었으면 리셋
    if (questType === 'daily' && record.lastResetDate !== today) {
      await db.update(playerQuestProgress).set({
        progress: 0,
        completed: 0,
        rewardClaimed: 0,
        lastResetDate: today,
      }).where(eq(playerQuestProgress.id, record.id));
      return { ...record, progress: 0, completed: 0, rewardClaimed: 0, lastResetDate: today };
    }
    return record;
  }

  // 새로 생성
  await db.insert(playerQuestProgress).values({
    playerId,
    questId,
    progress: 0,
    completed: 0,
    rewardClaimed: 0,
    lastResetDate: questType === 'daily' ? today : null,
  });

  const created = await db.select().from(playerQuestProgress)
    .where(and(eq(playerQuestProgress.playerId, playerId), eq(playerQuestProgress.questId, questId)))
    .limit(1);
  return created[0];
}

export async function updateQuestProgress(playerId: number, questId: number, progress: number, conditionValue: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const completed = progress >= conditionValue ? 1 : 0;
  await db.update(playerQuestProgress).set({
    progress: Math.min(progress, conditionValue),
    completed,
  }).where(and(eq(playerQuestProgress.playerId, playerId), eq(playerQuestProgress.questId, questId)));
}

export async function claimQuestReward(playerId: number, questId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(playerQuestProgress).set({
    rewardClaimed: 1,
  }).where(and(eq(playerQuestProgress.playerId, playerId), eq(playerQuestProgress.questId, questId)));
}

export async function getDailyGameCount(playerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const today = getTodayDateString();
  const startOfDay = `${today} 00:00:00`;
  const endOfDay = `${today} 23:59:59`;

  // KST 기준 시작/끝 시간을 UTC로 변환하여 쿼리
  // KST 00:00:00 = UTC 전날 15:00:00, KST 23:59:59 = UTC 당일 14:59:59
  const kstStartUTC = new Date(`${today}T00:00:00+09:00`).toISOString().slice(0, 19).replace('T', ' ');
  const kstEndUTC = new Date(`${today}T23:59:59+09:00`).toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(gameResults)
    .where(and(
      eq(gameResults.playerId, playerId),
      sql`${gameResults.createdAt} >= ${kstStartUTC}`,
      sql`${gameResults.createdAt} <= ${kstEndUTC}`,
    ));

  return Number(result[0]?.count ?? 0);
}

export async function getDailyWinCount(playerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const today = getTodayDateString();

  // KST 기준 시작/끝 시간을 UTC로 변환하여 쿼리
  const kstStartUTC = new Date(`${today}T00:00:00+09:00`).toISOString().slice(0, 19).replace('T', ' ');
  const kstEndUTC = new Date(`${today}T23:59:59+09:00`).toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(gameResults)
    .where(and(
      eq(gameResults.playerId, playerId),
      eq(gameResults.isWinner, 1),
      sql`${gameResults.createdAt} >= ${kstStartUTC}`,
      sql`${gameResults.createdAt} <= ${kstEndUTC}`,
    ));

  return Number(result[0]?.count ?? 0);
}

export async function getDailyAdvancedGameCount(playerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const today = getTodayDateString();

  // KST 기준 시작/끝 시간을 UTC로 변환하여 쿼리
  const kstStartUTC = new Date(`${today}T00:00:00+09:00`).toISOString().slice(0, 19).replace('T', ' ');
  const kstEndUTC = new Date(`${today}T23:59:59+09:00`).toISOString().slice(0, 19).replace('T', ' ');

  const result = await db.select({ count: sql<number>`COUNT(*)` })
    .from(gameResults)
    .innerJoin(games, eq(gameResults.gameId, games.id))
    .where(and(
      eq(gameResults.playerId, playerId),
      eq(games.difficulty, 'advanced'),
      sql`${gameResults.createdAt} >= ${kstStartUTC}`,
      sql`${gameResults.createdAt} <= ${kstEndUTC}`,
    ));

  return Number(result[0]?.count ?? 0);
}

export async function getTotalGoldEarned(playerId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db.select({ total: sql<number>`COALESCE(SUM(${gameResults.goldGained}), 0)` })
    .from(gameResults)
    .where(eq(gameResults.playerId, playerId));

  return Number(result[0]?.total ?? 0);
}

export async function getPlayerGradeIndex(playerId: number): Promise<number> {
  const { calcGradeIndex, STAT_KEYS } = await import("@shared/gameConstants");
  const stats = await getPlayerStats(playerId);
  if (!stats) return 0;
  const totalStats = STAT_KEYS.reduce((sum: number, key: string) => sum + ((stats as any)[key] || 0), 0);
  return calcGradeIndex(totalStats);
}
