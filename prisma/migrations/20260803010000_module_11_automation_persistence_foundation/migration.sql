-- CreateEnum
CREATE TYPE "AutomationTriggerKind" AS ENUM ('CAPABILITY_REPORTED');

-- CreateEnum
CREATE TYPE "AutomationActionKind" AS ENUM ('DEVICE_COMMAND');

-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerMembershipId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "triggerKind" "AutomationTriggerKind" NOT NULL,
    "triggerDeviceId" TEXT NOT NULL,
    "triggerCapabilityId" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AutomationActionKind" NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automations_id_tenantId_key" ON "automations"("id", "tenantId");
CREATE INDEX "automations_tenantId_ownerMembershipId_idx" ON "automations"("tenantId", "ownerMembershipId");
CREATE INDEX "automations_tenantId_enabled_idx" ON "automations"("tenantId", "enabled");
CREATE INDEX "automations_trigger_lookup_idx" ON "automations"("tenantId", "triggerDeviceId", "triggerCapabilityId", "enabled");

CREATE UNIQUE INDEX "automation_actions_automationId_actionId_key" ON "automation_actions"("automationId", "actionId");
CREATE UNIQUE INDEX "automation_actions_automationId_position_key" ON "automation_actions"("automationId", "position");
CREATE UNIQUE INDEX "automation_actions_automationId_deviceId_capabilityId_key" ON "automation_actions"("automationId", "deviceId", "capabilityId");
CREATE INDEX "automation_actions_tenantId_automationId_idx" ON "automation_actions"("tenantId", "automationId");
CREATE INDEX "automation_actions_tenantId_deviceId_capabilityId_idx" ON "automation_actions"("tenantId", "deviceId", "capabilityId");

-- AddForeignKey
ALTER TABLE "automations"
ADD CONSTRAINT "automations_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automations"
ADD CONSTRAINT "automations_ownerMembershipId_tenantId_fkey"
FOREIGN KEY ("ownerMembershipId", "tenantId")
REFERENCES "memberships"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automations"
ADD CONSTRAINT "automations_triggerDeviceId_tenantId_fkey"
FOREIGN KEY ("triggerDeviceId", "tenantId")
REFERENCES "devices"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automations"
ADD CONSTRAINT "automations_triggerCapabilityId_triggerDeviceId_fkey"
FOREIGN KEY ("triggerCapabilityId", "triggerDeviceId")
REFERENCES "capabilities"("id", "deviceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_actions"
ADD CONSTRAINT "automation_actions_automationId_tenantId_fkey"
FOREIGN KEY ("automationId", "tenantId")
REFERENCES "automations"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_actions"
ADD CONSTRAINT "automation_actions_deviceId_tenantId_fkey"
FOREIGN KEY ("deviceId", "tenantId")
REFERENCES "devices"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_actions"
ADD CONSTRAINT "automation_actions_capabilityId_deviceId_fkey"
FOREIGN KEY ("capabilityId", "deviceId")
REFERENCES "capabilities"("id", "deviceId")
ON DELETE RESTRICT ON UPDATE CASCADE;
