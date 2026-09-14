-- CreateTable
CREATE TABLE "device_commands" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_commands_correlationId_key" ON "device_commands"("correlationId");
CREATE INDEX "device_commands_tenantId_idx" ON "device_commands"("tenantId");
CREATE INDEX "device_commands_deviceId_idx" ON "device_commands"("deviceId");
CREATE INDEX "device_commands_status_idx" ON "device_commands"("status");

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
