-- =========================================================================
-- MQL5 EA Licensing System — MySQL Database Schema
-- Table: ea_licenses
-- Website: investmentsview.com
-- =========================================================================

CREATE TABLE IF NOT EXISTS `ea_licenses` (
  `id` VARCHAR(36) NOT NULL,
  `license_key` VARCHAR(64) NOT NULL,
  `account_number` BIGINT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `expires_at` DATETIME NULL,
  `last_verified_at` DATETIME NULL,
  `notes` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by_id` VARCHAR(36) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_license_key` (`license_key`),
  KEY `idx_account_number` (`account_number`),
  KEY `idx_lookup` (`license_key`, `is_active`, `expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
