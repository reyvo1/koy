-- Module 11 Slice 11.10 — Automation Retry Safety Foundation.
-- Adds PostgreSQL-authoritative persisted attempt state and next-eligible time
-- for failed automation action dispatch retries. No runtime wiring is activated.

ALTER TABLE "automation_execution_actions"
ADD COLUMN "dispatchAttemptCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "retryNextEligibleAt" TIMESTAMP(3);

-- Existing rows represent exactly one prior dispatch attempt with no retry scheduled.
UPDATE "automation_execution_actions"
SET "dispatchAttemptCount" = 1,
    "retryNextEligibleAt" = NULL
WHERE "dispatchAttemptCount" IS NULL OR "dispatchAttemptCount" < 1;

ALTER TABLE "automation_execution_actions"
ADD CONSTRAINT "automation_execution_actions_retry_shape_check"
CHECK (
  "dispatchAttemptCount" >= 1
  AND "dispatchAttemptCount" <= 3
);
