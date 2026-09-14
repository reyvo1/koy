-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM (
    'PENDING',
    'SENT',
    'ACKNOWLEDGED',
    'FAILED',
    'TIMED_OUT'
);

-- AlterTable
ALTER TABLE "device_commands"
ADD COLUMN "idempotencyKey" TEXT;

-- Convert existing command status without dropping data
ALTER TABLE "device_commands"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "device_commands"
ALTER COLUMN "status" TYPE "CommandStatus"
USING "status"::"CommandStatus";

ALTER TABLE "device_commands"
ALTER COLUMN "status" SET DEFAULT 'PENDING'::"CommandStatus";

-- CreateIndex
CREATE UNIQUE INDEX "device_commands_deviceId_idempotencyKey_key"
ON "device_commands"("deviceId", "idempotencyKey");