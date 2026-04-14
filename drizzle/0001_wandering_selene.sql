CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`price` int NOT NULL,
	`rarity` enum('common','rare','epic','legendary') NOT NULL DEFAULT 'common',
	`statBoosts` json NOT NULL,
	`iconEmoji` varchar(10) NOT NULL DEFAULT '⚔️',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`playerId` int NOT NULL,
	`itemId` int NOT NULL,
	`equipped` boolean NOT NULL DEFAULT false,
	`purchasedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `player_items_id` PRIMARY KEY(`id`)
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
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_stats_playerId_unique` UNIQUE(`playerId`)
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `players_id` PRIMARY KEY(`id`),
	CONSTRAINT `players_userId_unique` UNIQUE(`userId`)
);
