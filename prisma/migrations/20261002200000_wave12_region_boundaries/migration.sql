-- Wave 12 region boundaries.
--
-- The `regions` table is seeded with the single region this platform actually runs in. A platform with one
-- region that seeds several would be reporting geography it does not have.
--
-- `devices.regionId` is nullable with no default. A device that has never been placed in a region reports
-- that, and a default of the seeded region would be a claim about every existing device on the platform.

CREATE TABLE IF NOT EXISTS "regions" (
  "id"          TEXT NOT NULL,
  "regionCode"  TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "timezone"    TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "regions_regionCode_key" ON "regions"("regionCode");

-- The one region this platform is deployed in. `ON CONFLICT DO NOTHING` so re-running the migration or
-- re-seeding does not fail or duplicate it.
INSERT INTO "regions" ("id", "regionCode", "displayName", "timezone", "isActive")
VALUES ('00000000-0000-4000-8000-000000000001', 'ap-southeast-1', 'Asia Southeast (Makassar)', 'Asia/Makassar', true)
ON CONFLICT ("regionCode") DO NOTHING;

ALTER TABLE "devices"
  ADD COLUMN IF NOT EXISTS "regionId" TEXT;

ALTER TABLE "devices"
  ADD CONSTRAINT "devices_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Assignment and reporting both list devices by region within a tenant, so that lookup gets an index
-- instead of a filter over the whole device table on every operator page load.
CREATE INDEX IF NOT EXISTS "devices_tenantId_regionId_idx"
  ON "devices" ("tenantId", "regionId");