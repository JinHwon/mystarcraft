ALTER TABLE `players` ADD `fatigue` int DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `lastFatigueRecovery` timestamp DEFAULT (now()) NOT NULL;