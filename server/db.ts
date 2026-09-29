import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, items, playerItems, players, playerStats, users, events, maps, games, gameResults, quests, playerQuestProgress, localCredentials } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { StatKey, STAT_DEFAULT } from "@shared/gameConstants";
import { desc, eq, and, ne, sql } from "drizzle-orm";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * MySQL DATETIME/TIMESTAMP 형식(UTC, "YYYY-MM-DD HH:MM:SS")으로 변환
 * MySQL 8은 ISO 문자열의 "T"/"Z"를 거부하므로 저장 전에 변환한다.
 */
export function toMysqlDatetime(value: Date | string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || value === "") return value as null | undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return value as string;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

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

/**
 * 자체 로그인 계정 생성. 중복 아이디면 false 반환 (기존 계정을 덮어쓰지 않도록 upsert 대신 insert 사용)
 */
export async function createLocalUser(openId: string, name: string, passwordHash: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.transaction(async tx => {
      await tx.insert(localCredentials).values({ openId, passwordHash });
      await tx.insert(users).values({
        openId,
        name,
        loginMethod: "local",
        role: openId === ENV.ownerOpenId ? "admin" : "user",
        lastSignedIn: new Date(),
      });
    });
    return true;
  } catch (error: any) {
    const code = error?.code ?? error?.cause?.code;
    if (code === "ER_DUP_ENTRY") return false;
    throw error;
  }
}

