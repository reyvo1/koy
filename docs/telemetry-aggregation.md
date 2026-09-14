# Telemetry Read-Time Aggregation

## Status

Module 09 read-time aggregation query foundation approved and implemented on 2026-07-18 after the telemetry storage strategy passed remote GitHub Actions at commit `1354f5a`.

Production deployment remains NOT APPROVED and requires separate environment-specific verification and approval.

## Endpoint

```http
GET /devices/:deviceId/telemetry/aggregate
```

The endpoint uses `JwtAuthGuard` and `TenantContextGuard`. Tenant identity is accepted only from the trusted tenant context. The device and capability must belong to that tenant and device before aggregation SQL is executed.

Required query parameters:

- `capability`: exact capability key;
- `from`: canonical UTC ISO-8601 timestamp;
- `to`: canonical UTC ISO-8601 timestamp;
- `bucket`: `15m`, `1h`, or `1d`.

## Time Contract

The query interval is `[from, to)`:

- `from` is inclusive;
- `to` is exclusive;
- both timestamps must use canonical `Date.toISOString()` form and end in `Z`;
- `to` must be later than `from`;
- the maximum time range is 31 days;
- the maximum result bound is 744 buckets.

The first implementation uses `Telemetry.createdAt`, which is the ingestion timestamp. Late-arriving telemetry is therefore assigned according to ingestion time. No separate device event timestamp is introduced.

## Capability Contract

Aggregation is allowed only when the selected capability:

- is defined on the requested device;
- is reportable;
- has data type `integer` or `number`.

The response includes the capability key, data type, and current unit. No unit conversion is performed.

## Numeric Observation Contract

Only JSONB values whose runtime JSON type is `number` are included. Missing keys, `null`, strings, booleans, objects, and arrays are skipped.

Each returned bucket contains:

- `start`;
- `end`;
- `count` of numeric observations for the selected capability;
- `min`;
- `max`;
- `avg`.

`sum` is intentionally excluded because the capability model does not yet define whether a numeric capability is additive. Empty buckets are omitted rather than synthesized. A query with no numeric observations returns `buckets: []`.

## PostgreSQL Query Boundary

The implementation uses PostgreSQL 16 `date_bin` and JSONB operators through `Prisma.sql` and parameterized `prisma.$queryRaw`.

The trusted bucket enum maps to fixed interval values. Tenant ID, device ID, capability key, timestamps, and result limit remain query parameters. `$queryRawUnsafe` and `$executeRawUnsafe` are prohibited.

The existing composite index over `tenantId`, `deviceId`, `createdAt`, and `id` remains the approved baseline. No schema migration, partition, JSON expression index, or persisted aggregate table is added.

## Observability

Successful and failed SQL execution emits structured events without telemetry payloads:

- `telemetry.aggregate.succeeded`;
- `telemetry.aggregate.failed`.

Metrics use only bounded `outcome` and `bucket` labels:

- `iot_telemetry_aggregation_queries_total`;
- `iot_telemetry_aggregation_duration_seconds`.

Tenant ID, device ID, and capability key are not metric labels. The global HTTP interceptor continues to record route-level request count and duration.

## Error Contract

Invalid timestamps, range, bucket, result bounds, or non-numeric capability selection use:

```text
TELEMETRY_AGGREGATION_QUERY_INVALID
```

Missing or cross-tenant devices preserve `DEVICE_NOT_FOUND`. Missing and non-reportable capabilities preserve the existing capability domain error codes.

## Validation

The slice adds:

- controller and service unit tests;
- SQL-shape and unsafe-method contract checks;
- capability, tenant, range, bucket, and empty-result tests;
- bounded-cardinality metrics tests;
- isolated PostgreSQL integration proof for `date_bin`, JSONB numeric filtering, and tenant/device predicates;
- lifecycle, lint, build, full Jest, and database integration validation.

## Explicit Exclusions

Persisted rollups remain deferred. This slice does not add:

- telemetry retention deletion;
- partitioning;
- scheduler or background worker;
- schema migration;
- dependency changes;
- MQTT changes;
- Module 10 activation;
- production deployment approval.

<!-- MODULE-09-COMPLETION-REVIEW:START -->
## Module 09 Completion Review

Module 09 is complete at the repository level. Its completed capability set includes source-of-truth reconciliation, authenticated tenant-isolated latest reads, bounded cursor history, the PostgreSQL 16 storage strategy, and bounded read-time numeric aggregation.

The read-only completion audit passed 114 checks with 0 failures. Implementation commit `207894e` is confirmed green in remote GitHub Actions. This completion patch changes lifecycle metadata, documentation, and contract tests only; runtime behavior, Prisma schema and migrations, dependencies, MQTT behavior, Redis behavior, retention, partitioning, and persisted rollups remain unchanged.

Module 10 remains inactive until this completion-review commit is green remotely and activation is explicitly approved. Production deployment remains NOT APPROVED.
<!-- MODULE-09-COMPLETION-REVIEW:END -->
