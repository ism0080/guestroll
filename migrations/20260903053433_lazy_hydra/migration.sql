CREATE TABLE `downloads` (
	`eventId` text PRIMARY KEY,
	`status` text NOT NULL,
	`objectKey` text,
	`photoCount` integer DEFAULT 0 NOT NULL,
	`size` integer,
	`updatedAt` text NOT NULL,
	CONSTRAINT `fk_downloads_eventId_events_id_fk` FOREIGN KEY (`eventId`) REFERENCES `events`(`id`),
	CONSTRAINT "downloads_status_valid" CHECK("status" IN ('building', 'ready', 'error'))
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_photos` (
	`id` text PRIMARY KEY,
	`uploadId` text NOT NULL,
	`eventId` text NOT NULL,
	`cameraId` text NOT NULL,
	`objectKey` text NOT NULL UNIQUE,
	`thumbKey` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`contentDigest` text,
	`takenAt` text NOT NULL,
	`uploadedAt` text NOT NULL,
	CONSTRAINT `fk_photos_cameraId_eventId_cameras_id_eventId_fk` FOREIGN KEY (`cameraId`,`eventId`) REFERENCES `cameras`(`id`,`eventId`) ON DELETE CASCADE,
	CONSTRAINT `photos_camera_upload_unique` UNIQUE(`cameraId`,`uploadId`),
	CONSTRAINT "photos_status_valid" CHECK("status" IN ('pending', 'uploaded'))
);
--> statement-breakpoint
INSERT INTO `__new_photos`(`id`, `uploadId`, `eventId`, `cameraId`, `objectKey`, `thumbKey`, `status`, `contentDigest`, `takenAt`, `uploadedAt`) SELECT `id`, `uploadId`, `eventId`, `cameraId`, `objectKey`, `thumbKey`, `status`, `contentDigest`, `takenAt`, `uploadedAt` FROM `photos`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
ALTER TABLE `__new_photos` RENAME TO `photos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `photos_event_id_uploaded_at_id_idx` ON `photos` (`eventId`,`uploadedAt`,`id`);--> statement-breakpoint
CREATE INDEX `photos_camera_id_idx` ON `photos` (`cameraId`);