-- Add bounded internal cooldown configuration.
ALTER TABLE "automations"
ADD COLUMN "cooldownSeconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "automations"
ADD CONSTRAINT "automations_cooldownSeconds_check"
CHECK ("cooldownSeconds" >= 0 AND "cooldownSeconds" <= 86400);

-- Persist database-authoritative cooldown evaluation evidence.
ALTER TABLE "automation_executions"
ADD COLUMN "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cooldownEvaluatedAt" TIMESTAMP(3),
ADD COLUMN "cooldownReferenceExecutionId" TEXT;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_cooldownSeconds_check"
CHECK ("cooldownSeconds" >= 0 AND "cooldownSeconds" <= 86400);

CREATE INDEX "automation_executions_cooldown_lookup_idx"
ON "automation_executions"(
    "tenantId",
    "automationId",
    "status",
    "createdAt",
    "id"
);

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_cooldown_reference_key"
UNIQUE ("id", "tenantId", "automationId");

CREATE INDEX "automation_executions_tenantId_cooldownReferenceExecutionId_idx"
ON "automation_executions"("tenantId", "cooldownReferenceExecutionId");

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_cooldownReferenceExecutionId_tenantId_automationId_fkey"
FOREIGN KEY ("cooldownReferenceExecutionId", "tenantId", "automationId")
REFERENCES "automation_executions"("id", "tenantId", "automationId")
ON DELETE RESTRICT ON UPDATE CASCADE;
