CREATE TABLE `events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('exp_double','fatigue_unlimited','gold_double','stat_boost') NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`isActive` tinyint NOT NULL DEFAULT 0,
	`startTime` timestamp,
	`endTime` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `game_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`playerId` int NOT NULL,
	`isWinner` tinyint NOT NULL,
	`expGained` int NOT NULL DEFAULT 0,
	`goldGained` int NOT NULL DEFAULT 0,
	`statChanges` json NOT NULL,
	`fatigueUsed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`player1Id` int NOT NULL,
	`player2Id` int NOT NULL,
	`mapId` int NOT NULL,
	`difficulty` enum('beginner','intermediate','advanced') NOT NULL,
	`player1Race` enum('terran','zerg','protoss') NOT NULL,
	`player2Race` enum('terran','zerg','protoss') NOT NULL,
	`winnerId` int,
	`player1WinProbability` int NOT NULL DEFAULT 50,
	`player1ActualScore` int NOT NULL DEFAULT 0,
	`player2ActualScore` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`completedAt` timestamp
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`price` int NOT NULL,
	`rarity` enum('common','rare','epic','legendary') NOT NULL DEFAULT 'common',
	`statBoosts` json NOT NULL,
	`iconEmoji` varchar(10) NOT NULL DEFAULT '⚔️',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`fatigueRecover` int NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `maps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`raceAdvantage` json NOT NULL,
	`rushDistance` int NOT NULL DEFAULT 50,
	`resources` int NOT NULL DEFAULT 50,
	`complexity` int NOT NULL DEFAULT 50,
	`iconEmoji` varchar(10) NOT NULL DEFAULT '🗺️',
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `player_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`itemId` int NOT NULL,
	`equipped` tinyint NOT NULL DEFAULT 0,
	`usageCount` int NOT NULL DEFAULT 20,
	`purchasedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `player_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`sense` int NOT NULL DEFAULT 500,
	`control` int NOT NULL DEFAULT 500,
	`attack` int NOT NULL DEFAULT 500,
	`harass` int NOT NULL DEFAULT 500,
	`strategy` int NOT NULL DEFAULT 500,
	`supply` int NOT NULL DEFAULT 500,
	`defense` int NOT NULL DEFAULT 500,
	`scout` int NOT NULL DEFAULT 500,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`race` enum('terran','zerg','protoss') NOT NULL,
	`photoUrl` text,
	`level` int NOT NULL DEFAULT 1,
	`exp` int NOT NULL DEFAULT 0,
	`expToNext` int NOT NULL DEFAULT 100,
	`statPoints` int NOT NULL DEFAULT 0,
	`gold` int NOT NULL DEFAULT 1000,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`fatigue` int NOT NULL DEFAULT 100,
	`lastFatigueRecovery` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
CREATE INDEX `player_stats_playerId_unique` ON `player_stats` (`playerId`);--> statement-breakpoint
CREATE INDEX `players_userId_unique` ON `players` (`userId`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);