export async function getLocalPasswordHash(openId: string): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(localCredentials).where(eq(localCredentials.openId, openId)).limit(1);
  return result[0]?.passwordHash ?? null;
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

  // 피로도 회복 아이템인지 확인
  const isFatigueItem = item.fatigueRecover && item.fatigueRecover > 0;
  
  if (isFatigueItem) {
    // 피로도 회복 아이템: 1개씩 카운팅, 착용 불가
    const existing = await db
      .select()
      .from(playerItems)
      .where(and(eq(playerItems.playerId, playerId), eq(playerItems.itemId, itemId)))
      .limit(1);
    
    if (existing.length > 0) {
      // 이미 보유한 경우 usageCount 1 추가
      await db.update(playerItems)
        .set({ usageCount: existing[0].usageCount + 1 })
        .where(eq(playerItems.id, existing[0].id));
    } else {
      // 새로 구매하는 경우 usageCount 1
      await db.insert(playerItems).values({ playerId, itemId, equipped: 0, usageCount: 1 });
    }
  } else {
    // 일반 아이템: 착용 가능
    const existing = await db
      .select()
      .from(playerItems)
      .where(and(eq(playerItems.playerId, playerId), eq(playerItems.itemId, itemId)))
      .limit(1);
    
    if (existing.length > 0) {
      // 이미 보유한 경우 usageCount 20 추가
      await db.update(playerItems)
        .set({ usageCount: existing[0].usageCount + 20 })
        .where(eq(playerItems.id, existing[0].id));
    } else {
      // 새로 구매하는 경우 usageCount 20
      await db.insert(playerItems).values({ playerId, itemId, equipped: 0, usageCount: 20 });
    }
  }
  
  // 골드 차감
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

    // ── 추가 신규 아이템 ──
    { name: "스캐럽 강화 패치", description: "스캐럽 공격력을 극대화하는 강화 패치", price: 320, rarity: "common" as const, iconEmoji: "🦗", statBoosts: { attack: 45, harass: 20 }, fatigueRecover: 0 },
    { name: "가디언 방어막", description: "방어력과 생존력을 높이는 에너지 방어막", price: 290, rarity: "common" as const, iconEmoji: "⚔️", statBoosts: { defense: 50, strategy: 15 }, fatigueRecover: 0 },
    { name: "뮤탈리스크 독", description: "독 공격으로 상대를 약화시키는 독액", price: 310, rarity: "common" as const, iconEmoji: "☠️", statBoosts: { attack: 40, harass: 30 }, fatigueRecover: 0 },
    { name: "스팀팩 강화제", description: "스팀팩의 효과를 극대화하는 강화제", price: 330, rarity: "common" as const, iconEmoji: "💪", statBoosts: { control: 45, attack: 35 }, fatigueRecover: 0 },
    { name: "사이오닉 증폭기", description: "사이오닉 에너지를 증폭시키는 장치", price: 350, rarity: "common" as const, iconEmoji: "⚡", statBoosts: { sense: 50, strategy: 25 }, fatigueRecover: 0 },

    // ── 추가 희귀 아이템 ──
    { name: "테란 전술 컴퓨터", description: "전술 판단력을 극도로 향상시키는 AI 컴퓨터", price: 600, rarity: "rare" as const, iconEmoji: "💻", statBoosts: { strategy: 80, control: 40 }, fatigueRecover: 0 },
    { name: "프로토스 사이오닉 강화", description: "프로토스의 정신력을 극한까지 끌어올리는 강화제", price: 650, rarity: "rare" as const, iconEmoji: "🔮", statBoosts: { sense: 90, strategy: 50 }, fatigueRecover: 0 },
    { name: "저그 진화 촉진제", description: "저그의 진화를 가속화하는 생명 촉진제", price: 620, rarity: "rare" as const, iconEmoji: "🧬", statBoosts: { supply: 80, attack: 45 }, fatigueRecover: 0 },
    { name: "초고속 반응 시스템", description: "반응 속도를 극도로 높이는 신경 강화 시스템", price: 680, rarity: "rare" as const, iconEmoji: "⚙️", statBoosts: { control: 70, harass: 50 }, fatigueRecover: 0 },
    { name: "완벽한 정찰 체계", description: "모든 정찰 정보를 완벽히 수집하는 시스템", price: 640, rarity: "rare" as const, iconEmoji: "🔍", statBoosts: { scout: 100, sense: 40 }, fatigueRecover: 0 },

    // ── 추가 영웅 아이템 ──
    { name: "최강 전투 강화 패키지", description: "모든 전투 능력을 극대화하는 종합 강화 패키지", price: 1200, rarity: "epic" as const, iconEmoji: "🎖️", statBoosts: { attack: 100, control: 80, harass: 70 }, fatigueRecover: 0 },
    { name: "완벽한 방어 시스템", description: "방어와 생존을 완벽히 하는 최고급 방어 시스템", price: 1100, rarity: "epic" as const, iconEmoji: "🛡️", statBoosts: { defense: 110, strategy: 70, supply: 50 }, fatigueRecover: 0 },
    { name: "초월적 정찰 능력", description: "정찰 능력을 초월적 수준으로 끌어올리는 장비", price: 1150, rarity: "epic" as const, iconEmoji: "👁️", statBoosts: { scout: 120, sense: 80, strategy: 50 }, fatigueRecover: 0 },
    { name: "절대 우위 전술", description: "전술적 우위를 절대적으로 확보하는 시스템", price: 1300, rarity: "epic" as const, iconEmoji: "🎯", statBoosts: { strategy: 120, control: 90, sense: 70 }, fatigueRecover: 0 },

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

    // ── 세트 아이템: 테란 시리즈 ──
    { name: "마린 전투복", description: "테란 보병의 기본 전투복. 균형 잡힌 능력치 제공", price: 350, rarity: "common" as const, iconEmoji: "🎖️", statBoosts: { attack: 20, defense: 20, control: 15 }, fatigueRecover: 0 },
    { name: "메딕 힐링 팩", description: "전장에서 아군을 치료하는 의료 장비", price: 280, rarity: "common" as const, iconEmoji: "💊", statBoosts: { defense: 30, sense: 15 }, fatigueRecover: 5 },
    { name: "벙커 설계도", description: "방어 진지 구축 능력을 높이는 설계도", price: 320, rarity: "common" as const, iconEmoji: "🏗️", statBoosts: { defense: 40, supply: 10 }, fatigueRecover: 0 },
    { name: "커맨드센터 확장 모듈", description: "경제 운영 능력을 향상시키는 확장 모듈", price: 380, rarity: "rare" as const, iconEmoji: "🏭", statBoosts: { supply: 50, sense: 25 }, fatigueRecover: 0 },
    { name: "고스트 EMP 장치", description: "적 에너지를 무력화하는 전자기 펄스", price: 550, rarity: "rare" as const, iconEmoji: "⚡", statBoosts: { harass: 55, strategy: 30 }, fatigueRecover: 0 },
    { name: "핵미사일 발사 코드", description: "최종 병기의 발사 코드. 압도적 공격력", price: 1200, rarity: "epic" as const, iconEmoji: "☢️", statBoosts: { attack: 90, strategy: 50, harass: 30 }, fatigueRecover: 0 },

    // ── 세트 아이템: 저그 시리즈 ──
    { name: "저글링 아드레날린", description: "이동 속도와 공격 속도를 극대화하는 호르몬", price: 300, rarity: "common" as const, iconEmoji: "💉", statBoosts: { attack: 25, harass: 20 }, fatigueRecover: 0 },
    { name: "바퀴 갑각", description: "단단한 갑각으로 방어력을 높이는 진화", price: 350, rarity: "common" as const, iconEmoji: "🐚", statBoosts: { defense: 35, attack: 10 }, fatigueRecover: 0 },
    { name: "감염충 신경 독소", description: "적 유닛을 혼란에 빠뜨리는 신경 독소", price: 480, rarity: "rare" as const, iconEmoji: "🦠", statBoosts: { control: 45, harass: 30 }, fatigueRecover: 0 },
    { name: "맹독충 산성 분비물", description: "범위 공격력을 높이는 산성 물질", price: 420, rarity: "rare" as const, iconEmoji: "🧪", statBoosts: { attack: 50, harass: 25 }, fatigueRecover: 0 },
    { name: "군단 숙주 알", description: "끝없는 물량을 생산하는 군단 숙주의 알", price: 750, rarity: "epic" as const, iconEmoji: "🥚", statBoosts: { supply: 70, attack: 40, defense: 20 }, fatigueRecover: 0 },
    { name: "레비아탄 촉수", description: "우주 괴수의 촉수. 압도적 물량과 공격력", price: 2200, rarity: "legendary" as const, iconEmoji: "🐙", statBoosts: { supply: 100, attack: 90, defense: 60 }, fatigueRecover: 0 },

    // ── 세트 아이템: 프로토스 시리즈 ──
    { name: "질럿 돌격 부스터", description: "돌격 속도를 높이는 다리 강화 장치", price: 300, rarity: "common" as const, iconEmoji: "🦿", statBoosts: { attack: 25, control: 15 }, fatigueRecover: 0 },
    { name: "파수기 역장 생성기", description: "적의 이동을 차단하는 역장 기술", price: 380, rarity: "common" as const, iconEmoji: "🔷", statBoosts: { defense: 30, strategy: 20 }, fatigueRecover: 0 },
    { name: "불멸자 보호막 강화기", description: "강화 보호막으로 방어력을 극대화", price: 520, rarity: "rare" as const, iconEmoji: "🛡️", statBoosts: { defense: 55, attack: 25 }, fatigueRecover: 0 },
    { name: "집정관 합체 에너지", description: "두 기사의 합체로 탄생하는 강력한 에너지", price: 600, rarity: "rare" as const, iconEmoji: "✨", statBoosts: { attack: 50, defense: 40, sense: 20 }, fatigueRecover: 0 },
    { name: "모선 시간 왜곡 장치", description: "시간을 왜곡하여 적을 무력화하는 장치", price: 950, rarity: "epic" as const, iconEmoji: "⏳", statBoosts: { strategy: 75, control: 55, defense: 30 }, fatigueRecover: 0 },
    { name: "아이어의 크리스탈", description: "프로토스 모성의 순수한 에너지 결정체", price: 2800, rarity: "legendary" as const, iconEmoji: "💠", statBoosts: { sense: 90, strategy: 90, control: 80, defense: 60 }, fatigueRecover: 0 },

    // ── 이벤트/한정 아이템 ──
    { name: "프로리그 우승 트로피", description: "프로리그 우승자에게 주어지는 영광의 트로피", price: 5000, rarity: "legendary" as const, iconEmoji: "🏆", statBoosts: { sense: 120, control: 120, attack: 100, strategy: 100 }, fatigueRecover: 0 },
    { name: "스타리그 MVP 메달", description: "스타리그 MVP에게 수여되는 특별 메달", price: 4000, rarity: "legendary" as const, iconEmoji: "🥇", statBoosts: { control: 110, attack: 110, harass: 90 }, fatigueRecover: 0 },
    { name: "초보자 응원 키트", description: "초보 선수를 위한 응원 키트. 모든 능력치 소폭 상승", price: 100, rarity: "common" as const, iconEmoji: "🎁", statBoosts: { sense: 10, control: 10, attack: 10, harass: 10, strategy: 10, supply: 10, defense: 10, scout: 10 }, fatigueRecover: 0 },
    { name: "행운의 부적", description: "게임 운을 높여주는 신비한 부적", price: 150, rarity: "common" as const, iconEmoji: "🍀", statBoosts: { sense: 20, scout: 20 }, fatigueRecover: 0 },
    { name: "전략 교본", description: "프로게이머의 전략이 담긴 교본", price: 400, rarity: "rare" as const, iconEmoji: "📖", statBoosts: { strategy: 50, sense: 20 }, fatigueRecover: 0 },
    { name: "컨트롤 연습 장갑", description: "정밀한 컨트롤을 위한 특수 장갑", price: 350, rarity: "rare" as const, iconEmoji: "🧤", statBoosts: { control: 50, harass: 15 }, fatigueRecover: 0 },

    // ── 피로도 특화 아이템 ──
    { name: "카페인 알약", description: "피로도를 5 회복하는 간편한 알약", price: 30, rarity: "common" as const, iconEmoji: "💊", statBoosts: {}, fatigueRecover: 5 },
    { name: "스포츠 음료", description: "피로도를 15 회복하는 스포츠 음료", price: 80, rarity: "common" as const, iconEmoji: "🥤", statBoosts: {}, fatigueRecover: 15 },
    { name: "프리미엄 영양제", description: "피로도를 35 회복하는 고급 영양제", price: 250, rarity: "rare" as const, iconEmoji: "💎", statBoosts: {}, fatigueRecover: 35 },
    { name: "선수 전용 회복실", description: "피로도를 70 회복하는 프로 전용 시설 이용권", price: 600, rarity: "epic" as const, iconEmoji: "🏨", statBoosts: {}, fatigueRecover: 70 },
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
      .set({ fatigue: 100, lastFatigueRecovery: toMysqlDatetime(now)! })
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
    startTime: toMysqlDatetime(eventData.startTime),
    endTime: toMysqlDatetime(eventData.endTime),
  };
  const result = await db.insert(events).values(normalizedData);
  return Number((result as any)[0]?.insertId ?? (result as any).insertId);
}

