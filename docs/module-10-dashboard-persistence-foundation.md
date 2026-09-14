# Module 10 Slice 10.2 Dashboard Persistence Foundation

## Decision Status

Slice 10.2 implements the approved persistence direction from `docs/module-10-dashboard-domain-schema-proposal.md`. The Slice 10.1 commit `ce58793` is confirmed green remotely.

This slice adds the normalized PostgreSQL dashboard schema, the smallest coherent Prisma migration, a repository-only persistence boundary, and PostgreSQL integration proof. It does not add HTTP endpoints, dashboard authorization APIs, widget resolution, frontend dependencies, camera protocols, barcode runtime, Module 11, or production deployment approval.

## Implemented Relational Aggregate

The persisted aggregate is:

```text
Dashboard
  -> DashboardLayout
      -> DashboardLayoutItem
          -> DashboardWidget
              -> DashboardWidgetBinding
```

The implementation adds:

- `Dashboard`;
- `DashboardLayout`;
- `DashboardWidget`;
- `DashboardLayoutItem`;
- `DashboardWidgetBinding`;
- `DashboardAudience`;
- `DashboardBreakpoint`;
- `DashboardWidgetKind`;
- `DashboardBindingIntent`;
- `DashboardBindingMode`.

PostgreSQL remains authoritative. Redis and MQTT are not used for dashboard definitions.

## Tenant-Aware Referential Integrity

The migration adds the minimum supporting composite uniqueness:

- `Membership(id, tenantId)`;
- `Device(id, tenantId)`;
- `Capability(id, deviceId)`;
- `Dashboard(id, tenantId)`;
- `DashboardLayout(id, tenantId)`;
- `DashboardWidget(id, tenantId)`.

Composite foreign keys enforce:

- dashboard owner membership belongs to the dashboard tenant;
- layouts and widgets belong to the same tenant as their dashboard;
- layout items belong to the same tenant as both layout and widget;
- bindings belong to the same tenant as their widget;
- bound devices belong to the same tenant;
- bound capabilities belong to the selected device.

Dashboard-owned layouts, items, widgets, and bindings cascade on dashboard deletion. Membership, device, and capability references use `RESTRICT`; deleting an externally referenced resource cannot silently remove dashboard configuration.

## Repository Boundary

`DashboardRepository` is exported by `DashboardModule` and registered without adding a controller.

The repository supports:

- atomic creation of a personal dashboard aggregate;
- tenant- and owner-filtered aggregate reads;
- atomic replacement of layouts, widgets, placements, and bindings;
- optimistic aggregate revision increments;
- active membership verification;
- same-tenant device verification;
- capability-to-device verification;
- fail-closed persistence validation.

`TENANT_SHARED` is present in the storage enum for forward compatibility, but repository operations in this slice create and mutate only `PERSONAL` dashboards. Shared authorization remains disabled until Slice 10.3 defines the server-side policy.

## Persistence Validation

Before a transaction mutates data, the repository validates:

- UUID identifiers;
- dashboard and widget schema version `1.0.0`;
- trimmed bounded names, titles, descriptions, and aliases;
- at most three layouts;
- at most 100 widgets;
- at most 16 bindings per widget;
- unique breakpoints;
- unique widget placement per layout;
- unique binding alias per widget;
- layout geometry within 24 columns and 256 rows;
- command/write and device-status/read mode consistency;
- required capability references for non-device-status modes;
- presentation JSON at most 8 KiB;
- query JSON at most 4 KiB;
- rejection of credential, password, secret, token, RTSP, MQTT, SQL, script, CSS, template, and executable URL content.

This is persistence validation, not complete widget semantic resolution. Capability readability, reportability, writability, numeric compatibility, map semantics, telemetry query resolution, and command execution remain later Module 10 slices.

## Transaction and Concurrency Contract

Create and replace operations use one Prisma interactive transaction.

Replacement performs:

1. active owner membership verification;
2. tenant-owned dashboard lookup;
3. binding target verification;
4. conditional `updateMany` on the expected revision;
5. aggregate metadata update and revision increment;
6. replacement of dashboard-owned children;
7. aggregate reload;
8. commit or complete rollback.

A stale revision raises `DASHBOARD_REVISION_CONFLICT`. Because the revision update and child replacement share one transaction, a later failure rolls back both.

Repository errors are persistence-domain errors rather than HTTP responses. Slice 10.3 will map them into the existing stable API error contract.

## Observability

The repository emits bounded structured events for:

- dashboard persistence creation;
- dashboard persistence replacement;
- revision rejection.

The event names and outcomes do not use tenant, dashboard, widget, device, or capability identifiers as metric labels. No credentials or configuration payloads are logged.

## Migration Safety

Migration `20260718190000_module_10_dashboard_persistence_foundation` is additive:

- it creates dashboard enums and tables;
- it adds composite unique indexes needed by foreign keys;
- it does not drop or rewrite existing tables or columns;
- it does not backfill existing device, telemetry, command, user, or tenant records;
- it preserves existing MQTT, Redis, telemetry, and command behavior.

The database integration runner deploys every committed migration into a run-owned PostgreSQL schema and drops that schema after the suite.

## Integration Proof

`test/integration/dashboard-persistence.integration-spec.ts` proves:

- committed migration deployment creates the dashboard schema;
- create and replace persist a complete aggregate;
- successful replacement increments revision;
- stale revision is rejected without partial mutation;
- cross-tenant membership is rejected;
- cross-tenant binding target is rejected;
- PostgreSQL composite foreign keys reject direct cross-tenant writes;
- external device deletion is restricted while referenced;
- dashboard deletion cascades only through dashboard-owned records.

## Scope Boundaries

Slice 10.2 intentionally does not add:

- dashboard HTTP controllers or DTOs;
- tenant-shared read or mutation authorization;
- capability-driven widget resolution;
- telemetry widget query execution;
- command execution from widgets;
- Admin Web, User Web, or mobile workspaces;
- SSE or WebSocket delivery;
- CCTV, ONVIF, RTSP, vendor connectors, or stream sessions;
- QR or barcode activation;
- Module 11;
- production deployment approval.

## Next Slice

Slice 10.3 is the Tenant-Isolated Dashboard API. It must review the repository contract, map persistence errors into stable domain errors, enforce authenticated active membership and personal/shared authorization, expose bounded DTOs rather than Prisma records, add Swagger contracts, and preserve all Module 10 security boundaries.

Production deployment remains **NOT APPROVED**.
