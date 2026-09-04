CREATE TABLE `host_sessions` (
	`id` text PRIMARY KEY,
	`createdAt` text NOT NULL,
	`expiresAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `host_sessions_expires_at_idx` ON `host_sessions` (`expiresAt`);