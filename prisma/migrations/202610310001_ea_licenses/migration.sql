-- CreateTable
CREATE TABLE IF NOT EXISTS `ea_licenses` (
    `id` VARCHAR(191) NOT NULL,
    `license_key` VARCHAR(191) NOT NULL,
    `account_number` BIGINT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `expires_at` DATETIME(3) NULL,
    `last_verified_at` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `created_by_id` VARCHAR(191) NULL,

    UNIQUE INDEX `ea_licenses_license_key_key`(`license_key`),
    INDEX `ea_licenses_account_number_idx`(`account_number`),
    INDEX `ea_licenses_license_key_is_active_idx`(`license_key`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey (ignore if users table constraint already exists or FK disabled)
ALTER TABLE `ea_licenses` ADD CONSTRAINT `ea_licenses_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

