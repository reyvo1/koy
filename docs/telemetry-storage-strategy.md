# Telemetry Storage Strategy

## Status

Approved baseline for Module 09 on 2026-07-18.

This decision records the storage direction after the tenant-isolated latest and bounded history query foundations passed remote GitHub Actions. It does not activate production deployment.

## Context

The repository uses PostgreSQL 16 and Prisma. Raw telemetry is stored in the normalized `telemetry` table with tenant and device ownership, JSON payloads, event idempotency, deterministic time ordering, and a composite query index over `tenantId`, `deviceId`, `createdAt`, and `id`.

The repository does not currently depend on TimescaleDB, hypertables, `pg_cron`, materialized telemetry rollups, or another time-series database extension. PostgreSQL remains the authoritative recovery source.

## Decision Summary

- PostgreSQL 16 remains the authoritative telemetry store.
- The existing telemetry table remains non-partitioned until operational evidence justifies partitioning.
- Raw telemetry row retention is unlimited by default and automatic deletion is disabled by default.
- Backup retention and telemetry row retention are separate policies.
- Aggregation remains read-time until a capability-driven aggregation contract and measured workload justify persisted rollups.
- Module 10 remains inactive until Module 09 is completed and explicitly approved.
- Production deployment remains NOT APPROVED and requires separate environment-specific approval.

## Retention Boundary

The existing 35-day online backup retention controls encrypted backup files. It does not authorize deletion of telemetry rows.

No telemetry row may be deleted automatically until all of the following are explicitly approved:

1. Product, legal, audit, and customer retention requirements.
2. The owning operator and incident escalation path.
3. A raw telemetry retention period and cutoff semantics.
4. Backup and restore impact, including recovery-point expectations.
5. Storage volume and deletion-window evidence.
6. A tested rollback or restore decision for destructive failures.

A future retention implementation must be disabled by default. When enabled, it must:

- derive the cutoff from `createdAt`;
- delete only in bounded batches;
- enforce a maximum execution duration;
- support dry-run evidence before destructive execution;
- use a PostgreSQL advisory lock to prevent concurrent multi-instance execution;
- be idempotent and safe to retry;
- emit structured start, completion, skip, and failure logs;
- expose scanned, deleted, failed, and duration metrics without tenant or device label cardinality;
- preserve tenant isolation and never accept a tenant or device selector from an untrusted HTTP request.

## Partitioning Boundary

Declarative partitioning is deferred. The current table and composite query index are the approved baseline.

Partitioning must be reviewed only when measured evidence shows one or more of the following:

- history-query latency no longer meets the approved service objective with the current index;
- table or index growth materially extends backup, restore, vacuum, or maintenance windows;
- bounded retention deletion cannot complete inside the approved maintenance window;
- autovacuum, write amplification, or index maintenance creates sustained operational pressure;
- row volume and growth forecasts justify the migration and operating complexity.

If partitioning is later approved, the preferred direction is native PostgreSQL range partitioning by `createdAt`. The change must use a separately approved backward-compatible expand-and-contract migration, remain compatible with the immediately preceding application release, preserve tenant-isolated query behavior, and pass migration, integration, backup, and restore validation. A vendor-specific time-series extension is not approved by this decision.

## Aggregation Boundary

Read-time aggregation is the baseline. Persisted rollups are deferred.

Before any aggregation API is implemented, its contract must define:

- the reportable capability and supported data type;
- the numeric source path inside the normalized payload;
- bucket interval and UTC boundary semantics;
- unit handling and incompatible-unit rejection;
- empty-bucket and null behavior;
- late-arriving telemetry behavior;
- tenant and device isolation;
- maximum time range and bounded result size.

Persisted rollups require separate evidence for query load, refresh behavior, rebuild strategy, retention interaction, and recovery compatibility.

## Observability and Operations

Any future retention or persisted aggregation worker must follow the existing structured logging and metrics conventions. Multi-instance destructive work requires database-backed coordination rather than process-local scheduling alone.

Operational dashboards should track telemetry row growth, table and index size, history-query latency, backup duration, restore duration, vacuum pressure, and retention-job outcomes before partitioning or destructive retention is activated.

## Validation Contract

This decision-record slice changes documentation and contract tests only. It does not modify application runtime behavior, Prisma schema, migrations, MQTT behavior, dependencies, environment configuration, or CI orchestration.

A future runtime slice must add focused unit and contract tests. Database changes must also pass Prisma validation, committed migration deployment, isolated PostgreSQL integration, backup, and restore gates.

## Next Slice

