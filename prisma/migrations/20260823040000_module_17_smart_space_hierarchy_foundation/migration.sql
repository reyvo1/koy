-- Module 17 Slice 17.1 — Smart Space hierarchy persistence.
-- Site -> Building -> Floor -> Room hierarchy, tenant-bound, with device
-- placement (a device belongs to at most one room).

CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "SpaceKind" AS ENUM ('SITE', 'BUILDING', 'FLOOR', 'ROOM');

ALTER TABLE "spaces" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "spaces" ALTER COLUMN "kind" TYPE "SpaceKind" USING "kind"::text::"SpaceKind";

CREATE TABLE "space_device_placements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_device_placements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spaces_id_tenantId_key" ON "spaces"("id", "tenantId");
CREATE UNIQUE INDEX "spaces_tenantId_name_key" ON "spaces"("tenantId", "name");
CREATE INDEX "spaces_tenantId_kind_idx" ON "spaces"("tenantId", "kind");
CREATE INDEX "spaces_parentId_idx" ON "spaces"("parentId");

CREATE UNIQUE INDEX "space_device_placements_deviceId_key" ON "space_device_placements"("deviceId");
CREATE INDEX "space_device_placements_roomId_idx" ON "space_device_placements"("roomId", "tenantId");

ALTER TABLE "spaces" ADD CONSTRAINT "spaces_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_parent_fkey" FOREIGN KEY ("parentId", "tenantId") REFERENCES "spaces"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "space_device_placements" ADD CONSTRAINT "space_device_placements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "space_device_placements" ADD CONSTRAINT "space_device_placements_room_fkey" FOREIGN KEY ("roomId", "tenantId") REFERENCES "spaces"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "space_device_placements" ADD CONSTRAINT "space_device_placements_device_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "devices"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
