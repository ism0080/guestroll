ALTER TABLE `photos` ADD `status` text DEFAULT 'uploaded' NOT NULL CHECK(`status` IN ('pending', 'uploaded'));
