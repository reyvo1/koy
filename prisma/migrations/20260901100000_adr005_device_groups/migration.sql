-- ADR-005: additive device groups (grup perangkat) — ASCII-only migration

CREATE TABLE "device_groups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "device_groups_tenantId_name_key" ON "device_groups"("tenantId", "name");
CREATE INDEX "device_groups_tenantId_idx" ON "device_groups"("tenantId");

CREATE TABLE "device_group_members" (
    "groupId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "device_group_members_pkey" PRIMARY KEY ("groupId", "deviceId")
);

CREATE INDEX "device_group_members_deviceId_idx" ON "device_group_members"("deviceId");

ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "device_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE;