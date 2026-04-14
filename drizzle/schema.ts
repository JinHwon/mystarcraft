import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, mysqlEnum, varchar, text, timestamp, json, index, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const events = mysqlTable("events", {
	id: int().autoincrement().notNull(),
	type: mysqlEnum(['exp_double','fatigue_unlimited','gold_double','stat_boost']).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	isActive: tinyint().default(0).notNull(),
	startTime: timestamp({ mode: 'string' }),
	endTime: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const gameResults = mysqlTable("game_results", {
	id: int().autoincrement().notNull(),
	gameId: int().notNull(),
	playerId: int().notNull(),
	isWinner: tinyint().notNull(),
	expGained: int().default(0).notNull(),
	goldGained: int().default(0).notNull(),
	statChanges: json().notNull(),
	fatigueUsed: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const games = mysqlTable("games", {
	id: int().autoincrement().notNull(),
	player1Id: int().notNull(),
	player2Id: int().notNull(),
	mapId: int().notNull(),
	difficulty: mysqlEnum(['beginner','intermediate','advanced']).notNull(),
	player1Race: mysqlEnum(['terran','zerg','protoss']).notNull(),
	player2Race: mysqlEnum(['terran','zerg','protoss']).notNull(),
	winnerId: int(),
	player1WinProbability: int().default(50).notNull(),
	player1ActualScore: int().default(0).notNull(),
	player2ActualScore: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	completedAt: timestamp({ mode: 'string' }),
});

export const items = mysqlTable("items", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	price: int().notNull(),
	rarity: mysqlEnum(['common','rare','epic','legendary']).default('common').notNull(),
	statBoosts: json().notNull(),
	iconEmoji: varchar({ length: 10 }).default('⚔️').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	fatigueRecover: int().default(0).notNull(),
});

export const maps = mysqlTable("maps", {
	id: int().autoincrement().notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	raceAdvantage: json().notNull(),
	rushDistance: int().default(50).notNull(),
	resources: int().default(50).notNull(),
	complexity: int().default(50).notNull(),
	iconEmoji: varchar({ length: 10 }).default('🗺️').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const playerItems = mysqlTable("player_items", {
	id: int().autoincrement().notNull(),
	playerId: int().notNull(),
	itemId: int().notNull(),
	equipped: tinyint().default(0).notNull(),
	purchasedAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
});

export const playerStats = mysqlTable("player_stats", {
	id: int().autoincrement().notNull(),
	playerId: int().notNull(),
	sense: int().default(500).notNull(),
	control: int().default(500).notNull(),
	attack: int().default(500).notNull(),
	harass: int().default(500).notNull(),
	strategy: int().default(500).notNull(),
	supply: int().default(500).notNull(),
	defense: int().default(500).notNull(),
	scout: int().default(500).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("player_stats_playerId_unique").on(table.playerId),
]);

export const players = mysqlTable("players", {
	id: int().autoincrement().notNull(),
	userId: int().notNull(),
	name: varchar({ length: 100 }).notNull(),
	race: mysqlEnum(['terran','zerg','protoss']).notNull(),
	photoUrl: text(),
	level: int().default(1).notNull(),
	exp: int().default(0).notNull(),
	expToNext: int().default(100).notNull(),
	statPoints: int().default(0).notNull(),
	gold: int().default(1000).notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	fatigue: int().default(100).notNull(),
	lastFatigueRecovery: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("players_userId_unique").on(table.userId),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'string' }).default('CURRENT_TIMESTAMP').notNull(),
},
(table) => [
	index("users_openId_unique").on(table.openId),
]);
