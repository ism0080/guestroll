ALTER TABLE `cameras` ADD `resetAt` text;--> statement-breakpoint
DROP INDEX IF EXISTS `cameras_event_guest_unique`;