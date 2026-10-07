DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM device_locations l LEFT JOIN devices d ON d.id = l."deviceId" AND d."tenantId" = l."tenantId" WHERE d.id IS NULL) THEN
    RAISE EXCEPTION 'Orphan or cross-tenant device location exists; explicit operator repair required';
  END IF;
END $$;
-- Expand-only: retain the single-device FK while adding stronger tenant provenance.
ALTER TABLE device_locations ADD CONSTRAINT "device_locations_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES devices(id, "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE maintenance_plans (
 id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "deviceId" TEXT NOT NULL, "actorMembershipId" TEXT,
 reason TEXT NOT NULL, "intervalHours" INTEGER NOT NULL CHECK ("intervalHours" BETWEEN 1 AND 8760), "nextDueAt" TIMESTAMP(3) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "maintenance_plans_id_tenantId_key" UNIQUE (id, "tenantId"),
 CONSTRAINT "maintenance_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "maintenance_plans_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES devices(id, "tenantId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "maintenance_plans_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES memberships(id) ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "maintenance_plans_enabled_nextDueAt_idx" ON maintenance_plans(enabled, "nextDueAt");
ALTER TABLE device_maintenance ADD COLUMN "planId" TEXT, ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE device_maintenance ADD CONSTRAINT "device_maintenance_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES maintenance_plans(id, "tenantId") ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE UNIQUE INDEX "device_maintenance_planId_scheduledFor_key" ON device_maintenance("planId", "scheduledFor");

ALTER TABLE devices ADD COLUMN "reportedFirmwareVersion" TEXT, ADD COLUMN "reportedProtocol" TEXT, ADD COLUMN "runtimeReportedAt" TIMESTAMP(3);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM device_maintenance WHERE status = 'OPEN' GROUP BY "deviceId", "tenantId" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate OPEN maintenance windows exist; explicit operator repair required';
  END IF;
  IF EXISTS (SELECT 1 FROM device_maintenance m LEFT JOIN devices d ON d.id = m."deviceId" AND d."tenantId" = m."tenantId" WHERE d.id IS NULL) THEN
    RAISE EXCEPTION 'Orphan or cross-tenant maintenance exists; explicit operator repair required';
  END IF;
END $$;
CREATE UNIQUE INDEX "device_maintenance_one_open_per_device" ON device_maintenance("deviceId", "tenantId") WHERE status = 'OPEN';
-- Retain the existing single-device FK; additive composite FK tightens provenance.
ALTER TABLE device_maintenance ADD CONSTRAINT "device_maintenance_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES devices(id, "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
