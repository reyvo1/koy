# Module 10 Slice 10.1 Dashboard Domain and Schema Proposal

## Decision Status

Slice 10.1 is the approved architecture checkpoint for the Dynamic Dashboard domain. The Module 10 activation commit `4ada560` is confirmed green remotely.

This slice defines the aggregate, relational schema direction, tenant ownership, capability binding, validation, versioning, and persistence boundaries. It does not modify `prisma/schema.prisma`, create a migration, add runtime code, install frontend dependencies, implement CCTV protocols, activate barcode onboarding, activate Module 11, or approve production deployment.

## Architecture Decision

Dashboard state will be persisted in PostgreSQL through normalized relational tables in Slice 10.2. The full dashboard aggregate will not be stored as one opaque JSON document.

Validated JSON columns are allowed only for bounded presentation metadata and bounded query configuration where a relational column would create unnecessary churn. JSON must never contain credentials, tokens, raw RTSP URLs, arbitrary SQL, executable expressions, arbitrary CSS, vendor secrets, MQTT topics, or unbounded user content.

The aggregate hierarchy is:

```text
Dashboard
  -> DashboardLayout
      -> DashboardLayoutItem
          -> DashboardWidget
              -> DashboardWidgetBinding
```

A widget is independent from placement. A widget may appear once in each responsive layout through a layout item. This supports Admin Web, User Web, Android, and future iOS without duplicating the dashboard definition for every client.

## Proposed Relational Models

### Dashboard

The `Dashboard` aggregate root is tenant-owned and has an owning membership.

Proposed fields:

- `id`: UUID primary key;
- `tenantId`: required tenant ownership boundary;
- `ownerMembershipId`: required membership responsible for the dashboard;
- `name`: required, trimmed, 1 to 120 characters;
- `description`: optional, at most 500 characters;
- `audience`: `PERSONAL` or `TENANT_SHARED`;
- `schemaVersion`: semantic contract version, initially `1.0.0`;
- `revision`: positive integer used for aggregate optimistic concurrency;
- `createdAt` and `updatedAt`.

`TENANT_SHARED` persistence may exist in Slice 10.2, but shared mutation and read behavior must remain disabled until the tenant authorization policy is implemented in Slice 10.3. The UI must not infer access from the audience value alone.

### DashboardLayout

A `DashboardLayout` defines one responsive grid for a dashboard.

Proposed fields:

- `id`;
- `tenantId`;
- `dashboardId`;
- `breakpoint`: `DESKTOP`, `TABLET`, or `MOBILE`;
- `columns`: bounded positive integer;
- `rowHeight`: bounded positive integer;
- `gap`: bounded non-negative integer;
- `createdAt` and `updatedAt`.

There is at most one layout per dashboard and breakpoint. The initial limits are 24 columns, 256 rows, and three layouts per dashboard.

### DashboardWidget

A `DashboardWidget` contains presentation identity and validated widget configuration, not grid coordinates.

Proposed fields:

- `id`;
- `tenantId`;
- `dashboardId`;
- `kind`: `CARD`, `SWITCH`, `GAUGE`, `CHART`, `MAP`, `TABLE`, or `STATUS`;
- `title`: required, trimmed, 1 to 120 characters;
- `schemaVersion`: initially `1.0.0`;
- `presentationConfig`: optional bounded JSON validated by widget kind;
- `createdAt` and `updatedAt`.

A dashboard is limited to 100 widgets. Presentation configuration is limited to 8 KiB after JSON serialization.

### DashboardLayoutItem

A `DashboardLayoutItem` places one widget into one layout.

Proposed fields:

- `id`;
- `tenantId`;
- `layoutId`;
- `widgetId`;
- `x` and `y`;
- `width` and `height`;
- optional `minWidth` and `minHeight`;
- `createdAt` and `updatedAt`.

`x`, `y`, `width`, and `height` are bounded integers. Placement must remain inside the layout column count. A widget may appear only once in a specific layout.

### DashboardWidgetBinding

A `DashboardWidgetBinding` connects a widget to a normalized device or capability contract.

Proposed fields:

- `id`;
- `tenantId`;
- `widgetId`;
- `alias`: stable widget-local identifier, 1 to 64 characters;
- `intent`: `READ`, `REPORT`, or `WRITE`;
- `mode`: `DEVICE_STATUS`, `LATEST`, `HISTORY`, `AGGREGATE`, or `COMMAND`;
- `deviceId`: required;
- `capabilityId`: optional only for `DEVICE_STATUS`, otherwise required;
- `queryConfig`: optional bounded JSON validated by mode;
- `createdAt` and `updatedAt`.

