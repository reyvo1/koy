-- CreateIndex
CREATE INDEX "telemetry_tenantId_deviceId_createdAt_id_idx"
ON "telemetry"("tenantId", "deviceId", "createdAt", "id");
