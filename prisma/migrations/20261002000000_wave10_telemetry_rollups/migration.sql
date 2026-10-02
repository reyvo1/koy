-- Wave 10: telemetry rollups, the summarised form of a window whose raw rows are about to be pruned.
--
-- CREATE TABLE rather than an ALTER: there is no pre-existing table, so there is nothing to add
-- nullable-first and backfill. The foreign keys are declared inline and are NOT VALID-free --
-- they are real constraints from the first insert.
--
-- `capabilityKey` is a top-level telemetry payload key rather than a capability id, because payloads
-- are free-form JSON. The unique constraint is what makes a second pass over the same window replace
-- its aggregates instead of adding to them.
CREATE TABLE IF NOT EXISTS "telemetry_rollups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "bucketStart" TIMESTAMP(3) NOT NULL,
    "bucketEnd" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "valueSum" DOUBLE PRECISION NOT NULL,
    "valueMin" DOUBLE PRECISION NOT NULL,
    "valueMax" DOUBLE PRECISION NOT NULL,
    "valueLast" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_rollups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_rollups_tenantId_deviceId_capabilityKey_bucketStart_key"
    ON "telemetry_rollups"("tenantId", "deviceId", "capabilityKey", "bucketStart");

CREATE INDEX IF NOT EXISTS "telemetry_rollups_tenantId_deviceId_bucketStart_idx"
    ON "telemetry_rollups"("tenantId", "deviceId", "bucketStart");

CREATE INDEX IF NOT EXISTS "telemetry_rollups_tenantId_bucketStart_idx"
    ON "telemetry_rollups"("tenantId", "bucketStart");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'telemetry_rollups_tenantId_fkey'
    ) THEN
        ALTER TABLE "telemetry_rollups"
            ADD CONSTRAINT "telemetry_rollups_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'telemetry_rollups_deviceId_fkey'
    ) THEN
        ALTER TABLE "telemetry_rollups"
            ADD CONSTRAINT "telemetry_rollups_deviceId_fkey"
            FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