export async function updateEvent(eventId: number, eventData: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedData = {
    ...eventData,
    startTime: toMysqlDatetime(eventData.startTime),
    endTime: toMysqlDatetime(eventData.endTime),
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
  await db.update(games).set({ winnerId, player1ActualScore: player1Score, player2ActualScore: player2Score, completedAt: toMysqlDatetime(new Date())! }).where(eq(games.id, gameId));
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
          isAiOpponent = opponent.isBot === 1;
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
    
    // 능력치 행이 아직 없는 선수는 초기 능력치(0)로 간주
    const totalStats = stats.length === 0
      ? 0
      : STAT_KEYS.reduce((sum: number, key: string) => sum + ((stats[0] as any)[key] || 0), 0);
    const gradeIndex = calcGradeIndex(totalStats);
    
    if (gradeIndex >= range.minIndex && gradeIndex <= range.maxIndex) {
      validOpponents.push(opponent);
    }
  }

  if (validOpponents.length === 0) return null;
  
  // 랜덤 선택
  return validOpponents[Math.floor(Math.random() * validOpponents.length)];
}

const BOT_NAMES = [
  "Shadow", "Storm", "Blaze", "Frost", "Thunder", "Phoenix", "Dragon", "Viper",
  "Hawk", "Wolf", "Nova", "Titan", "Specter", "Phantom", "Sentinel", "Raven",
  "Falcon", "Cobra", "Ghost", "Reaper", "Zealot", "Marine", "Hydra", "Mutal",
];

