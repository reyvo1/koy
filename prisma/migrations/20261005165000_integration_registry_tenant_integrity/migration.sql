-- Product Surface Closure: make Integration Registry tenant provenance a database invariant.
--
-- The original Module 22 migration created `integrations` and `integration_sync_state`
-- without the foreign keys represented by schema.prisma and omitted the database default
-- for IntegrationSyncState.syncedAt. Application code now verifies tenant ownership before
-- sync writes, but a future buggy writer or manual SQL could still
-- create an integration for a missing tenant or a cross-tenant sync-state row.
--
-- Fail closed on legacy corruption. Do not rewrite or delete operator integration data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "integrations" AS i
    LEFT JOIN "tenants" AS t ON t."id" = i."tenantId"
    WHERE t."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'orphan integrations rows exist; repair explicitly before applying integration tenant integrity migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "integration_sync_state" AS iss
    LEFT JOIN "integrations" AS i ON i."id" = iss."integrationId"
    WHERE i."id" IS NULL OR iss."tenantId" <> i."tenantId"
  ) THEN
    RAISE EXCEPTION 'orphan or cross-tenant integration_sync_state rows exist; repair explicitly before applying integration tenant integrity migration';
  END IF;
END $$;

ALTER TABLE "integration_sync_state"
  ALTER COLUMN "syncedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "integrations_id_tenantId_key"
  ON "integrations"("id", "tenantId");

ALTER TABLE "integrations"
  ADD CONSTRAINT "integrations_tenantId_fkey"
  FOREIGN KEY ("tenantId")
  REFERENCES "tenants"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "integration_sync_state"
  ADD CONSTRAINT "integration_sync_state_integration_tenant_fkey"
  FOREIGN KEY ("integrationId", "tenantId")
  REFERENCES "integrations"("id", "tenantId")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
