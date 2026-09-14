-- CreateTable
CREATE TABLE "capabilities" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "semanticType" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "unit" TEXT,
    "constraints" JSONB,
    "isReadable" BOOLEAN NOT NULL DEFAULT true,
    "isWritable" BOOLEAN NOT NULL DEFAULT false,
    "isReportable" BOOLEAN NOT NULL DEFAULT true,
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_deviceId_key_key" ON "capabilities"("deviceId", "key");

-- CreateIndex
CREATE INDEX "capabilities_deviceId_idx" ON "capabilities"("deviceId");

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
