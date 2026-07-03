-- GATEWAY-WA S1/S2: telemetria do disjuntor + event outbox (aditivo).

-- CreateTable
CREATE TABLE `ConnectionEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instanceName` VARCHAR(255) NOT NULL,
    `event` VARCHAR(50) NOT NULL,
    `statusCode` INTEGER NULL,
    `attempt` INTEGER NULL,
    `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX `ConnectionEvent_instanceName_idx`(`instanceName`),
    INDEX `ConnectionEvent_instanceName_createdAt_idx`(`instanceName`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EventOutbox` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instanceName` VARCHAR(255) NOT NULL,
    `eventName` VARCHAR(100) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX `EventOutbox_instanceName_idx`(`instanceName`),
    INDEX `EventOutbox_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
