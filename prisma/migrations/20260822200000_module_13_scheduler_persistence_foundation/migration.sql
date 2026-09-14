-- Module 13 Slice 13.1 — Scheduler persistence foundation.
-- Tenant-bound schedules with timezone-aware cron/interval definitions and
-- durable, idempotent due-run records. No runtime loop/worker is activated.

CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "targetSceneId" TEXT,
    "countdownSeconds" INTEGER,
    "repeat" TEXT NOT NULL DEFAULT 'INDEFINITE',
    "maxRuns" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "missedRunPolicy" TEXT NOT NULL DEFAULT 'SKIP_TO_NEXT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "ScheduleKind" AS ENUM ('CRON', 'COUNTDOWN');
CREATE TYPE "ScheduleRepeat" AS ENUM ('INDEFINITE', 'LIMITED', 'ONCE');
CREATE TYPE "ScheduleMissedRunPolicy" AS ENUM ('SKIP_TO_NEXT', 'RUN_IMMEDIATELY');

ALTER TABLE "schedules" DROP COLUMN "kind";
ALTER TABLE "schedules" DROP COLUMN "repeat";
ALTER TABLE "schedules" DROP COLUMN "missedRunPolicy";
ALTER TABLE "schedules"
  ADD COLUMN "kind" "ScheduleKind" NOT NULL,
  ADD COLUMN "repeat" "ScheduleRepeat" NOT NULL DEFAULT 'INDEFINITE',
  ADD COLUMN "missedRunPolicy" "ScheduleMissedRunPolicy" NOT NULL DEFAULT 'SKIP_TO_NEXT';

CREATE UNIQUE INDEX "schedules_id_tenantId_key" ON "schedules"("id", "tenantId");
CREATE UNIQUE INDEX "schedules_tenantId_name_key" ON "schedules"("tenantId", "name");
CREATE INDEX "schedules_enabled_nextRunAt_idx" ON "schedules"("enabled", "nextRunAt");

CREATE INDEX "schedules_tenantId_idx" ON "schedules"("tenantId");

-- Durable due-run ledger: one row per (schedule, scheduled time). Idempotent.
CREATE TABLE "schedule_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "sceneExecutionId" TEXT,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_runs_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "ScheduleRunStatus" AS ENUM ('PENDING', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'SKIPPED_MISSED');

ALTER TABLE "schedule_runs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "schedule_runs" ALTER COLUMN "status" TYPE "ScheduleRunStatus" USING "status"::"ScheduleRunStatus";

CREATE UNIQUE INDEX "schedule_runs_scheduleId_scheduledFor_key" ON "schedule_runs"("scheduleId", "scheduledFor");
CREATE INDEX "schedule_runs_status_scheduledFor_idx" ON "schedule_runs"("status", "scheduledFor");
CREATE INDEX "schedule_runs_tenantId_idx" ON "schedule_runs"("tenantId");

ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_runs" ADD CONSTRAINT "schedule_runs_scheduleId_fkey" FOREIGN KEY ("scheduleId", "tenantId") REFERENCES "schedules"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
