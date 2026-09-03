ALTER TABLE `photos` ADD `status` text DEFAULT 'pending' NOT NULL CHECK(`status` IN ('pending', 'uploaded'));
