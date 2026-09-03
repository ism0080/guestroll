ALTER TABLE `cameras` ADD `guestId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `cameras_event_guest_unique` ON `cameras` (`eventId`,`guestId`);