-- AlterTable
ALTER TABLE "devices" ADD COLUMN "provisioningTokenHash" TEXT,
ADD COLUMN "provisioningTokenExpires" TIMESTAMP(3);
