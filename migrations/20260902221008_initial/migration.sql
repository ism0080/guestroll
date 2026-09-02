CREATE TABLE `cameras` (
	`id` text PRIMARY KEY,
	`eventId` text NOT NULL,
	`guestName` text,
	`usedCount` integer DEFAULT 0 NOT NULL,
	`createdAt` text NOT NULL,
	CONSTRAINT `fk_cameras_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`),
	CONSTRAINT `cameras_id_event_id_unique` UNIQUE(`id`,`eventId`),
	CONSTRAINT "cameras_used_count_non_negative" CHECK("usedCount" >= 0)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY,
	`ownerId` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`coverKey` text,
	`filterPack` text NOT NULL,
	`photoLimit` integer NOT NULL,
	`status` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT "events_photo_limit_positive" CHECK("photoLimit" > 0),
	CONSTRAINT "events_status_valid" CHECK("status" IN ('draft', 'live'))
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY,
	`uploadId` text NOT NULL,
	`eventId` text NOT NULL,
	`cameraId` text NOT NULL,
	`objectKey` text NOT NULL UNIQUE,
	`thumbKey` text NOT NULL,
	`takenAt` text NOT NULL,
	`uploadedAt` text NOT NULL,
	CONSTRAINT `fk_photos_cameraId_eventId_cameras_id_eventId_fk` FOREIGN KEY (`cameraId`,`eventId`) REFERENCES `cameras`(`id`,`eventId`) ON DELETE CASCADE,
	CONSTRAINT `photos_camera_upload_unique` UNIQUE(`cameraId`,`uploadId`)
);
--> statement-breakpoint
CREATE INDEX `cameras_event_id_idx` ON `cameras` (`eventId`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_owner_id_created_at_idx` ON `events` (`ownerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `photos_event_id_uploaded_at_id_idx` ON `photos` (`eventId`,`uploadedAt`,`id`);--> statement-breakpoint
CREATE INDEX `photos_camera_id_idx` ON `photos` (`cameraId`);