-- Hardening (2026-10-18): a tenant-wide `createdAt` range index for telemetry.
--
-- Both retention steps range over `createdAt` for one tenant without naming a device: the rollup
-- aggregate selects the expiring window, and the batched removal repeats the same predicate. The
-- composite "telemetry_tenantId_deviceId_createdAt_id_idx" cannot serve that shape -- after the
-- tenant equality the next key is deviceId, so a tenant-wide time range falls back to scanning.
--
-- `prisma migrate dev --create-only` could not generate this here: it refuses to run
-- non-interactively, and the repository carries pre-existing schema/migration constraint drifts
-- (billing_usage, device_group_members, space_device_placements) that a generated migration would
-- have swept into this unrelated change. Manual SQL is the fallback prisma/DATABASE-CONVENTIONS.md
-- documents for the case where the generator cannot be used.
--
-- IF NOT EXISTS so applying against a database that already carries the index (local probe runs) is
-- a no-op. No CONCURRENTLY: migrations run inside a transaction by default, and the writes this
-- could block are matters for a production-scale review, not for this slice.
CREATE INDEX IF NOT EXISTS "telemetry_tenantId_createdAt_idx"
    ON "telemetry"("tenantId", "createdAt");
