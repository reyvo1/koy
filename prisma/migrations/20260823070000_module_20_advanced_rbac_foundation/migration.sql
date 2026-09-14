-- Module 20 Slice 20.1 — Advanced RBAC foundation.
-- Custom tenant-scoped roles with granular permissions, plus a global audit
-- log. Existing MEMBER/ADMIN membership roles remain the base layer.

CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE');

CREATE TABLE "custom_roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_role_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_role_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rbac_audit_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "actorMembershipId" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rbac_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_roles_tenantId_name_key" ON "custom_roles"("tenantId", "name");
CREATE UNIQUE INDEX "membership_role_overrides_membership_role_key" ON "membership_role_overrides"("membershipId", "roleId");
CREATE INDEX "membership_role_overrides_membership_idx" ON "membership_role_overrides"("membershipId", "tenantId");
CREATE INDEX "rbac_audit_log_tenantId_createdAt_idx" ON "rbac_audit_log"("tenantId", "createdAt");

ALTER TABLE "custom_roles" ADD CONSTRAINT "custom_roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_role_overrides" ADD CONSTRAINT "mro_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_role_overrides" ADD CONSTRAINT "mro_membership_fkey" FOREIGN KEY ("membershipId", "tenantId") REFERENCES "memberships"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_role_overrides" ADD CONSTRAINT "mro_role_fkey" FOREIGN KEY ("roleId") REFERENCES "custom_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
