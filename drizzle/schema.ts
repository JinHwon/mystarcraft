import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// 선수 테이블
export const players = mysqlTable("players", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(), // 계정당 1명
  name: varchar("name", { length: 100 }).notNull(),
  race: mysqlEnum("race", ["terran", "zerg", "protoss"]).notNull(),
  photoUrl: text("photoUrl"),
  level: int("level").default(1).notNull(),
  exp: int("exp").default(0).notNull(),
  expToNext: int("expToNext").default(100).notNull(),
  statPoints: int("statPoints").default(0).notNull(), // 미배분 포인트
  gold: int("gold").default(1000).notNull(), // 게임 내 재화
  fatigue: int("fatigue").default(100).notNull(), // 피로도 (0-100)
  lastFatigueRecovery: timestamp("lastFatigueRecovery").defaultNow().notNull(), // 마지막 회복 시간
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;

// 선수 능력치 테이블
export const playerStats = mysqlTable("player_stats", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull().unique(),
  sense: int("sense").default(500).notNull(),      // 센스
  control: int("control").default(500).notNull(),  // 컨트롤
  attack: int("attack").default(500).notNull(),    // 공격력
  harass: int("harass").default(500).notNull(),    // 견제
  strategy: int("strategy").default(500).notNull(), // 전략
  supply: int("supply").default(500).notNull(),    // 물량
  defense: int("defense").default(500).notNull(),  // 수비력
  scout: int("scout").default(500).notNull(),      // 정찰
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PlayerStats = typeof playerStats.$inferSelect;
export type InsertPlayerStats = typeof playerStats.$inferInsert;

// 아이템 테이블
export const items = mysqlTable("items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: int("price").notNull(),
  rarity: mysqlEnum("rarity", ["common", "rare", "epic", "legendary"]).default("common").notNull(),
  // 능력치 보너스 JSON: { sense, control, attack, harass, strategy, supply, defense, scout }
  statBoosts: json("statBoosts").notNull(),
  fatigueRecover: int("fatigueRecover").default(0).notNull(), // 피로도 회복량 (0이면 능력치 보너스만)
  iconEmoji: varchar("iconEmoji", { length: 10 }).default("⚔️").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Item = typeof items.$inferSelect;
export type InsertItem = typeof items.$inferInsert;

// 선수-아이템 관계 테이블
export const playerItems = mysqlTable("player_items", {
  id: int("id").autoincrement().primaryKey(),
  playerId: int("playerId").notNull(),
  itemId: int("itemId").notNull(),
  equipped: boolean("equipped").default(false).notNull(),
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
});

export type PlayerItem = typeof playerItems.$inferSelect;
export type InsertPlayerItem = typeof playerItems.$inferInsert;

// 이벤트 테이블
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["exp_double", "fatigue_unlimited", "gold_double", "stat_boost"]).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(false).notNull(),
  startTime: timestamp("startTime"),
  endTime: timestamp("endTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;
