# Module 10 Slice 10.4 Capability-Driven Widget Resolution

## Decision Status

Slice 10.4 is implemented after the Slice 10.3 commit `06325f1` was confirmed green remotely.

This slice adds server-side widget compatibility validation and a tenant-isolated resolution plan. It does not execute telemetry queries, publish commands, create frontend workspaces, introduce camera or barcode runtime, activate Module 11, or approve production deployment.

## Resolution Boundary

`DashboardWidgetResolver` is the authoritative widget semantic boundary. Dashboard create and replace operations validate the complete widget set inside the existing repository transaction after tenant-scoped device and capability metadata has been loaded. The authenticated resolution endpoint validates the persisted aggregate again so capability changes fail safely without corrupting the dashboard.

The endpoint is:

```text
GET /dashboards/:dashboardId/resolution
```

It uses the same JWT, trusted tenant context, PERSONAL ownership, and TENANT_SHARED read authorization as the dashboard API. It returns only safe device status, normalized capability metadata, bounded query plans, bounded presentation metadata, per-widget resolution state, and aggregate summary counts. Tenant IDs, owner membership IDs, credentials, raw MQTT topics, raw stream URLs, vendor secrets, and Prisma records are not exposed.

## Widget Compatibility Contract

### CARD

- exactly one binding;
- supports `DEVICE_STATUS`, `LATEST`, or numeric `AGGREGATE` summary;
- capability-bound reads require the matching readable or reportable permission.

### SWITCH

- exactly one `COMMAND` binding with `WRITE` intent;
- capability must be writable and boolean;
- resolution never claims command acknowledgement and does not publish a command.

### GAUGE

- exactly one `LATEST` binding;
- capability must be numeric and readable or reportable;
- valid min and max bounds are required from capability constraints or safe presentation overrides;
- unit and precision are normalized from bounded metadata.

### CHART

- one to sixteen numeric reportable bindings;
- supports only `HISTORY` and `AGGREGATE`;
- history limit remains between 1 and 100;
- aggregate buckets remain `15m`, `1h`, or `1d`, range remains at most 31 days, and plans remain at most 744 buckets.

### MAP

- remains fail-closed and reports `MAP_SEMANTICS_NOT_APPROVED`;
- no latitude/longitude semantic contract, location tracking, camera mapping, or geospatial persistence is invented by this slice.

### TABLE

- one to sixteen `DEVICE_STATUS` or `LATEST` bindings;
- columns and sort keys must reference binding aliases;
- row count and refresh configuration are bounded;
- arbitrary SQL, JSONPath, and client-defined queries remain prohibited.

### STATUS

- exactly one `DEVICE_STATUS` or `LATEST` binding;
- labels and severity mappings are bounded string maps;
- device health is not inferred from MQTT connectivity alone.

## Fail-Closed Rules

Persistence rejects:

- unknown widget schema versions or kinds;
- incompatible mode, intent, data type, or capability access flags;
- revoked or missing devices;
- missing or mismatched capabilities;
- unknown presentation or query configuration keys;
- unbounded history or aggregation plans;
- MAP runtime configuration before coordinate semantics are approved.

The resolution endpoint isolates widget failures. Each widget is returned as `READY`, `INVALID`, or `UNSUPPORTED`, with a bounded reason code and message. A failed widget does not make the whole authorized dashboard unreadable.

Every resolved widget advertises the required client states: loading, empty, stale, unauthorized, offline, and error.

## Observability

Structured events are bounded and exclude tenant, dashboard, widget, device, and capability identifiers:

- `dashboard.widget_resolution.completed`;
- `dashboard.widget_resolution.rejected`;
- `dashboard.api.resolved`.

Events contain only outcome, widget kind, reason code, and bounded counts.

## Validation Evidence

The slice is covered by:

- widget resolver unit tests for all seven widget kinds;
- dashboard service resolution tests;
- repository contract tests;
- PostgreSQL integration proof for valid writable boolean resolution, invalid capability rejection, MAP rejection, and safe capability metadata;
- focused and full lint, Nest build, full Jest, lifecycle validation, and lifecycle simulation.

## Deferred Work

Slice 10.5 Telemetry Widget Query Integration is implemented after remote-green Slice 10.4 commit `253c6ee`; its binding record is `docs/module-10-telemetry-widget-query-integration.md`.

The following remain deferred:

- command execution from widgets;
- SSE or WebSocket delivery;
- Admin Web, User Web, and mobile workspaces;
- CCTV, ONVIF, RTSP, media sessions, and barcode runtime;
- Module 11 activation;
- production deployment approval.
