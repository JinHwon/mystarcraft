import { mysqlTable, mysqlSchema, AnyMySqlColumn, int, mysqlEnum, varchar, text, longtext, timestamp, json, index, uniqueIndex, tinyint } from "drizzle-orm/mysql-core"
import { sql } from "drizzle-orm"

export const events = mysqlTable("events", {
	id: int().autoincrement().notNull().primaryKey(),
	type: mysqlEnum(['exp_double','fatigue_unlimited','gold_double','stat_boost']).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	isActive: tinyint().default(0).notNull(),
	startTime: timestamp({ mode: 'string' }),
	endTime: timestamp({ mode: 'string' }),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
});

export const gameResults = mysqlTable("game_results", {
	id: int().autoincrement().notNull().primaryKey(),
	gameId: int().notNull(),
	playerId: int().notNull(),
	opponentId: int().default(0).notNull(),
	isWinner: tinyint().notNull(),
	expGained: int().default(0).notNull(),
	goldGained: int().default(0).notNull(),
	statChanges: json().notNull(),
	fatigueUsed: int().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const games = mysqlTable("games", {
	id: int().autoincrement().notNull().primaryKey(),
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
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	completedAt: timestamp({ mode: 'string' }),
});

export const items = mysqlTable("items", {
	id: int().autoincrement().notNull().primaryKey(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	price: int().notNull(),
	rarity: mysqlEnum(['common','rare','epic','legendary']).default('common').notNull(),
	statBoosts: json().notNull(),
	iconEmoji: varchar({ length: 10 }).default('⚔️').notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	fatigueRecover: int().default(0).notNull(),
});

export const maps = mysqlTable("maps", {
	id: int().autoincrement().notNull().primaryKey(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	raceAdvantage: json().notNull(),
	rushDistance: int().default(50).notNull(),
	resources: int().default(50).notNull(),
	complexity: int().default(50).notNull(),
	iconEmoji: varchar({ length: 10 }).default('🗺️').notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	nameEn: varchar({ length: 100 }).default('').notNull(),
	players: int().default(2).notNull(),
	era: varchar({ length: 30 }).default('').notNull(),
	// 맵 선택 목록 노출 여부 (예전 가상 맵은 0 — 기존 경기 기록 조회용으로만 남김)
	isActive: tinyint().default(1).notNull(),
});

export const playerItems = mysqlTable("player_items", {
	id: int().autoincrement().notNull().primaryKey(),
	playerId: int().notNull(),
	itemId: int().notNull(),
	equipped: tinyint().default(0).notNull(),
	usageCount: int().default(20).notNull(),
	purchasedAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const playerStats = mysqlTable("player_stats", {
	id: int().autoincrement().notNull().primaryKey(),
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
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().notNull(),
	name: varchar({ length: 100 }).notNull(),
	race: mysqlEnum(['terran','zerg','protoss']).notNull(),
	photoUrl: text(),
	level: int().default(1).notNull(),
	exp: int().default(0).notNull(),
	expToNext: int().default(100).notNull(),
	statPoints: int().default(0).notNull(),
	gold: int().default(1000).notNull(),
	grade: mysqlEnum(['S','A','B','C','D']).default('D').notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	fatigue: int().default(100).notNull(),
	lastFatigueRecovery: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	// 매칭 상대가 없을 때 자동 생성되는 AI 선수 (userId 0). 전적/랭킹/성장은 일반 선수와 동일
	isBot: tinyint().default(0).notNull(),
	// 소속 팀 (0 = 무소속/자유계약 AI)
	teamId: int().default(0).notNull(),
	// 컨디션 80~120 (%). 매일(KST) 새로 정해지고 훈련/휴식/경기 결과로 변동
	condition: int("playerCondition").default(100).notNull(),
	conditionDate: varchar({ length: 10 }).default('').notNull(),
	// 마지막 휴식 날짜 (KST, 하루 1회)
	lastRestDate: varchar({ length: 10 }).default('').notNull(),
},
(table) => [
	index("players_userId_unique").on(table.userId),
]);

export const users = mysqlTable("users", {
	id: int().autoincrement().notNull().primaryKey(),
	openId: varchar({ length: 64 }).notNull(),
	name: text(),
	email: varchar({ length: 320 }),
	loginMethod: varchar({ length: 64 }),
	role: mysqlEnum(['user','admin']).default('user').notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
	lastSignedIn: timestamp({ mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	uniqueIndex("users_openId_unique").on(table.openId),
]);

// 자체 로그인(아이디/비밀번호) 자격 증명. users 행이 API로 노출돼도 해시가 새지 않도록 별도 테이블에 보관
export const localCredentials = mysqlTable("local_credentials", {
	id: int().autoincrement().notNull().primaryKey(),
	openId: varchar({ length: 64 }).notNull(),
	passwordHash: varchar({ length: 255 }).notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	uniqueIndex("local_credentials_openId_unique").on(table.openId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Player = typeof players.$inferSelect;
export type InsertPlayer = typeof players.$inferInsert;
export type PlayerStats = typeof playerStats.$inferSelect;
export type Item = typeof items.$inferSelect;
export type PlayerItem = typeof playerItems.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameResult = typeof gameResults.$inferSelect;
export type Map = typeof maps.$inferSelect;
export type Event = typeof events.$inferSelect;

// ── Quest System ─────────────────────────────────────────────────

export const quests = mysqlTable("quests", {
	id: int().autoincrement().notNull().primaryKey(),
	type: mysqlEnum(['daily','cumulative']).notNull(),
	title: varchar({ length: 200 }).notNull(),
	description: text(),
	iconEmoji: varchar({ length: 10 }).default('📋').notNull(),
	conditionType: varchar({ length: 50 }).notNull(), // e.g. 'practice_games', 'practice_wins', 'gold_spend', 'stat_allocate', 'item_buy', 'login'
	conditionValue: int().notNull(), // target count
	rewardType: varchar({ length: 50 }).notNull(), // 'gold', 'fatigue', 'exp', 'stat_points'
	rewardValue: int().notNull(),
	sortOrder: int().default(0).notNull(),
	isActive: tinyint().default(1).notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const playerQuestProgress = mysqlTable("player_quest_progress", {
	id: int().autoincrement().notNull().primaryKey(),
	playerId: int().notNull(),
	questId: int().notNull(),
	progress: int().default(0).notNull(),
	completed: tinyint().default(0).notNull(),
	rewardClaimed: tinyint().default(0).notNull(),
	lastResetDate: varchar({ length: 10 }), // 'YYYY-MM-DD' for daily quest reset tracking
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	index("pqp_player_quest").on(table.playerId, table.questId),
]);

export type Quest = typeof quests.$inferSelect;
export type PlayerQuestProgress = typeof playerQuestProgress.$inferSelect;

// 프로팀. 유저당 1개 (userId 0 = AI 팀)
export const teams = mysqlTable("teams", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().default(0).notNull(),
	name: varchar({ length: 50 }).notNull(),
	emblem: varchar({ length: 10 }).default('🛡️').notNull(),
	isAi: tinyint().default(0).notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => [
	index("teams_userId_idx").on(table.userId),
]);

// 리그 시즌 (유저 팀별). kind: proleague(팀 리그) / individual(개인리그 토너먼트)
export const leagueSeasons = mysqlTable("league_seasons", {
	id: int().autoincrement().notNull().primaryKey(),
	teamId: int().notNull(),
	kind: mysqlEnum(['proleague','individual']).notNull(),
	seasonNo: int().default(1).notNull(),
	status: mysqlEnum(['active','finished']).default('active').notNull(),
	round: int().default(1).notNull(),
	// proleague: { teamIds, mapPool } / individual: { entrants, mapPool }
	data: json().notNull(),
	// 시즌 종료 결과 (순위·상금·우승자 등)
	result: json(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	finishedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("league_seasons_team_idx").on(table.teamId, table.kind),
]);

// 리그 경기. proleague 는 sideA/sideB 가 팀 id, individual 은 선수 id
export const leagueMatches = mysqlTable("league_matches", {
	id: int().autoincrement().notNull().primaryKey(),
	seasonId: int().notNull(),
	round: int().notNull(),
	slot: int().default(0).notNull(),
	sideA: int().notNull(),
	sideB: int().notNull(),
	scoreA: int().default(0).notNull(),
	scoreB: int().default(0).notNull(),
	status: mysqlEnum(['scheduled','done']).default('scheduled').notNull(),
	winner: int(),
	// 세트별 결과 [{ map, a, b, winner, highlights }]
	sets: json(),
	playedAt: timestamp({ mode: 'string' }),
},
(table) => [
	index("league_matches_season_idx").on(table.seasonId, table.round),
]);

// 커리어 모드(원작 방식) 세이브. 유저당 1개, 세계 전체 상태를 JSON 으로 저장
export const careers = mysqlTable("careers", {
	id: int().autoincrement().notNull().primaryKey(),
	userId: int().notNull(),
	state: longtext().notNull(),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp({ mode: 'string' }).defaultNow().onUpdateNow().notNull(),
},
(table) => [
	uniqueIndex("careers_userId_unique").on(table.userId),
]);
