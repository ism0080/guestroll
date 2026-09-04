CREATE UNIQUE INDEX `cameras_active_guest_unique` ON `cameras` (`eventId`,`guestId`) WHERE "cameras"."resetAt" IS NULL;--> statement-breakpoint
ALTER TABLE `events` DROP COLUMN `coverKey`;