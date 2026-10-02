-- Wave 11 maintenance risk forecasting.
--
-- Nullable with no default, for the same reason the health columns are: a device that has never been
-- forecast must report that, and `NOT_ESTABLISHED` is that answer. Defaulting to STABLE would rank the
-- least-observed devices as the safest ones.

-- `to_regtype` resolves against the current search path. A `pg_type` lookup by name sees the type in ANY
-- schema, which on a runner applying migrations into an isolated schema (`test_ci_<run id>`) can skip the
-- CREATE and then fail the ALTER below with 42704.
DO $$
BEGIN
  IF to_regtype('"DeviceRisk"') IS NULL THEN
    CREATE TYPE "DeviceRisk" AS ENUM ('NOT_ESTABLISHED', 'STABLE', 'WATCH', 'DECLINING', 'IMMINENT');
  END IF;
END
$$;

ALTER TABLE "devices"
  ADD COLUMN IF NOT EXISTS "riskBand" "DeviceRisk",
  ADD COLUMN IF NOT EXISTS "riskHorizonDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "riskEvaluatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "riskForecastVersion" TEXT;

-- Forecasts are listed per tenant, worst first. That ordering is the whole point of the feature, so it
-- gets an index rather than a sort on every operator page load.
CREATE INDEX IF NOT EXISTS "devices_tenantId_riskBand_idx"
  ON "devices" ("tenantId", "riskBand");