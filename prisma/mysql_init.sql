-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'VIEWER') NOT NULL DEFAULT 'OWNER',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userAgent` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_tokenHash_key`(`tokenHash`),
    INDEX `sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agents` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `installationId` VARCHAR(191) NOT NULL,
    `credentialPrefix` VARCHAR(191) NOT NULL,
    `credentialHash` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
    `platform` VARCHAR(191) NULL,
    `terminalBuild` INTEGER NULL,
    `terminalCompany` VARCHAR(191) NULL,
    `terminalName` VARCHAR(191) NULL,
    `eaVersion` VARCHAR(191) NULL,
    `fullSync` BOOLEAN NOT NULL DEFAULT true,
    `pairedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `lastSeenAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agents_installationId_key`(`installationId`),
    UNIQUE INDEX `agents_credentialPrefix_key`(`credentialPrefix`),
    INDEX `agents_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pairing_codes` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `codePrefix` VARCHAR(191) NOT NULL,
    `codeHash` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `agentId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `pairing_codes_codeHash_key`(`codeHash`),
    UNIQUE INDEX `pairing_codes_agentId_key`(`agentId`),
    INDEX `pairing_codes_userId_expiresAt_idx`(`userId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `displayName` VARCHAR(191) NULL,
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `login` VARCHAR(191) NOT NULL,
    `broker` VARCHAR(191) NOT NULL,
    `server` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `mode` ENUM('LIVE', 'DEMO') NOT NULL DEFAULT 'DEMO',
    `equityPeak` DOUBLE NOT NULL DEFAULT 0,
    `maxDrawdownPct` DOUBLE NOT NULL DEFAULT 0,
    `todayRealizedPl` DOUBLE NULL,
    `realizedPlDay` VARCHAR(191) NULL,
    `monthlyPl` JSON NULL,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `equity` DOUBLE NOT NULL DEFAULT 0,
    `credit` DOUBLE NOT NULL DEFAULT 0,
    `margin` DOUBLE NOT NULL DEFAULT 0,
    `freeMargin` DOUBLE NOT NULL DEFAULT 0,
    `marginLevel` DOUBLE NOT NULL DEFAULT 0,
    `leverage` INTEGER NOT NULL DEFAULT 100,
    `tradeAllowed` BOOLEAN NOT NULL DEFAULT true,
    `algoTrading` BOOLEAN NOT NULL DEFAULT true,
    `terminalConnected` BOOLEAN NOT NULL DEFAULT false,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `snapshotAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `accounts_userId_idx`(`userId`),
    INDEX `accounts_agentId_idx`(`agentId`),
    UNIQUE INDEX `accounts_userId_login_server_key`(`userId`, `login`, `server`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ea_status` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `eaLoaded` BOOLEAN NOT NULL DEFAULT false,
    `terminalConnected` BOOLEAN NOT NULL DEFAULT false,
    `algoTrading` BOOLEAN NOT NULL DEFAULT true,
    `build` INTEGER NULL,
    `message` VARCHAR(191) NULL,
    `lastHeartbeatAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ea_status_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `heartbeats` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `accountLogin` VARCHAR(191) NULL,
    `broker` VARCHAR(191) NULL,
    `server` VARCHAR(191) NULL,
    `terminalConnected` BOOLEAN NOT NULL DEFAULT false,
    `eaLoaded` BOOLEAN NOT NULL DEFAULT false,
    `build` INTEGER NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `heartbeats_agentId_key`(`agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `balance` DOUBLE NOT NULL,
    `equity` DOUBLE NOT NULL,
    `floatingPl` DOUBLE NOT NULL DEFAULT 0,
    `margin` DOUBLE NOT NULL DEFAULT 0,
    `freeMargin` DOUBLE NOT NULL DEFAULT 0,
    `marginLevel` DOUBLE NOT NULL DEFAULT 0,

    INDEX `account_snapshots_accountId_at_idx`(`accountId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equity_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `equity` DOUBLE NOT NULL,
    `balance` DOUBLE NOT NULL,

    INDEX `equity_snapshots_accountId_at_idx`(`accountId`, `at`),
    INDEX `equity_snapshots_at_idx`(`at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `positions` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `ticket` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `type` ENUM('BUY', 'SELL') NOT NULL,
    `volume` DOUBLE NOT NULL,
    `openPrice` DOUBLE NOT NULL,
    `currentPrice` DOUBLE NOT NULL,
    `sl` DOUBLE NOT NULL DEFAULT 0,
    `tp` DOUBLE NOT NULL DEFAULT 0,
    `swap` DOUBLE NOT NULL DEFAULT 0,
    `commission` DOUBLE NOT NULL DEFAULT 0,
    `profit` DOUBLE NOT NULL DEFAULT 0,
    `magic` VARCHAR(191) NOT NULL DEFAULT '0',
    `comment` VARCHAR(191) NOT NULL DEFAULT '',
    `openTime` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `positions_accountId_symbol_idx`(`accountId`, `symbol`),
    UNIQUE INDEX `positions_accountId_ticket_key`(`accountId`, `ticket`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `ticket` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `volume` DOUBLE NOT NULL,
    `price` DOUBLE NOT NULL,
    `sl` DOUBLE NOT NULL DEFAULT 0,
    `tp` DOUBLE NOT NULL DEFAULT 0,
    `magic` VARCHAR(191) NOT NULL DEFAULT '0',
    `comment` VARCHAR(191) NOT NULL DEFAULT '',
    `createTime` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `orders_accountId_createTime_idx`(`accountId`, `createTime`),
    UNIQUE INDEX `orders_accountId_ticket_key`(`accountId`, `ticket`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `groups` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#3b82f6',
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `groups_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_groups` (
    `accountId` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`accountId`, `groupId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ACCOUNT_OFFLINE', 'EA_OFFLINE', 'DRAWDOWN_EXCEEDED', 'DAILY_LOSS_EXCEEDED', 'MARGIN_LEVEL_LOW', 'ALGO_TRADING_DISABLED', 'LARGE_POSITION', 'LARGE_LOSS', 'LARGE_PROFIT') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `threshold` DOUBLE NOT NULL DEFAULT 0,
    `accountId` VARCHAR(191) NULL,
    `cooldownSeconds` INTEGER NOT NULL DEFAULT 300,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `alerts_userId_type_idx`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alert_events` (
    `id` VARCHAR(191) NOT NULL,
    `alertId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('ACCOUNT_OFFLINE', 'EA_OFFLINE', 'DRAWDOWN_EXCEEDED', 'DAILY_LOSS_EXCEEDED', 'MARGIN_LEVEL_LOW', 'ALGO_TRADING_DISABLED', 'LARGE_POSITION', 'LARGE_LOSS', 'LARGE_PROFIT') NOT NULL,
    `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
    `value` DOUBLE NOT NULL,
    `threshold` DOUBLE NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `triggeredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `acknowledgedAt` DATETIME(3) NULL,

    UNIQUE INDEX `alert_events_dedupeKey_key`(`dedupeKey`),
    INDEX `alert_events_userId_triggeredAt_idx`(`userId`, `triggeredAt`),
    INDEX `alert_events_accountId_type_triggeredAt_idx`(`accountId`, `type`, `triggeredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `settings_userId_key_key`(`userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limits` (
    `key` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`, `windowStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `realtime_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `realtime_events_userId_id_idx`(`userId`, `id`),
    INDEX `realtime_events_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pairing_codes` ADD CONSTRAINT `pairing_codes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pairing_codes` ADD CONSTRAINT `pairing_codes_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ea_status` ADD CONSTRAINT `ea_status_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `heartbeats` ADD CONSTRAINT `heartbeats_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_snapshots` ADD CONSTRAINT `account_snapshots_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equity_snapshots` ADD CONSTRAINT `equity_snapshots_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `positions` ADD CONSTRAINT `positions_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `groups` ADD CONSTRAINT `groups_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_groups` ADD CONSTRAINT `account_groups_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_groups` ADD CONSTRAINT `account_groups_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_events` ADD CONSTRAINT `alert_events_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `alerts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_events` ADD CONSTRAINT `alert_events_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alert_events` ADD CONSTRAINT `alert_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `realtime_events` ADD CONSTRAINT `realtime_events_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

