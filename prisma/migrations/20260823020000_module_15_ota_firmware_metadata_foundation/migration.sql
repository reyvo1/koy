-- Module 15 Slice 15.1 — OTA firmware metadata foundation.
-- Firmware artifacts are referenced by URL + SHA-256 (no binary storage in DB).
-- Rollout state machine is forward-only and auditable.

CREATE TYPE "OtaRolloutStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'IN_PROGRESS', 'COMPLETED', 'ROLLED_BACK');

CREATE TABLE "firmware_artifacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "artifactUrl" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "compatibleModels" JSONB NOT NULL,
    "releaseNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmware_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "firmware_artifacts_id_tenantId_key" ON "firmware_artifacts"("id", "tenantId");
CREATE UNIQUE INDEX "firmware_artifacts_tenantId_version_key" ON "firmware_artifacts"("tenantId", "version");
CREATE INDEX "firmware_artifacts_tenantId_idx" ON "firmware_artifacts"("tenantId");

CREATE TABLE "ota_rollouts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firmwareId" TEXT NOT NULL,
    "status" "OtaRolloutStatus" NOT NULL DEFAULT 'DRAFT',
    "targetDeviceIds" JSONB NOT NULL,
    "completedDeviceIds" JSONB NOT NULL DEFAULT '[]',
    "failedDeviceIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ota_rollouts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ota_rollouts_tenantId_status_idx" ON "ota_rollouts"("tenantId", "status");


ALTER TABLE "firmware_artifacts" ADD CONSTRAINT "firmware_artifacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ota_rollouts" ADD CONSTRAINT "ota_rollouts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ota_rollouts" ADD CONSTRAINT "ota_rollouts_firmware_fkey" FOREIGN KEY ("firmwareId", "tenantId") REFERENCES "firmware_artifacts"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