A widget is limited to 16 bindings. Query configuration is limited to 4 KiB after JSON serialization. The binding stores identifiers only; it never stores device credentials, broker credentials, camera credentials, vendor tokens, or stream URLs.

## Proposed Enums

```text
DashboardAudience
  PERSONAL
  TENANT_SHARED

DashboardBreakpoint
  DESKTOP
  TABLET
  MOBILE

DashboardWidgetKind
  CARD
  SWITCH
  GAUGE
  CHART
  MAP
  TABLE
  STATUS

DashboardBindingIntent
  READ
  REPORT
  WRITE

DashboardBindingMode
  DEVICE_STATUS
  LATEST
  HISTORY
  AGGREGATE
  COMMAND
```

These are domain enums, not vendor or protocol enums.

## Tenant Isolation and Referential Integrity

Every dashboard aggregate query begins with trusted authenticated tenant context. Client-provided tenant IDs and resource IDs are selectors only and never establish authorization.

Slice 10.2 must use composite tenant-aware relations for dashboard children. The migration proposal must include the minimum supporting composite uniqueness needed to enforce:

- dashboard owner membership belongs to the same tenant;
- layout belongs to the same tenant and dashboard;
- widget belongs to the same tenant and dashboard;
- layout item belongs to the same tenant, layout, and widget;
- binding belongs to the same tenant and widget;
- bound device belongs to the same tenant;
- bound capability belongs to the selected device.

The expected supporting keys are equivalent to `Membership(id, tenantId)`, `Device(id, tenantId)`, and `Capability(id, deviceId)`. Exact Prisma relation names are decided in Slice 10.2 after `prisma validate` proves the schema.

Dashboard deletion may cascade only to dashboard-owned layouts, items, widgets, and bindings. Membership, device, and capability deletion must not silently cascade through dashboard bindings. Stale external references must be rejected or explicitly removed in a transaction.

## Ownership and Authorization

`ownerMembershipId` records dashboard ownership within a tenant. It does not grant platform-wide administrator privileges.

Initial authorization contract:

- `PERSONAL` dashboards are readable and mutable only by their owning active membership;
- `TENANT_SHARED` dashboards require a later explicit server-side authorization policy;
- the Admin Web does not gain access merely because it is the Admin Web;
- the User Web and mobile application do not gain access merely because they possess a dashboard ID;
- all reads and writes are filtered by trusted tenant context;
- cross-tenant resources return the existing safe not-found or forbidden domain contract without leaking existence.

No client-only authorization decision is accepted.

## Aggregate Versioning and Concurrency

`schemaVersion` versions the stored dashboard contract. Version `1.0.0` is the initial proposal. Unknown major versions must be rejected safely; compatible minor versions may be migrated by explicit server code.

`revision` provides optimistic concurrency for the complete aggregate. Every successful mutation of dashboard metadata, layouts, layout items, widgets, or bindings increments the dashboard revision in the same database transaction.

The future API must require the caller's expected revision, preferably through an `If-Match` or equivalent typed request field. A stale revision returns a stable conflict error and does not partially update the aggregate.

## Widget Compatibility Matrix

### CARD

- supports `DEVICE_STATUS`, `LATEST`, or bounded aggregate summary data;
- requires a readable or reportable capability when capability-bound;
- must render loading, empty, stale, unauthorized, offline, and error states.

### SWITCH

- uses `COMMAND` with `WRITE` intent;
- initially supports a writable boolean capability;
- command validation remains authoritative in the backend;
- the switch never optimistically claims acknowledgement before the command lifecycle confirms it.

### GAUGE

- uses `LATEST` with a numeric readable or reportable capability;
- min, max, precision, and unit come from validated capability metadata or safe presentation overrides;
- invalid or absent numeric bounds reject the widget configuration.

### CHART

- uses `HISTORY` or `AGGREGATE` with numeric reportable capabilities;
- existing bounded telemetry range, cursor, bucket, and result limits remain authoritative;
- the dashboard cannot override the `15m`, `1h`, `1d`, 31-day, or 744-bucket safety boundaries.

### MAP

- requires an approved coordinate semantic contract and paired latitude/longitude bindings;
- persistence may reserve the widget kind, but runtime resolution remains disabled until coordinate capability semantics are approved;
- it does not introduce location tracking, camera mapping, or geospatial storage in Slice 10.1.

### TABLE

- supports bounded multi-binding reads;
- rows, columns, sort keys, and refresh behavior are server-bounded;
- it does not allow arbitrary SQL, JSONPath, or client-defined queries.

### STATUS

- supports `DEVICE_STATUS` or one readable capability;
- state labels and severity mapping are validated presentation configuration;
- it must not infer device health from MQTT connectivity alone.

## Validation Rules

The server must validate the complete aggregate before persistence and again before resolution.

