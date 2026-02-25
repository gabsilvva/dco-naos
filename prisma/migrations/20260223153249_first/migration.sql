-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(36) NOT NULL,
    `crm` CHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `availability` VARCHAR(255) NOT NULL,
    `product` JSON NOT NULL,
    `creative` JSON NOT NULL,
    `medias` JSON NOT NULL,
    `updated` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `crm`(`crm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `leadid` VARCHAR(255) NOT NULL,
    `formid` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(255) NOT NULL,
    `crm` VARCHAR(255) NOT NULL,
    `created` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`leadid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
