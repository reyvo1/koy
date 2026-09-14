-- Module 12 Slice 12.1 — Scene domain persistence foundation.
-- Tenant-bound scene definitions, ordered primitive device actions, and
-- idempotent execution reservations. No execution runtime is activated.

CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scene_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "scene_actions_pkey" PRIMARY KEY ("id")
);

CREATE TYPE "SceneExecutionStatus" AS ENUM ('RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIALLY_FAILED');
CREATE TYPE "SceneTriggerSource" AS ENUM ('USER_REQUEST');

CREATE TABLE "scene_executions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneRevision" INTEGER NOT NULL,
    "requestId" TEXT NOT NULL,
    "triggerSource" "SceneTriggerSource" NOT NULL,
    "status" "SceneExecutionStatus" NOT NULL DEFAULT 'RESERVED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scenes_id_tenantId_key" ON "scenes"("id", "tenantId");
CREATE UNIQUE INDEX "scenes_tenantId_name_key" ON "scenes"("tenantId", "name");
CREATE INDEX "scenes_tenantId_enabled_idx" ON "scenes"("tenantId", "enabled");

CREATE UNIQUE INDEX "scene_actions_sceneId_actionId_key" ON "scene_actions"("sceneId", "actionId");
CREATE UNIQUE INDEX "scene_actions_sceneId_position_key" ON "scene_actions"("sceneId", "position");
CREATE INDEX "scene_actions_tenantId_sceneId_idx" ON "scene_actions"("tenantId", "sceneId");

CREATE UNIQUE INDEX "scene_executions_tenantId_sceneId_requestId_key" ON "scene_executions"("tenantId", "sceneId", "requestId");
CREATE INDEX "scene_executions_tenantId_sceneId_createdAt_idx" ON "scene_executions"("tenantId", "sceneId", "createdAt");

ALTER TABLE "scenes" ADD CONSTRAINT "scenes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_actions" ADD CONSTRAINT "scene_actions_sceneId_tenantId_fkey" FOREIGN KEY ("sceneId", "tenantId") REFERENCES "scenes"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scene_actions" ADD CONSTRAINT "scene_actions_deviceId_tenantId_fkey" FOREIGN KEY ("deviceId", "tenantId") REFERENCES "devices"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scene_actions" ADD CONSTRAINT "scene_actions_capabilityId_deviceId_fkey" FOREIGN KEY ("capabilityId", "deviceId") REFERENCES "capabilities"("id", "deviceId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "scene_executions" ADD CONSTRAINT "scene_executions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scene_executions" ADD CONSTRAINT "scene_executions_sceneId_tenantId_fkey" FOREIGN KEY ("sceneId", "tenantId") REFERENCES "scenes"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
