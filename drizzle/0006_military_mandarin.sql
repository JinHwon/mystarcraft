ALTER TABLE `player_stats` DROP INDEX `player_stats_playerId_unique`;--> statement-breakpoint
ALTER TABLE `players` DROP INDEX `players_userId_unique`;--> statement-breakpoint
ALTER TABLE `users` DROP INDEX `users_openId_unique`;--> statement-breakpoint
ALTER TABLE `events` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `game_results` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `games` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `maps` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `player_items` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `player_stats` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `players` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `users` DROP PRIMARY KEY;--> statement-breakpoint
ALTER TABLE `events` MODIFY COLUMN `isActive` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `events` MODIFY COLUMN `isActive` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `events` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `game_results` MODIFY COLUMN `isWinner` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `game_results` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `games` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `items` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `maps` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `player_items` MODIFY COLUMN `equipped` tinyint NOT NULL;--> statement-breakpoint
ALTER TABLE `player_items` MODIFY COLUMN `equipped` tinyint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `player_items` MODIFY COLUMN `purchasedAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `players` MODIFY COLUMN `lastFatigueRecovery` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `players` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP';--> statement-breakpoint
CREATE INDEX `player_stats_playerId_unique` ON `player_stats` (`playerId`);--> statement-breakpoint
CREATE INDEX `players_userId_unique` ON `players` (`userId`);--> statement-breakpoint
CREATE INDEX `users_openId_unique` ON `users` (`openId`);