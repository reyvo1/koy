-- Module 18 Slice 18.1 — Device Sharing & Guest Access foundation.
-- Owner-granted, expiring, revocable device-scoped access grants with audit.

CREATE TYPE "ShareGrantPermission" AS ENUM ('VIEW', 'CONTROL');
CREATE TYPE "ShareGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "device_share_grants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "grantedToMembershipId" TEXT NOT NULL,
    "permission" "ShareGrantPermission" NOT NULL,
    "status" "ShareGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_share_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "share_audit_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_audit_log_pkey" PRIMARY KEY ("id")
);

-- One active grant per (device, grantee): re-sharing replaces by revoke+create.
CREATE UNIQUE INDEX "device_share_grants_device_grantee_active_idx"
  ON "device_share_grants"("deviceId", "grantedToMembershipId")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "device_share_grants_tenantId_status_idx" ON "device_share_grants"("tenantId", "status");
CREATE INDEX "device_share_grants_grantee_idx" ON "device_share_grants"("grantedToMembershipId");
CREATE INDEX "share_audit_log_grantId_createdAt_idx" ON "share_audit_log"("grantId", "createdAt");

ALTER TABLE "device_share_grants" ADD CONSTRAINT "device_share_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_share_grants" ADD CONSTRAINT "device_share_grants_device_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "devices"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_share_grants" ADD CONSTRAINT "device_share_grants_grantee_fkey" FOREIGN KEY ("grantedToMembershipId", "tenantId") REFERENCES "memberships"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "share_audit_log" ADD CONSTRAINT "share_audit_log_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
