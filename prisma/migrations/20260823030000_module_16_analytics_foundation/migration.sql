-- Module 16 Slice 16.1 — AI Analytics Foundation.
-- Provider-neutral anomaly findings and recommendations with confidence
-- bounds. No model training or external AI provider is wired.

CREATE TYPE "AnalyticsFindingKind" AS ENUM ('ANOMALY', 'RECOMMENDATION');
CREATE TYPE "AnalyticsSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

CREATE TABLE "analytics_findings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,
    "kind" "AnalyticsFindingKind" NOT NULL,
    "severity" "AnalyticsSeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "detectorVersion" TEXT NOT NULL,
    "evidenceTelemetryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "analytics_findings_tenantId_createdAt_idx" ON "analytics_findings"("tenantId", "createdAt");
CREATE INDEX "analytics_findings_tenantId_deviceId_idx" ON "analytics_findings"("tenantId", "deviceId");

ALTER TABLE "analytics_findings" ADD CONSTRAINT "analytics_findings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
