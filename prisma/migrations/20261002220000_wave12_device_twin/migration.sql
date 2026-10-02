-- Wave 12 digital twin: reconciliation snapshots (ADR-011).
--
-- A twin here is not a simulation of the asset. It is a dated record of what the platform believed, what the
-- device last actually reported, and whether those two agree.
--
-- `observedAt` is the load-bearing column: it is when the DEVICE reported, not when the row was written. A
-- twin without it cannot tell a fresh reading from a week-old one, and a week-old reading presented as
-- current is the exact failure this table exists to make visible.
--
-- `observedPayload` and `observedStatus` are nullable. A device that has never reported leaves them null and
-- the verdict is UNKNOWN. There is deliberately no default reading to fall back on.

DO $$
BEGIN
  IF to_regtype('"DeviceTwinVerdict"') IS NULL THEN
    CREATE TYPE "DeviceTwinVerdict" AS ENUM ('ALIGNED', 'DIVERGENT', 'STALE', 'UNKNOWN');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "device_twin_snapshots" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "deviceId"         TEXT NOT NULL,
  -- Monotonic per device. A replayed snapshot gets the same version rather than forking history.
  "twinVersion"      INTEGER NOT NULL,
  "desiredStatus"    TEXT,
  "observedStatus"   TEXT,
  "observedPayload"  JSONB,
  "observedAt"       TIMESTAMP(3),
  "verdict"          "DeviceTwinVerdict" NOT NULL,
  "divergenceReason" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "device_twin_snapshots_pkey" PRIMARY KEY ("id")
);

-- One snapshot per version per device: a retried write cannot produce a second, different row claiming the
-- same version.
CREATE UNIQUE INDEX IF NOT EXISTS "device_twin_snapshots_deviceId_twinVersion_key"
  ON "device_twin_snapshots" ("deviceId", "twinVersion");

-- Reading a device's current twin is the hot path, and an operator page always filters by tenant first.
CREATE INDEX IF NOT EXISTS "device_twin_snapshots_tenantId_deviceId_createdAt_idx"
  ON "device_twin_snapshots" ("tenantId", "deviceId", "createdAt");

CREATE INDEX IF NOT EXISTS "device_twin_snapshots_tenantId_verdict_idx"
  ON "device_twin_snapshots" ("tenantId", "verdict");

ALTER TABLE "device_twin_snapshots"
  ADD CONSTRAINT "device_twin_snapshots_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE CASCADE, unlike telemetry: a snapshot is a derived reconciliation record, so it goes when the
-- device it describes is gone. Keeping it would leave an orphan claiming a verdict about a device that no
-- longer exists.
ALTER TABLE "device_twin_snapshots"
  ADD CONSTRAINT "device_twin_snapshots_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;