Minimum validation includes:

- known schema version, enum, widget kind, binding mode, and intent;
- maximum three layouts, 100 widgets, 256 rows, and 16 bindings per widget;
- unique breakpoint per dashboard;
- unique widget placement per layout;
- unique binding alias per widget;
- bounded strings and serialized JSON sizes;
- grid coordinates contained by their layout;
- capability existence under the selected device;
- device and dashboard membership in the trusted tenant;
- `READ` only for readable capabilities;
- `REPORT` only for reportable capabilities;
- `WRITE` and `COMMAND` only for writable capabilities;
- numeric widget compatibility with `integer` or `number` capability types;
- boolean switch compatibility;
- rejection of secrets, URLs, scripts, SQL, template code, CSS, MQTT topics, and unknown configuration keys.

Validation is fail-closed. Invalid child records prevent the whole aggregate mutation.

## Persistence and Transaction Boundary

Slice 10.2 will implement PostgreSQL persistence through Prisma migrations and repositories only after this proposal is accepted and remote CI is green.

The persistence transaction must:

1. verify active membership and trusted tenant context;
2. load the dashboard by tenant and ID;
3. verify the expected revision;
4. validate all referenced devices and capabilities in the same tenant;
5. apply the aggregate mutation;
6. increment the dashboard revision;
7. commit atomically;
8. emit safe structured success or rejection evidence after the transaction outcome is known.

Redis is not the source of truth for dashboard definitions. MQTT is not used to store or distribute dashboard configuration.

## API and Client Boundary

Slice 10.1 does not add endpoints. The future API in Slice 10.3 will expose bounded DTOs rather than raw Prisma models or unvalidated JSON.

Admin Web, User Web, and mobile share the same dashboard contract. Platform-specific rendering may differ, but ownership, schema version, revision, widget kind, bindings, and validation semantics remain consistent.

A client must tolerate a supported widget that it cannot render by showing an explicit unsupported-widget state without corrupting or deleting the dashboard.

## Observability Boundary

Future persistence and API slices must emit bounded structured events for:

- dashboard create, read, update, and delete outcomes;
- revision conflicts;
- schema validation rejection;
- cross-tenant and unauthorized rejection;
- invalid device or capability binding;
- widget resolution success and failure.

Metrics must not use tenant ID, dashboard ID, widget ID, device ID, or capability ID as labels.

## CCTV, Barcode, and Realtime Boundaries

This proposal does not add camera models, ONVIF, RTSP, vendor connectors, stream sessions, barcode scanning, or device activation.

Future camera widgets bind only to a normalized camera/media contract approved in the CCTV phase. Raw RTSP URLs and camera credentials never become dashboard binding values.

Future QR or barcode onboarding remains a server-validated guided adapter workflow. A scanned code never creates a dashboard binding or activates a device by itself.

Web and mobile clients remain prohibited from subscribing directly to device MQTT topics. Future SSE or WebSocket delivery requires a separate authenticated, tenant-isolated adapter decision.

## Slice 10.2 Entry Criteria

Slice 10.2 may begin only after this proposal commit is green remotely. It must:

- implement the five proposed relational models and supporting enums with the smallest coherent Prisma migration;
- prove composite tenant-aware referential integrity;
- add rollback-safe migration review and Prisma validation;
- add repository-level persistence and transaction contract tests;
- keep API endpoints, widget resolution, frontend workspaces, CCTV, barcode runtime, and Module 11 out of scope;
- preserve production deployment as NOT APPROVED.

## Slice 10.1 Validation Boundary

This slice changes lifecycle metadata, architecture documentation, repository memory, and contract tests only.

It intentionally leaves unchanged:

- `prisma/schema.prisma` and all migrations;
- application runtime behavior;
- production and development dependencies;
- package workspaces;
- HTTP, telemetry, command, MQTT, and Redis behavior;
- frontend application shells;
- CCTV and barcode runtime behavior;
- Module 11 lifecycle state;
- production deployment approval.

<!-- MODULE-10-DASHBOARD-PERSISTENCE-IMPLEMENTATION:START -->
## Slice 10.2 Implementation Record

The approved proposal is implemented by migration `20260718190000_module_10_dashboard_persistence_foundation`, the Prisma dashboard models, `DashboardRepository`, and `test/integration/dashboard-persistence.integration-spec.ts`.

The implementation preserves the proposed normalized aggregate, composite tenant-aware integrity, restrictive external references, bounded JSON, optimistic revision, and PERSONAL-only repository behavior. Slice 10.3 remains responsible for authenticated API authorization and TENANT_SHARED policy.
<!-- MODULE-10-DASHBOARD-PERSISTENCE-IMPLEMENTATION:END -->
