-- Wave 12 edge gateway: identity and attribution (ADR-010).
--
-- Two facts drove this migration:
--
-- `telemetry` recorded which device a reading came from but not WHO delivered it, so a device's own report
-- and a gateway forwarding on its behalf produced identical rows. `deliveredByGatewayId` closes that, and
-- it is nullable with no default: null means the device reported for itself, which is true for every row
-- already in this table, and backfilling it would invent a delivery path nobody observed.
--
-- `device_credentials` is unique per device, so there was no identity a gateway could hold. A gateway now
-- has its own credential, separately revocable, because revoking a gateway must not mean re-provisioning
-- every device behind it.

-- The enum is created FIRST, so the column can be declared with its real type. Creating the table with a
-- TEXT column and altering it afterwards does not work: Postgres refuses to cast a text default into an
-- enum with `42804 default for column cannot be cast automatically to type`.
--
-- The guard uses to_regtype so it resolves through the current search path. A pg_type lookup would see the
-- type in any schema and skip the CREATE TYPE on an isolated runner, which then fails at the column
-- declaration with 42704.
DO $$
BEGIN
  IF to_regtype('"EdgeGatewayStatus"') IS NULL THEN
    CREATE TYPE "EdgeGatewayStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'OFFLINE', 'DISABLED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "edge_gateways" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "gatewayCode"   TEXT NOT NULL,
  "displayName"   TEXT NOT NULL,
  -- UNKNOWN, not ONLINE: a gateway that has never reported has no evidence of being up.
  "gatewayStatus" "EdgeGatewayStatus" NOT NULL DEFAULT 'UNKNOWN',
  "regionId"      TEXT,
  "lastSeenAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "edge_gateways_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "edge_gateways_tenantId_gatewayCode_key"
  ON "edge_gateways" ("tenantId", "gatewayCode");

CREATE INDEX IF NOT EXISTS "edge_gateways_tenantId_gatewayStatus_idx"
  ON "edge_gateways" ("tenantId", "gatewayStatus");

CREATE TABLE IF NOT EXISTS "edge_gateway_credentials" (
  "id"           TEXT NOT NULL,
  "gatewayId"    TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "edge_gateway_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "edge_gateway_credentials_gatewayId_key"
  ON "edge_gateway_credentials" ("gatewayId");

-- The explicit set of devices a gateway may speak for. A list rather than "everything in the region",
-- because an allowlist that widens on its own when a device is commissioned is not an allowlist.
CREATE TABLE IF NOT EXISTS "edge_gateway_devices" (
  "id"         TEXT NOT NULL,
  "gatewayId"  TEXT NOT NULL,
  "deviceId"   TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "edge_gateway_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "edge_gateway_devices_gatewayId_deviceId_key"
  ON "edge_gateway_devices" ("gatewayId", "deviceId");

CREATE INDEX IF NOT EXISTS "edge_gateway_devices_deviceId_idx"
  ON "edge_gateway_devices" ("deviceId");

ALTER TABLE "telemetry"
  ADD COLUMN IF NOT EXISTS "deliveredByGatewayId" TEXT;

CREATE INDEX IF NOT EXISTS "telemetry_deliveredByGatewayId_idx"
  ON "telemetry" ("deliveredByGatewayId");

-- Foreign keys are added only after every table exists, so the order above cannot leave one dangling.
ALTER TABLE "edge_gateway_credentials"
  ADD CONSTRAINT "edge_gateway_credentials_gatewayId_fkey"
  FOREIGN KEY ("gatewayId") REFERENCES "edge_gateways"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edge_gateway_devices"
  ADD CONSTRAINT "edge_gateway_devices_gatewayId_fkey"
  FOREIGN KEY ("gatewayId") REFERENCES "edge_gateways"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edge_gateway_devices"
  ADD CONSTRAINT "edge_gateway_devices_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edge_gateways"
  ADD CONSTRAINT "edge_gateways_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "edge_gateways"
  ADD CONSTRAINT "edge_gateways_regionId_fkey"
  FOREIGN KEY ("regionId") REFERENCES "regions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ON DELETE SET NULL, not CASCADE: removing a gateway must not delete telemetry that devices produced.
-- The reading outlives the relay that carried it, and deleting evidence because a relay was decommissioned
-- would destroy exactly the history an investigation needs.
ALTER TABLE "telemetry"
  ADD CONSTRAINT "telemetry_deliveredByGatewayId_fkey"
  FOREIGN KEY ("deliveredByGatewayId") REFERENCES "edge_gateways"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;