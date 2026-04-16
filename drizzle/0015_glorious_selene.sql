CREATE TABLE `player_quest_progress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`questId` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`completed` tinyint NOT NULL DEFAULT 0,
	`rewardClaimed` tinyint NOT NULL DEFAULT 0,
	`lastResetDate` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `quests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('daily','cumulative') NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`iconEmoji` varchar(10) NOT NULL DEFAULT '📋',
	`conditionType` varchar(50) NOT NULL,
	`conditionValue` int NOT NULL,
	`rewardType` varchar(50) NOT NULL,
	`rewardValue` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` tinyint NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastSignedIn` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
CREATE INDEX `pqp_player_quest` ON `player_quest_progress` (`playerId`,`questId`);