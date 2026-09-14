# Module 10 Slice 10.5 Telemetry Widget Query Integration

## Decision Status

Slice 10.5 is implemented after the Slice 10.4 commit `253c6ee` was confirmed green remotely.

This slice adds tenant-isolated, per-widget execution for `DEVICE_STATUS`, `LATEST`, `HISTORY`, and `AGGREGATE` bindings by reusing the bounded Module 09 telemetry services. It does not publish commands, add SSE or WebSocket delivery, create frontend workspaces, implement camera or barcode runtime, activate Module 11, or approve production deployment.

## Endpoint

```text
GET /dashboards/:dashboardId/widgets/:widgetId/data
```

The endpoint uses JWT authentication, trusted tenant context, dashboard PERSONAL ownership or TENANT_SHARED read authorization, and server-side widget resolution before any telemetry service is called. A dashboard ID, widget ID, device ID, or capability key is only a selector and never establishes authorization.

## Query Boundary

Execution is isolated to one selected widget. At most the persisted sixteen bindings of the selected widget are executed in one request.

- `DEVICE_STATUS` returns the normalized device lifecycle status already loaded by the resolution boundary.
- `LATEST` calls the existing tenant-scoped latest telemetry service and returns only the bound capability value.
- `HISTORY` calls the existing cursor-bounded history service with the persisted limit and returns only points containing the bound capability.
- `AGGREGATE` calls the existing PostgreSQL read-time aggregation service with persisted bucket and range settings. Canonical `from` and `to` timestamps are derived by the server.
- `COMMAND` remains fail-closed with `COMMAND_QUERY_DEFERRED`; command publication and acknowledgement are not part of this slice.

The dashboard layer does not access Prisma or raw SQL for telemetry. Module 09 remains authoritative for device isolation, history limits, canonical cursor behavior, numeric aggregation validation, the `15m`/`1h`/`1d` bucket set, the 31-day range, and the 744-bucket limit.

## Response Safety

The response contains:

- dashboard schema version and revision;
- selected widget kind, title, and generated timestamp;
- bounded per-binding states;
- only the bound capability value, bounded history points, bounded aggregate buckets, or normalized device status;
- no tenant ID, owner membership ID, raw telemetry row, event ID, MQTT topic, credential, vendor secret, or Prisma record.

Per-binding states are `READY`, `EMPTY`, `STALE`, `INVALID`, `UNSUPPORTED`, or `ERROR`. One telemetry failure is converted into a safe binding error and does not make another dashboard or widget query fail.

## Staleness

`LATEST` and `HISTORY` use the already validated widget `staleAfterSeconds` presentation value. Staleness is computed against a server-generated timestamp. No MQTT connectivity or device health inference is invented.

## Observability

The bounded structured event is:

- `dashboard.widget_query.completed`.

It records outcome, widget kind, result state, binding count, failed binding count, and duration. Tenant, dashboard, widget, device, capability, payload, and value identifiers are excluded.

## Validation Evidence

The slice includes:

- query-service unit coverage for latest, stale, history, aggregate, device-status, command-deferred, and isolated failure behavior;
- dashboard service coverage for tenant-authorized widget execution and response sanitization;
- contract coverage for lifecycle, endpoint, existing telemetry API reuse, bounded execution, module wiring, and deferred boundaries;
- PostgreSQL integration proof for latest and aggregate widget execution;
- focused and full lint, Nest build, full Jest, lifecycle validation, lifecycle simulation, and database integration gates.

## Deferred Work

Slice 10.6 Web Workspace and Design-System Foundation is the next candidate only after the Slice 10.5 commit is green remotely.

The following remain deferred:

- command execution and command acknowledgement rendering;
- dashboard-wide fan-out or realtime push delivery;
- SSE and WebSocket adapters;
- Admin Web, User Web, and mobile workspaces;
- CCTV, ONVIF, RTSP, media sessions, and barcode runtime;
- Module 11 activation;
- production deployment approval.
