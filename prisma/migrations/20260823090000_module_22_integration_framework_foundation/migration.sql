-- Module 22 Slice 22.1 — External integration framework foundation.
-- Provider-neutral integration registrations with credential references
-- (never raw credentials) and a sync-state ledger.

CREATE TYPE "IntegrationProvider" AS ENUM ('ALEXA', 'GOOGLE_HOME', 'HOME_ASSISTANT', 'MQTT_BRIDGE');
CREATE TYPE "IntegrationStatus" AS ENUM ('REGISTERED', 'CONNECTED', 'ERROR', 'DISABLED');

CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "displayName" TEXT NOT NULL,
    "credentialRef" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integrations_tenantId_provider_key" ON "integrations"("tenantId", "provider");
CREATE INDEX "integrations_tenantId_status_idx" ON "integrations"("tenantId", "status");

-- Per-integration sync state so reconnects resume without duplication.
CREATE TABLE "integration_sync_state" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "internalEntityId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_sync_state_unique_key"
  ON "integration_sync_state"("integrationId", "entityType", "externalEntityId");
