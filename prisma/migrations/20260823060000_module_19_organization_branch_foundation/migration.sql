-- Module 19 Slice 19.1: Organization and Branch foundation.
-- Enterprise org/branch hierarchy layered on top of the existing Tenant model:
-- a Branch maps one to one onto a tenant; organizations group tenants. No smart-space duplication.
-- a Branch maps 1:1 onto a tenant; organizations group tenants. No smart-space
-- duplication.

CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerMembershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_branches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_branches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizations_ownerMembershipId_key" ON "organizations"("ownerMembershipId");
CREATE UNIQUE INDEX "organization_branches_tenantId_key" ON "organization_branches"("tenantId");
CREATE INDEX "organization_branches_organizationId_idx" ON "organization_branches"("organizationId");

ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_fkey" FOREIGN KEY ("ownerMembershipId") REFERENCES "memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_branches" ADD CONSTRAINT "organization_branches_org_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_branches" ADD CONSTRAINT "organization_branches_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
