-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM (
    'RESERVED',
    'DISPATCHING',
    'SUCCEEDED',
    'FAILED',
    'PARTIALLY_FAILED',
    'SUPPRESSED_COOLDOWN',
    'SUPPRESSED_LOOP'
);

-- CreateEnum
CREATE TYPE "AutomationExecutionActionStatus" AS ENUM (
    'PENDING',
    'DISPATCHING',
    'SUCCEEDED',
    'FAILED',
    'SKIPPED'
);

-- Support tenant-bound foreign keys for immutable runtime evidence.
CREATE UNIQUE INDEX "device_commands_id_tenantId_key"
ON "device_commands"("id", "tenantId");

CREATE UNIQUE INDEX "telemetry_id_tenantId_key"
ON "telemetry"("id", "tenantId");

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationRevision" INTEGER NOT NULL,
    "triggerTelemetryId" TEXT NOT NULL,
    "triggerEventId" TEXT NOT NULL,
    "triggerDeviceId" TEXT NOT NULL,
    "triggerCapabilityId" TEXT NOT NULL,
    "triggerCapabilityKey" TEXT NOT NULL,
    "triggerValue" JSONB NOT NULL,
    "triggerOccurredAt" TIMESTAMP(3) NOT NULL,
    "ancestry" JSONB NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'RESERVED',
    "decisionReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AutomationActionKind" NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "AutomationExecutionActionStatus" NOT NULL DEFAULT 'PENDING',
    "commandId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_id_tenantId_key"
ON "automation_executions"("id", "tenantId");

CREATE UNIQUE INDEX "automation_executions_canonical_identity_key"
ON "automation_executions"(
    "tenantId",
    "automationId",
    "automationRevision",
    "triggerTelemetryId"
);

CREATE INDEX "automation_executions_tenantId_automationId_createdAt_id_idx"
ON "automation_executions"("tenantId", "automationId", "createdAt", "id");

CREATE INDEX "automation_executions_tenantId_status_createdAt_id_idx"
ON "automation_executions"("tenantId", "status", "createdAt", "id");

CREATE INDEX "automation_executions_tenantId_triggerTelemetryId_idx"
ON "automation_executions"("tenantId", "triggerTelemetryId");

CREATE INDEX "automation_executions_tenantId_triggerEventId_idx"
ON "automation_executions"("tenantId", "triggerEventId");

CREATE UNIQUE INDEX "automation_execution_actions_executionId_actionId_key"
ON "automation_execution_actions"("executionId", "actionId");

CREATE UNIQUE INDEX "automation_execution_actions_executionId_position_key"
ON "automation_execution_actions"("executionId", "position");

CREATE INDEX "automation_execution_actions_tenantId_executionId_status_idx"
ON "automation_execution_actions"("tenantId", "executionId", "status");

CREATE INDEX "automation_execution_actions_tenantId_deviceId_capabilityId_idx"
ON "automation_execution_actions"("tenantId", "deviceId", "capabilityId");

CREATE INDEX "automation_execution_actions_tenantId_commandId_idx"
ON "automation_execution_actions"("tenantId", "commandId");

-- AddForeignKey
ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_tenantId_fkey"
FOREIGN KEY ("tenantId")
REFERENCES "tenants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_automationId_tenantId_fkey"
FOREIGN KEY ("automationId", "tenantId")
REFERENCES "automations"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_triggerTelemetryId_tenantId_fkey"
FOREIGN KEY ("triggerTelemetryId", "tenantId")
REFERENCES "telemetry"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_triggerDeviceId_tenantId_fkey"
FOREIGN KEY ("triggerDeviceId", "tenantId")
REFERENCES "devices"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_triggerCapabilityId_triggerDeviceId_fkey"
FOREIGN KEY ("triggerCapabilityId", "triggerDeviceId")
REFERENCES "capabilities"("id", "deviceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_executionId_tenantId_fkey"
FOREIGN KEY ("executionId", "tenantId")
REFERENCES "automation_executions"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_deviceId_tenantId_fkey"
FOREIGN KEY ("deviceId", "tenantId")
REFERENCES "devices"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_capabilityId_deviceId_fkey"
FOREIGN KEY ("capabilityId", "deviceId")
REFERENCES "capabilities"("id", "deviceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_commandId_tenantId_fkey"
FOREIGN KEY ("commandId", "tenantId")
REFERENCES "device_commands"("id", "tenantId")
ON DELETE RESTRICT ON UPDATE CASCADE;
