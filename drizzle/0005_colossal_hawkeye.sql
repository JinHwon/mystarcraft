CREATE TABLE `game_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`playerId` int NOT NULL,
	`isWinner` boolean NOT NULL,
	`expGained` int NOT NULL DEFAULT 0,
	`goldGained` int NOT NULL DEFAULT 0,
	`statChanges` json NOT NULL,
	`fatigueUsed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_results_id` PRIMARY KEY(`id`)
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `games_id` PRIMARY KEY(`id`)
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `maps_id` PRIMARY KEY(`id`)
);
