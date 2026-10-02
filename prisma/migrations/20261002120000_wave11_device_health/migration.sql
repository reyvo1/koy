-- Wave 11 device health scoring.
--
-- Every column is nullable and has no default. Existing rows therefore stay valid and are reported as
-- "never evaluated" rather than being silently scored as healthy: a device that has not been through an
-- evaluation must not appear in the healthiest band just because nobody has looked at it yet.
--
-- The enum type is created before the ALTER so the column can use it in the same transaction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeviceHealth') THEN
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