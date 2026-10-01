-- Capability template lifecycle (Wave 6).
--
-- Additive only: new enum, two new tables, no column added or altered anywhere else. Existing
-- `capabilities` rows keep whatever `schemaVersion` they already had, so a tenant that never
-- adopts templates sees exactly the same drift report as before.
--
-- `status` is created without a default being dropped afterwards, unlike the other enums in
-- this schema. `CapabilityTemplateStatus` is only ever written through the lifecycle service,
-- which always sets it explicitly, and leaving DEFAULT on would let an INSERT that forgot the
-- column silently publish as DRAFT -- the one status that must never be a fallback.

CREATE TYPE "CapabilityTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

CREATE TABLE "capability_templates" (
    "id"            UUID NOT NULL,
    "tenantId"      UUID NOT NULL,
    "key"           TEXT NOT NULL,
    "semanticType"  TEXT NOT NULL,
    "dataType"      TEXT NOT NULL,
    "unit"          TEXT,
    "description"   TEXT,
    "archivedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capability_templates_pkey" PRIMARY KEY ("id")
);

-- One description per key per tenant. Without this, a fleet can hold two templates for the
-- same key and "what does this key mean" has two answers.
CREATE UNIQUE INDEX "capability_templates_tenantId_key_key" ON "capability_templates"("tenantId", "key");
CREATE INDEX "capability_templates_tenantId_idx" ON "capability_templates"("tenantId");

CREATE TABLE "capability_template_versions" (
    "id"                   UUID NOT NULL,
    "templateId"           UUID NOT NULL,
    "version"              TEXT NOT NULL,
    "status"               "CapabilityTemplateStatus" NOT NULL,
    "constraints"          JSONB,
    "isReadable"           BOOLEAN NOT NULL DEFAULT true,
    "isWritable"           BOOLEAN NOT NULL DEFAULT false,
    "isReportable"         BOOLEAN NOT NULL DEFAULT true,
    "publishedAt"          TIMESTAMP(3),
    "deprecatedAt"         TIMESTAMP(3),
    "previousSemanticType" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capability_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capability_template_versions_templateId_version_key"
    ON "capability_template_versions"("templateId", "version");

-- The exclusivity the product actually needs: at most one PUBLISHED version per template, so
-- "the version this fleet is standardising on" is always answerable.
--
-- Deliberately a partial index rather than `UNIQUE (templateId, status)`. A full composite
-- unique would also allow only one DRAFT and one DEPRECATED row per template for the lifetime
-- of the table, so the second deprecation -- an ordinary event in a template's life -- would
-- fail with a constraint error that names neither drafts nor history. Drafts are concurrent
-- work in progress and deprecated versions are the record of what the fleet used to run on;
-- neither should be capped.
CREATE UNIQUE INDEX "capability_template_versions_one_published_per_template"
    ON "capability_template_versions"("templateId")
    WHERE "status" = 'PUBLISHED';

CREATE INDEX "capability_template_versions_status_idx" ON "capability_template_versions"("status");

ALTER TABLE "capability_template_versions"
    ADD CONSTRAINT "capability_template_versions_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "capability_templates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;