/**
 * 매칭 상대가 없을 때 난이도에 맞는 AI 선수를 DB 에 생성한다.
 * 일반 선수와 같은 테이블에 저장되므로 이후 전적/랭킹/성장이 그대로 쌓이고, 다른 유저의 매칭 상대도 된다.
 */
export async function createBotPlayer(difficulty: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { DIFFICULTY_RANGES, GRADE_BASE, GRADE_STEP, STAT_KEYS } = await import("@shared/gameConstants");
  const range = DIFFICULTY_RANGES[difficulty as keyof typeof DIFFICULTY_RANGES] ?? DIFFICULTY_RANGES.beginner;

  // 난이도 등급 범위 안의 능력치 합계 목표
  const gradeIndex = range.minIndex + Math.floor(Math.random() * (range.maxIndex - range.minIndex + 1));
  const targetTotal = GRADE_BASE + gradeIndex * GRADE_STEP + Math.floor(Math.random() * GRADE_STEP);
  const avg = Math.floor(targetTotal / STAT_KEYS.length);
  const stats: Record<string, number> = {};
  let remaining = targetTotal;
  STAT_KEYS.forEach((key, i) => {
    if (i === STAT_KEYS.length - 1) {
      stats[key] = Math.max(100, Math.min(1200, remaining));
    } else {
      stats[key] = Math.max(100, Math.min(1200, avg + Math.floor(Math.random() * 101) - 50));
      remaining -= stats[key];
    }
  });

  const races = ["terran", "zerg", "protoss"] as const;
  const race = races[Math.floor(Math.random() * races.length)];
  const name = `AI_${BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]}${Math.floor(Math.random() * 90) + 10}`;
  const level = Math.max(1, gradeIndex * 3 + Math.floor(Math.random() * 5));

  const { calcExpToNext } = await import("@shared/gameConstants");
  const result = await db.insert(players).values({
    userId: 0,
    name,
    race,
    level,
    exp: 0,
    expToNext: calcExpToNext(level),
    statPoints: 0,
    gold: 0,
    fatigue: 100,
    grade: "D",
    isBot: 1,
  });
  const playerId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
  await db.insert(playerStats).values({ playerId, ...(stats as any) });

  const created = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  return created[0];
}

