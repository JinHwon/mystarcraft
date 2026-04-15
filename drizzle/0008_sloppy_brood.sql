DROP TABLE `events`;--> statement-breakpoint
DROP TABLE `game_results`;--> statement-breakpoint
DROP TABLE `games`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
DROP TABLE `maps`;--> statement-breakpoint
DROP TABLE `player_items`;--> statement-breakpoint
DROP TABLE `player_stats`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
DROP INDEX `users_openId_unique` ON `users`;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT (now());--> statement-breakpoint
ALTER TABLE `users` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_openId_unique` UNIQUE(`openId`);