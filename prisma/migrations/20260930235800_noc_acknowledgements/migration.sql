-- NOC operations (Wave 6).
--
-- Additive: one table, one unique constraint, two indexes, two foreign keys. No existing table is
-- altered, so a deployment with no NOC operator behaves exactly as before.
--
-- The unique constraint on `findingId` is the load-bearing part. Without it, two operators clicking
-- acknowledge on the same finding produce two rows, and "who saw this first" becomes
-- order-dependent. With it, the second acknowledge is refused as a duplicate rather than
-- overwriting the first actor and timestamp -- which is the entire value of the record.
--
-- Every id column is `TEXT`, not `UUID`. This migration was written with `UUID` first and failed
-- with a foreign-key type mismatch, because Prisma renders a `String @default(uuid())` column as
-- `TEXT` in Postgres. The type is not cosmetic here: a `UUID` column holding lowercase hex from
-- the application would not match a `TEXT` key at all, and the failure surfaces as a constraint
-- violation at insert time rather than at deploy time.

CREATE TABLE "noc_acknowledgements" (
    "id"                TEXT NOT NULL,
    "findingId"         TEXT NOT NULL,
    "tenantId"          TEXT NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "acknowledgedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"              TEXT,
    "resolvedAt"        TIMESTAMP(3),
    "resolvedBy"        TEXT,

    CONSTRAINT "noc_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- One acknowledgement per finding. This is the constraint that makes the row a record of first
-- sight rather than a counter.
CREATE UNIQUE INDEX "noc_acknowledgements_findingId_key" ON "noc_acknowledgements"("findingId");

-- The NOC's own question is "what has this tenant acknowledged, and when", so the index leads
-- with the tenant and sorts by time within it.
CREATE INDEX "noc_acknowledgements_tenantId_acknowledgedAt_idx"
    ON "noc_acknowledgements"("tenantId", "acknowledgedAt");

ALTER TABLE "noc_acknowledgements"
    ADD CONSTRAINT "noc_acknowledgements_findingId_fkey"
    FOREIGN KEY ("findingId") REFERENCES "analytics_findings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "noc_acknowledgements"
    ADD CONSTRAINT "noc_acknowledgements_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
