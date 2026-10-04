-- Production readiness: make tenant isolation of custom-role assignments a database invariant.
--
-- The application writer already scopes both role and membership by tenant, but the original
-- role foreign key referenced only custom_roles(id). That meant a future buggy writer or manual
-- SQL could persist membership_role_overrides.tenantId=A with roleId from tenant B. The
-- membership FK was tenant-composite; the role FK must be equally strict.
--
-- Fail closed on pre-existing corruption. Do not rewrite or delete operator authorization rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "membership_role_overrides" AS mro
    JOIN "custom_roles" AS role ON role."id" = mro."roleId"
    WHERE mro."tenantId" <> role."tenantId"
  ) THEN
    RAISE EXCEPTION 'cross-tenant membership_role_overrides rows exist; repair explicitly before applying tenant-role integrity migration';
  END IF;
END $$;

CREATE UNIQUE INDEX "custom_roles_id_tenantId_key"
  ON "custom_roles"("id", "tenantId");

ALTER TABLE "membership_role_overrides"
  DROP CONSTRAINT "mro_role_fkey";

ALTER TABLE "membership_role_overrides"
  ADD CONSTRAINT "mro_role_tenant_fkey"
  FOREIGN KEY ("roleId", "tenantId")
  REFERENCES "custom_roles"("id", "tenantId")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
