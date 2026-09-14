-- CreateTable
CREATE TABLE "telemetry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "telemetry_tenantId_idx" ON "telemetry"("tenantId");
CREATE INDEX "telemetry_deviceId_idx" ON "telemetry"("deviceId");
CREATE INDEX "telemetry_createdAt_idx" ON "telemetry"("createdAt");

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
