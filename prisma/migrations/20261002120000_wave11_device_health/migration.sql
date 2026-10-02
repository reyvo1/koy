-- Wave 11 device health scoring.
--
-- Every column is nullable and has no default. Existing rows therefore stay valid and are reported as
-- "never evaluated" rather than being silently scored as healthy: a device that has not been through an
-- evaluation must not appear in the healthiest band just because nobody has looked at it yet.
--
-- The enum type is created before the ALTER so the column can use it in the same transaction.

-- `to_regtype` resolves against the current search_path. A `pg_type` lookup by name would see the type
-- in ANY schema, so on a runner that applies migrations into an isolated schema (`test_ci_<run id>`) the
-- check could find a DeviceHealth left by another schema, skip the creation, and then fail the ALTER
-- below with "type DeviceHealth does not exist". This is the same failure as 42704.
DO $$
BEGIN
  IF to_regtype('"DeviceHealth"') IS NULL THEN
    CREATE TYPE "DeviceHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'OFFLINE');
  END IF;
END
$$;

ALTER TABLE "devices"
  ADD COLUMN IF NOT EXISTS "healthScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "healthStatus" "DeviceHealth",
  ADD COLUMN IF NOT EXISTS "healthEvaluatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "healthScorerVersion" TEXT;

-- Evaluations are read per tenant and per device, newest first. Without this the scoring loop does a
-- sequential scan of the whole telemetry-linked device table on every pass.
CREATE INDEX IF NOT EXISTS "devices_tenantId_healthStatus_idx"
  ON "devices" ("tenantId", "healthStatus");