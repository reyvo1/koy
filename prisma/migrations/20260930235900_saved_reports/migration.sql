-- Saved reports (Wave 6).
--
-- Additive only: one enum, one table. No existing table is altered, so a tenant that never saves
-- a report behaves exactly as before.
--
-- `expiresAt` is written at insert time rather than derived on read. Deriving it would make the
-- retention policy a property of every reader, and the one reader that forgot it would serve a
-- report indefinitely -- which is the failure mode a stored expiry column makes impossible.
--
-- 28 days is the owner's decision. `MAX_REPORT_HOURS` in the report service is 31 days, so a
-- saved report can still outlive the widest window it could have been produced from; the two
-- bounds are deliberately not equal, and that is a fact about retention, not an oversight.

CREATE TYPE "SavedReportKind" AS ENUM ('TENANT_SUMMARY');

CREATE TABLE "saved_reports" (
    "id"                UUID NOT NULL,
    "tenantId"          UUID NOT NULL,
    "kind"              "SavedReportKind" NOT NULL,
    "rangeFrom"         TIMESTAMP(3) NOT NULL,
    "rangeTo"           TIMESTAMP(3) NOT NULL,
    "requestedHours"    INTEGER NOT NULL,
    "payload"           JSONB NOT NULL,
    "rowCount"          INTEGER NOT NULL DEFAULT 0,
    "actorMembershipId" UUID NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

-- The list is "this tenant's reports, newest first". The expiry index serves the purge path, not
-- the list: an expired report is filtered out by `expiresAt > now()` rather than by deletion, so
-- the fact that a report was generated outlives the report itself.
CREATE INDEX "saved_reports_tenantId_createdAt_idx" ON "saved_reports"("tenantId", "createdAt");
CREATE INDEX "saved_reports_expiresAt_idx" ON "saved_reports"("expiresAt");