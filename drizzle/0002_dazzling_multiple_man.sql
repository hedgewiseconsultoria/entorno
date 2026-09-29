CREATE TABLE `source_payloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceSlug` varchar(80) NOT NULL,
	`sourceName` varchar(180) NOT NULL,
	`format` enum('geojson','csv','json') NOT NULL,
	`sourceUrl` text NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`rowCount` int,
	`checksum` varchar(128) NOT NULL,
	`payload` longtext NOT NULL,
	CONSTRAINT `source_payloads_id` PRIMARY KEY(`id`),
	CONSTRAINT `source_payloads_sourceSlug_unique` UNIQUE(`sourceSlug`)
);
