-- Add PostgreSQL-authored transition timestamps for execution and action audit history.
ALTER TABLE "automation_executions"
ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "automation_execution_actions"
ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill any pre-existing state rows before enforcing transition-shape constraints.
UPDATE "automation_executions"
SET "dispatchStartedAt" = "createdAt"
WHERE "status" IN ('DISPATCHING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_FAILED')
  AND "dispatchStartedAt" IS NULL;

UPDATE "automation_executions"
SET "completedAt" = "createdAt"
WHERE "status" IN ('SUCCEEDED', 'FAILED', 'PARTIALLY_FAILED', 'SUPPRESSED_COOLDOWN', 'SUPPRESSED_LOOP')
  AND "completedAt" IS NULL;

UPDATE "automation_execution_actions"
SET "dispatchStartedAt" = "createdAt"
WHERE "status" IN ('DISPATCHING', 'SUCCEEDED', 'FAILED')
  AND "dispatchStartedAt" IS NULL;

UPDATE "automation_execution_actions"
SET "completedAt" = "createdAt",
    "errorCode" = COALESCE("errorCode", 'LEGACY_TERMINAL_ACTION')
WHERE "status" IN ('FAILED', 'SKIPPED')
  AND "completedAt" IS NULL;

UPDATE "automation_execution_actions"
SET "completedAt" = "createdAt"
WHERE "status" = 'SUCCEEDED'
  AND "completedAt" IS NULL;

ALTER TABLE "automation_executions"
ADD CONSTRAINT "automation_executions_transition_shape_check"
CHECK (
  ("status" = 'RESERVED' AND "dispatchStartedAt" IS NULL AND "completedAt" IS NULL)
  OR ("status" = 'DISPATCHING' AND "dispatchStartedAt" IS NOT NULL AND "dispatchStartedAt" >= "createdAt" AND "completedAt" IS NULL)
  OR ("status" IN ('SUCCEEDED', 'FAILED', 'PARTIALLY_FAILED') AND "dispatchStartedAt" IS NOT NULL AND "dispatchStartedAt" >= "createdAt" AND "completedAt" IS NOT NULL AND "completedAt" >= "dispatchStartedAt")
  OR ("status" IN ('SUPPRESSED_COOLDOWN', 'SUPPRESSED_LOOP') AND "dispatchStartedAt" IS NULL AND "completedAt" IS NOT NULL AND "completedAt" >= "createdAt")
);

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_transition_shape_check"
CHECK (
  ("status" = 'PENDING' AND "dispatchStartedAt" IS NULL AND "completedAt" IS NULL AND "commandId" IS NULL AND "errorCode" IS NULL)
  OR ("status" = 'DISPATCHING' AND "dispatchStartedAt" IS NOT NULL AND "dispatchStartedAt" >= "createdAt" AND "completedAt" IS NULL AND "commandId" IS NULL AND "errorCode" IS NULL)
  OR ("status" = 'SUCCEEDED' AND "dispatchStartedAt" IS NOT NULL AND "dispatchStartedAt" >= "createdAt" AND "completedAt" IS NOT NULL AND "completedAt" >= "dispatchStartedAt" AND "commandId" IS NOT NULL AND "errorCode" IS NULL)
  OR ("status" = 'FAILED' AND "dispatchStartedAt" IS NOT NULL AND "dispatchStartedAt" >= "createdAt" AND "completedAt" IS NOT NULL AND "completedAt" >= "dispatchStartedAt" AND "errorCode" IS NOT NULL)
  OR ("status" = 'SKIPPED' AND "dispatchStartedAt" IS NULL AND "completedAt" IS NOT NULL AND "completedAt" >= "createdAt" AND "commandId" IS NULL AND "errorCode" IS NOT NULL)
);

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_errorCode_check"
CHECK ("errorCode" IS NULL OR "errorCode" ~ '^[A-Z][A-Z0-9_]{0,127}$');
