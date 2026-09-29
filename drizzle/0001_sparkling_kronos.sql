CREATE TABLE `source_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceSlug` varchar(80) NOT NULL,
	`sourceName` varchar(180) NOT NULL,
	`sourceUrl` text NOT NULL,
	`status` enum('ok','warning','error','manual') NOT NULL DEFAULT 'manual',
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`rowCount` int,
	`httpStatus` int,
	`checksum` varchar(128),
	`metadata` text,
	CONSTRAINT `source_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('ruido','iluminacao','agua','energia','alagamento','patrimonial') NOT NULL,
	`detail` text NOT NULL,
	`addressApprox` varchar(255),
	`latitude` double,
	`longitude` double,
	`observedAt` timestamp,
	`status` enum('pending','approved','rejected','contested') NOT NULL DEFAULT 'pending',
	`confidence` enum('unreviewed','low','medium','high') NOT NULL DEFAULT 'unreviewed',
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_reports_id` PRIMARY KEY(`id`)
);
