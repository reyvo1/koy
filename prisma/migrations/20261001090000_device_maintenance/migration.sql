-- Technician maintenance: a window that outlives the heartbeat.
--
-- The reason this is a table rather than a `DeviceStatus` value is not here but in
-- `device_service.updateHeartbeat`, which writes `status = 'ACTIVE'` on every heartbeat. Any
-- maintenance state stored in that column would be overwritten by the device's own next ping, so a
-- window would close itself seconds after it opened. This table holds the window independently and
-- `Device.status` keeps meaning exactly what it meant.
--
-- Column types match the rest of the schema deliberately: ids are `text` and timestamps are
-- `timestamp(3) without time zone`. The first draft of this migration guessed `uuid`, and Postgres
-- refused the foreign key outright -- a reminder that the type is not a detail when two tables meet.
--
-- `id` + `tenantId` is unique so a row is addressed the way every other tenant-scoped table here is.
-- It does NOT enforce "one open window per device": that rule belongs to the service's conditional
-- write, because a unique index would turn a second window into a database error the operator
-- cannot explain, instead of a conflict the API can describe.

CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "device_maintenance" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "deviceId"         TEXT NOT NULL,
    "status"           "MaintenanceStatus" NOT NULL DEFAULT 'OPEN',
    "reason"           TEXT NOT NULL,
    "openedByUserId"   TEXT NOT NULL,
    "openedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedByUserId" TEXT,
    "resolvedAt"       TIMESTAMP(3),
    "resolutionNote"   TEXT,

    CONSTRAINT "device_maintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_maintenance_id_tenantId_key" ON "device_maintenance"("id", "tenantId");

-- The technician console's default view: this tenant's windows, filtered by state.
CREATE INDEX "device_maintenance_tenantId_status_idx" ON "device_maintenance"("tenantId", "status");

-- "What is happening to this device" -- the question asked standing next to it, and the one the
-- open path checks before inserting.
CREATE INDEX "device_maintenance_deviceId_status_idx" ON "device_maintenance"("deviceId", "status");

ALTER TABLE "device_maintenance"
    ADD CONSTRAINT "device_maintenance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_maintenance"
    ADD CONSTRAINT "device_maintenance_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_maintenance"
    ADD CONSTRAINT "device_maintenance_openedByUserId_fkey"
    FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_maintenance"
    ADD CONSTRAINT "device_maintenance_resolvedByUserId_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;