/** AI 선수가 레벨업으로 얻은 능력치 포인트를 무작위로 자동 배분 (5포인트 단위) */
export async function autoAllocateBotStatPoints(playerId: number) {
  const db = await getDb();
  if (!db) return;
  const player = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
  if (!player[0] || player[0].isBot !== 1 || player[0].statPoints <= 0) return;
  const stats = await getPlayerStats(playerId);
  if (!stats) return;

  const { STAT_KEYS } = await import("@shared/gameConstants");
  const next: Record<string, number> = {};
  STAT_KEYS.forEach(key => { next[key] = (stats as any)[key] ?? 0; });
  let points = player[0].statPoints;
  while (points > 0) {
    const chunk = Math.min(5, points);
    const key = STAT_KEYS[Math.floor(Math.random() * STAT_KEYS.length)];
    next[key] = Math.min(1200, next[key] + chunk);
    points -= chunk;
  }
  await db.update(playerStats).set(next as any).where(eq(playerStats.playerId, playerId));
  await db.update(players).set({ statPoints: 0 }).where(eq(players.id, playerId));
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

/**
 * 기본값(500) 대신 0으로 생성됐던 선수 능력치 보정 (서버 시작 시 1회 실행, 여러 번 실행해도 안전)
 * 정상 선수의 합계는 최소 수천이므로 합계 1000 미만인 행만 초기화 누락으로 보고 각 능력치에 500을 더한다.
 * 그동안 경기/배분으로 오르내린 값은 그대로 유지된다.
 */
export async function repairUninitializedPlayerStats(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.execute(sql`
    UPDATE player_stats SET
      sense = sense + ${STAT_DEFAULT}, control = control + ${STAT_DEFAULT},
      attack = attack + ${STAT_DEFAULT}, harass = harass + ${STAT_DEFAULT},
      strategy = strategy + ${STAT_DEFAULT}, supply = supply + ${STAT_DEFAULT},
      defense = defense + ${STAT_DEFAULT}, scout = scout + ${STAT_DEFAULT}
    WHERE sense + control + attack + harass + strategy + supply + defense + scout < 1000
  `);
  return Number((result as any)?.[0]?.affectedRows ?? 0);
}

export async function ensurePlayerStats(playerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(playerStats).where(eq(playerStats.playerId, playerId)).limit(1);
  if (existing.length > 0) return existing[0];

  // 신규 선수 능력치는 모두 기본값(STAT_DEFAULT = 500)으로 시작
  await db.insert(playerStats).values({
    playerId,
    sense: STAT_DEFAULT,
    control: STAT_DEFAULT,
    attack: STAT_DEFAULT,
    harass: STAT_DEFAULT,
    scout: STAT_DEFAULT,
    strategy: STAT_DEFAULT,
    defense: STAT_DEFAULT,
    supply: STAT_DEFAULT,
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
    .leftJoin(users, eq(players.userId, users.id))
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
      // AI 선수는 로그인 기록이 없으므로 마지막 경기(갱신) 시각 사용
      lastSignedIn: row.lastSignedIn ?? row.player.updatedAt,
      isBot: row.player.isBot === 1,
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

  // 중복 퀘스트 정리: 같은 title이 여러 개 있으면 가장 작은 id만 남기고 삭제
  const allExisting = await db.select({ id: quests.id, title: quests.title }).from(quests);
  const titleMap = new Map<string, number[]>();
  for (const q of allExisting) {
    const ids = titleMap.get(q.title) || [];
    ids.push(q.id);
    titleMap.set(q.title, ids);
  }
  for (const [, ids] of Array.from(titleMap)) {
    if (ids.length > 1) {
      ids.sort((a: number, b: number) => a - b);
      const duplicateIds = ids.slice(1); // 첫 번째(가장 작은 id)만 남김
      for (const dupId of duplicateIds) {
        // 해당 퀘스트의 진행도도 삭제
        await db.delete(playerQuestProgress).where(eq(playerQuestProgress.questId, dupId));
        await db.delete(quests).where(eq(quests.id, dupId));
      }
    }
  }

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

    // ── 추가 일일퀘스트: 연승/연패 관련 ──
    { type: "daily" as const, title: "연습게임 1판 완료", description: "오늘 연습게임을 1판 플레이하세요", iconEmoji: "🎮", conditionType: "practice_games", conditionValue: 1, rewardType: "gold", rewardValue: 30, sortOrder: 17 },
    { type: "daily" as const, title: "첫 승리", description: "오늘 연습게임에서 첫 승리를 거두세요", iconEmoji: "🌟", conditionType: "practice_wins", conditionValue: 1, rewardType: "gold", rewardValue: 50, sortOrder: 18 },
    { type: "daily" as const, title: "연습게임 10판 완료", description: "오늘 연습게임을 10판 플레이하세요", iconEmoji: "🎲", conditionType: "practice_games", conditionValue: 10, rewardType: "gold", rewardValue: 200, sortOrder: 19 },
    { type: "daily" as const, title: "7승 달성", description: "오늘 연습게임에서 7번 승리하세요", iconEmoji: "⚡", conditionType: "practice_wins", conditionValue: 7, rewardType: "stat_points", rewardValue: 5, sortOrder: 20 },
    { type: "daily" as const, title: "능력치 배분 5회", description: "능력치 포인트를 5회 배분하세요", iconEmoji: "💪", conditionType: "stat_allocate", conditionValue: 5, rewardType: "gold", rewardValue: 150, sortOrder: 21 },
    { type: "daily" as const, title: "초보 난이도 5판", description: "초보 난이도 연습게임을 5판 플레이하세요", iconEmoji: "🌱", conditionType: "practice_games", conditionValue: 5, rewardType: "exp", rewardValue: 100, sortOrder: 22 },

    // ── 추가 누적보상퀘스트 - 연승 ──
    { type: "cumulative" as const, title: "3승 연속", description: "누적 3승을 달성하세요 (초보자 도전)", iconEmoji: "🔥", conditionType: "total_wins", conditionValue: 3, rewardType: "gold", rewardValue: 100, sortOrder: 34 },
    { type: "cumulative" as const, title: "5승 달성", description: "누적 5승을 달성하세요", iconEmoji: "⭐", conditionType: "total_wins", conditionValue: 5, rewardType: "gold", rewardValue: 200, sortOrder: 35 },
    { type: "cumulative" as const, title: "20승 달성", description: "누적 20승을 달성하세요", iconEmoji: "🎯", conditionType: "total_wins", conditionValue: 20, rewardType: "gold", rewardValue: 700, sortOrder: 36 },
    { type: "cumulative" as const, title: "75승 달성", description: "누적 75승을 달성하세요", iconEmoji: "💪", conditionType: "total_wins", conditionValue: 75, rewardType: "gold", rewardValue: 1500, sortOrder: 37 },
    { type: "cumulative" as const, title: "150승 달성", description: "누적 150승을 달성하세요", iconEmoji: "🏅", conditionType: "total_wins", conditionValue: 150, rewardType: "stat_points", rewardValue: 75, sortOrder: 38 },
    { type: "cumulative" as const, title: "300승 달성", description: "누적 300승! 베테랑 프로게이머!", iconEmoji: "🎖️", conditionType: "total_wins", conditionValue: 300, rewardType: "stat_points", rewardValue: 150, sortOrder: 39 },

    // ── 추가 누적보상퀘스트 - 게임 수 ──
    { type: "cumulative" as const, title: "연습게임 10판", description: "연습게임을 총 10판 플레이하세요", iconEmoji: "🎮", conditionType: "total_games", conditionValue: 10, rewardType: "gold", rewardValue: 100, sortOrder: 40 },
    { type: "cumulative" as const, title: "연습게임 50판", description: "연습게임을 총 50판 플레이하세요", iconEmoji: "🎲", conditionType: "total_games", conditionValue: 50, rewardType: "gold", rewardValue: 500, sortOrder: 41 },
    { type: "cumulative" as const, title: "연습게임 200판", description: "연습게임을 총 200판 플레이하세요", iconEmoji: "🏅", conditionType: "total_games", conditionValue: 200, rewardType: "gold", rewardValue: 800, sortOrder: 42 },
    { type: "cumulative" as const, title: "연습게임 700판", description: "연습게임을 총 700판 플레이하세요", iconEmoji: "🔥", conditionType: "total_games", conditionValue: 700, rewardType: "stat_points", rewardValue: 200, sortOrder: 43 },
    { type: "cumulative" as const, title: "연습게임 1500판", description: "연습게임을 총 1500판! 끝없는 열정!", iconEmoji: "💫", conditionType: "total_games", conditionValue: 1500, rewardType: "stat_points", rewardValue: 400, sortOrder: 44 },

    // ── 추가 누적보상퀘스트 - 골드 ──
    { type: "cumulative" as const, title: "골드 수집가", description: "골드를 총 1000 이상 획득하세요", iconEmoji: "🪙", conditionType: "total_gold_earned", conditionValue: 1000, rewardType: "gold", rewardValue: 200, sortOrder: 45 },
    { type: "cumulative" as const, title: "골드 사업가", description: "골드를 총 10000 이상 획득하세요", iconEmoji: "💰", conditionType: "total_gold_earned", conditionValue: 10000, rewardType: "gold", rewardValue: 500, sortOrder: 46 },
    { type: "cumulative" as const, title: "골드 왕", description: "골드를 총 200000 이상 획득하세요", iconEmoji: "👑", conditionType: "total_gold_earned", conditionValue: 200000, rewardType: "stat_points", rewardValue: 300, sortOrder: 47 },

    // ── 추가 누적보상퀘스트 - 레벨 ──
    { type: "cumulative" as const, title: "레벨 3 달성", description: "선수 레벨 3을 달성하세요", iconEmoji: "📊", conditionType: "player_level", conditionValue: 3, rewardType: "gold", rewardValue: 150, sortOrder: 48 },
    { type: "cumulative" as const, title: "레벨 15 달성", description: "선수 레벨 15를 달성하세요", iconEmoji: "📈", conditionType: "player_level", conditionValue: 15, rewardType: "gold", rewardValue: 400, sortOrder: 49 },
    { type: "cumulative" as const, title: "레벨 25 달성", description: "선수 레벨 25를 달성하세요", iconEmoji: "🚀", conditionType: "player_level", conditionValue: 25, rewardType: "stat_points", rewardValue: 60, sortOrder: 50 },
    { type: "cumulative" as const, title: "레벨 35 달성", description: "선수 레벨 35를 달성하세요", iconEmoji: "🌟", conditionType: "player_level", conditionValue: 35, rewardType: "stat_points", rewardValue: 100, sortOrder: 51 },
    { type: "cumulative" as const, title: "레벨 45 달성", description: "선수 레벨 45를 달성하세요", iconEmoji: "💫", conditionType: "player_level", conditionValue: 45, rewardType: "stat_points", rewardValue: 200, sortOrder: 52 },

    // ── 신규 일일퀨스트 ──
    { type: "daily" as const, title: "연습게임 25판 완료", description: "오늘 연습게임을 25판 플레이하세요", iconEmoji: "🎮", conditionType: "practice_games", conditionValue: 25, rewardType: "gold", rewardValue: 400, sortOrder: 23 },
    { type: "daily" as const, title: "20승 달성", description: "오늘 연습게임에서 20번 승리하세요", iconEmoji: "🔥", conditionType: "practice_wins", conditionValue: 20, rewardType: "stat_points", rewardValue: 20, sortOrder: 24 },
    { type: "daily" as const, title: "중수 난이도 도전", description: "중수 난이도 연습게임을 1판 플레이하세요", iconEmoji: "⚔️", conditionType: "practice_games", conditionValue: 1, rewardType: "gold", rewardValue: 100, sortOrder: 25 },
    { type: "daily" as const, title: "중수 난이도 5판", description: "중수 난이도 연습게임을 5판 플레이하세요", iconEmoji: "🗡️", conditionType: "practice_games", conditionValue: 5, rewardType: "gold", rewardValue: 200, sortOrder: 26 },
    { type: "daily" as const, title: "능력치 배분 10회", description: "능력치 포인트를 10회 배분하세요", iconEmoji: "💪", conditionType: "stat_allocate", conditionValue: 10, rewardType: "gold", rewardValue: 200, sortOrder: 27 },
    { type: "daily" as const, title: "아이템 구매 5회", description: "상점에서 아이템을 5개 구매하세요", iconEmoji: "🛍️", conditionType: "item_buy", conditionValue: 5, rewardType: "stat_points", rewardValue: 10, sortOrder: 28 },
    { type: "daily" as const, title: "초보 난이도 10판", description: "초보 난이도 연습게임을 10판 플레이하세요", iconEmoji: "🌱", conditionType: "practice_games", conditionValue: 10, rewardType: "exp", rewardValue: 150, sortOrder: 29 },
    { type: "daily" as const, title: "12승 달성", description: "오늘 연습게임에서 12번 승리하세요", iconEmoji: "🏆", conditionType: "practice_wins", conditionValue: 12, rewardType: "gold", rewardValue: 250, sortOrder: 30 },

    // ── 신규 누적보상퀘스트 ──
    { type: "cumulative" as const, title: "2승 달성", description: "누적 2승을 달성하세요", iconEmoji: "⭐", conditionType: "total_wins", conditionValue: 2, rewardType: "gold", rewardValue: 50, sortOrder: 53 },
    { type: "cumulative" as const, title: "8승 달성", description: "누적 8승을 달성하세요", iconEmoji: "🎯", conditionType: "total_wins", conditionValue: 8, rewardType: "gold", rewardValue: 300, sortOrder: 54 },
    { type: "cumulative" as const, title: "15승 달성", description: "누적 15승을 달성하세요", iconEmoji: "🏅", conditionType: "total_wins", conditionValue: 15, rewardType: "gold", rewardValue: 400, sortOrder: 55 },
    { type: "cumulative" as const, title: "25승 달성", description: "누적 25승을 달성하세요", iconEmoji: "💎", conditionType: "total_wins", conditionValue: 25, rewardType: "gold", rewardValue: 600, sortOrder: 56 },
    { type: "cumulative" as const, title: "40승 달성", description: "누적 40승을 달성하세요", iconEmoji: "🌟", conditionType: "total_wins", conditionValue: 40, rewardType: "stat_points", rewardValue: 30, sortOrder: 57 },
    { type: "cumulative" as const, title: "60승 달성", description: "누적 60승을 달성하세요", iconEmoji: "🔥", conditionType: "total_wins", conditionValue: 60, rewardType: "stat_points", rewardValue: 40, sortOrder: 58 },
    { type: "cumulative" as const, title: "90승 달성", description: "누적 90승을 달성하세요", iconEmoji: "💪", conditionType: "total_wins", conditionValue: 90, rewardType: "stat_points", rewardValue: 60, sortOrder: 59 },
    { type: "cumulative" as const, title: "250승 달성", description: "누적 250승! 베테랑 프로게이머!", iconEmoji: "🎖️", conditionType: "total_wins", conditionValue: 250, rewardType: "stat_points", rewardValue: 120, sortOrder: 60 },
    { type: "cumulative" as const, title: "400승 달성", description: "누적 400승! 전설의 경지!", iconEmoji: "🏆", conditionType: "total_wins", conditionValue: 400, rewardType: "stat_points", rewardValue: 180, sortOrder: 61 },
    { type: "cumulative" as const, title: "750승 달성", description: "누적 750승! 불멸의 전설!", iconEmoji: "👑", conditionType: "total_wins", conditionValue: 750, rewardType: "stat_points", rewardValue: 300, sortOrder: 62 },

    // ── 신규 누적보상퀘스트 - 게임 수 ──
    { type: "cumulative" as const, title: "연습게임 5판", description: "연습게임을 총 5판 플레이하세요", iconEmoji: "🎮", conditionType: "total_games", conditionValue: 5, rewardType: "gold", rewardValue: 50, sortOrder: 63 },
    { type: "cumulative" as const, title: "연습게임 20판", description: "연습게임을 총 20판 플레이하세요", iconEmoji: "🎲", conditionType: "total_games", conditionValue: 20, rewardType: "gold", rewardValue: 200, sortOrder: 64 },
    { type: "cumulative" as const, title: "연습게임 75판", description: "연습게임을 총 75판 플레이하세요", iconEmoji: "🏅", conditionType: "total_games", conditionValue: 75, rewardType: "gold", rewardValue: 700, sortOrder: 65 },
    { type: "cumulative" as const, title: "연습게임 150판", description: "연습게임을 총 150판 플레이하세요", iconEmoji: "💪", conditionType: "total_games", conditionValue: 150, rewardType: "stat_points", rewardValue: 50, sortOrder: 66 },
    { type: "cumulative" as const, title: "연습게임 400판", description: "연습게임을 총 400판 플레이하세요", iconEmoji: "🔥", conditionType: "total_games", conditionValue: 400, rewardType: "stat_points", rewardValue: 100, sortOrder: 67 },
    { type: "cumulative" as const, title: "연습게임 900판", description: "연습게임을 총 900판 플레이하세요", iconEmoji: "💫", conditionType: "total_games", conditionValue: 900, rewardType: "stat_points", rewardValue: 250, sortOrder: 68 },
    { type: "cumulative" as const, title: "연습게임 1250판", description: "연습게임을 총 1250판! 끝없는 열정!", iconEmoji: "🎖️", conditionType: "total_games", conditionValue: 1250, rewardType: "stat_points", rewardValue: 350, sortOrder: 69 },

    // ── 신규 누적보상퀘스트 - 골드 ──
    { type: "cumulative" as const, title: "골드 초보자", description: "골드를 총 500 이상 획득하세요", iconEmoji: "🪙", conditionType: "total_gold_earned", conditionValue: 500, rewardType: "gold", rewardValue: 100, sortOrder: 70 },
    { type: "cumulative" as const, title: "골드 상인", description: "골드를 총 2500 이상 획득하세요", iconEmoji: "💰", conditionType: "total_gold_earned", conditionValue: 2500, rewardType: "gold", rewardValue: 300, sortOrder: 71 },
    { type: "cumulative" as const, title: "골드 거상", description: "골드를 총 7500 이상 획득하세요", iconEmoji: "💎", conditionType: "total_gold_earned", conditionValue: 7500, rewardType: "stat_points", rewardValue: 25, sortOrder: 72 },
    { type: "cumulative" as const, title: "골드 제국", description: "골드를 총 30000 이상 획득하세요", iconEmoji: "👑", conditionType: "total_gold_earned", conditionValue: 30000, rewardType: "stat_points", rewardValue: 75, sortOrder: 73 },
    { type: "cumulative" as const, title: "골드 신", description: "골드를 총 250000 이상 획득하세요", iconEmoji: "🏦", conditionType: "total_gold_earned", conditionValue: 250000, rewardType: "stat_points", rewardValue: 400, sortOrder: 74 },

    // ── 신규 누적보상퀘스트 - 레벨 ──
    { type: "cumulative" as const, title: "레벨 2 달성", description: "선수 레벨 2를 달성하세요", iconEmoji: "📊", conditionType: "player_level", conditionValue: 2, rewardType: "gold", rewardValue: 50, sortOrder: 75 },
    { type: "cumulative" as const, title: "레벨 7 달성", description: "선수 레벨 7을 달성하세요", iconEmoji: "📈", conditionType: "player_level", conditionValue: 7, rewardType: "gold", rewardValue: 200, sortOrder: 76 },
    { type: "cumulative" as const, title: "레벨 12 달성", description: "선수 레벨 12를 달성하세요", iconEmoji: "🚀", conditionType: "player_level", conditionValue: 12, rewardType: "gold", rewardValue: 350, sortOrder: 77 },
    { type: "cumulative" as const, title: "레벨 18 달성", description: "선수 레벨 18을 달성하세요", iconEmoji: "🌟", conditionType: "player_level", conditionValue: 18, rewardType: "stat_points", rewardValue: 30, sortOrder: 78 },
    { type: "cumulative" as const, title: "레벨 22 달성", description: "선수 레벨 22를 달성하세요", iconEmoji: "⭐", conditionType: "player_level", conditionValue: 22, rewardType: "stat_points", rewardValue: 40, sortOrder: 79 },
    { type: "cumulative" as const, title: "레벨 28 달성", description: "선수 레벨 28을 달성하세요", iconEmoji: "💫", conditionType: "player_level", conditionValue: 28, rewardType: "stat_points", rewardValue: 70, sortOrder: 80 },
    { type: "cumulative" as const, title: "레벨 32 달성", description: "선수 레벨 32를 달성하세요", iconEmoji: "🔥", conditionType: "player_level", conditionValue: 32, rewardType: "stat_points", rewardValue: 90, sortOrder: 81 },
    { type: "cumulative" as const, title: "레벨 38 달성", description: "선수 레벨 38을 달성하세요", iconEmoji: "💪", conditionType: "player_level", conditionValue: 38, rewardType: "stat_points", rewardValue: 140, sortOrder: 82 },
    { type: "cumulative" as const, title: "레벨 48 달성", description: "선수 레벨 48을 달성하세요", iconEmoji: "🎖️", conditionType: "player_level", conditionValue: 48, rewardType: "stat_points", rewardValue: 250, sortOrder: 83 },
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