The bounded read-time telemetry aggregation query foundation is implemented and green remotely at commit `207894e`. Module 09 completion review passed locally; Module 10 remains inactive pending green remote CI for the completion-review commit and explicit activation approval.

<!-- MODULE-09-TELEMETRY-AGGREGATION:START -->
## Implemented Read-Time Aggregation Foundation

The first approved read-time query is device-scoped and capability-key scoped. It supports reportable `integer` and `number` capabilities, canonical UTC `[from, to)` bounds, `15m`, `1h`, and `1d` buckets, a 31-day maximum range, and a 744-bucket maximum result. It returns numeric observation `count`, `min`, `max`, and `avg`; skips missing and non-numeric JSON values; omits empty buckets; and uses `Telemetry.createdAt` ingestion time.

The query uses parameterized PostgreSQL 16 `date_bin` and JSONB operators through Prisma raw-query safety boundaries. The existing table and index remain unchanged. This implementation does not approve persisted rollups, partitioning, automatic row deletion, or a scheduler.
<!-- MODULE-09-TELEMETRY-AGGREGATION:END -->

<!-- MODULE-09-COMPLETION-REVIEW:START -->
## Module 09 Completion Review

Module 09 is complete at the repository level. Its completed capability set includes source-of-truth reconciliation, authenticated tenant-isolated latest reads, bounded cursor history, the PostgreSQL 16 storage strategy, and bounded read-time numeric aggregation.

The read-only completion audit passed 114 checks with 0 failures. Implementation commit `207894e` is confirmed green in remote GitHub Actions. This completion patch changes lifecycle metadata, documentation, and contract tests only; runtime behavior, Prisma schema and migrations, dependencies, MQTT behavior, Redis behavior, retention, partitioning, and persisted rollups remain unchanged.

Module 10 remains inactive until this completion-review commit is green remotely and activation is explicitly approved. Production deployment remains NOT APPROVED.
<!-- MODULE-09-COMPLETION-REVIEW:END -->

<!-- WAVE10-RETENTION-IMPLEMENTATION:START -->
## Retention Implementation Status (Wave 10; hardened 2026-10-18)

The Retention Boundary above states what a retention implementation must do before it may run. That implementation now exists, so where the Decision Summary and Aggregation Boundary describe automatic deletion and persisted rollups as future work, read those statements as the baseline as approved on 2026-07-18, not as the current repository state. Nothing here approves partitioning, a scheduler, or production deployment.

Where the implementation lives:

- `src/telemetry/telemetry-retention.service.ts` summarises each expiring window into `telemetry_rollups` (model `TelemetryRollup`, migration `20261002000000_wave10_telemetry_rollups`) and only then removes raw rows. Both steps share one `cutoff` inside one transaction.
- The cut-off is derived from `createdAt`, tenant id is required, and an unscoped call refuses before touching the database.
- Removal runs in bounded batches (`batchSize`, default 5000) under a wall-clock budget (`maxDurationMs`, default 300s). A run that reaches the budget stops cleanly, commits what it did, and reports `stoppedEarly`; the next run continues where it left off.
- The whole run executes under `pg_try_advisory_xact_lock(hashtextextended('telemetry-retention:<tenantId>', 0))`. A second run against the same tenant skips and reports `skipped` rather than queueing or racing.
- `dryRun: true` reports the buckets a pass would write and the rows it would remove without writing anything -- the dry-run evidence this document requires before destructive execution.
- Runs emit structured start, completion, skip, and failure logs, and bounded-cardinality metrics (`iot_telemetry_retention_runs_total`, `iot_telemetry_retention_rows_pruned_total`, `iot_telemetry_retention_rollup_buckets_total`, `iot_telemetry_retention_duration_seconds`) with outcome and stopped-early labels only -- no tenant or device cardinality.

Operations:

- Nothing is scheduled automatically. Retention remains disabled by default and operator-invoked. Evidence first: `npm run retention:run -- --tenant <id> --retention-days 30 --bucket 15m --dry-run`. Then the same command without `--dry-run` for the destructive pass.
- `npm run retention:probe` remains the live PostgreSQL proof run by CI; it exercises the same service end to end.
- The 1M-row local scale probe (2026-10-18) measured the pre-hardening pass at a single 502k-row statement taking ~33s, plus one extra query per rollup bucket. The batched form bounds each statement; the last value per bucket is computed inside the single aggregate query.
- Migration `20261018000000_hardening_telemetry_tenant_createdat_index` adds `(tenantId, createdAt)`, the shape both retention steps use and which the composite query index cannot serve without a device.
<!-- WAVE10-RETENTION-IMPLEMENTATION:END -->
