# Module 10 Slice 10.3 Tenant-Isolated Dashboard API

## Status

Implemented after the Slice 10.2 commit `401d52a` was confirmed green remotely.

Production deployment remains **NOT APPROVED**. Module 11 remains inactive.

## Scope

Slice 10.3 adds authenticated, tenant-isolated CRUD for dashboard definitions on top of the existing `DashboardRepository` persistence boundary:

- `POST /dashboards`;
- `GET /dashboards?limit=...`;
- `GET /dashboards/:dashboardId`;
- `PUT /dashboards/:dashboardId`;
- `DELETE /dashboards/:dashboardId?expectedRevision=...`.

Every route requires `JwtAuthGuard`, `TenantContextGuard`, and a trusted `X-Tenant-Id` selector. The guard resolves the active membership ID and role server-side. Request bodies cannot provide `tenantId` or `ownerMembershipId`.

## Authorization Policy

The approved initial policy is:

- an active membership is required for every operation;
- `PERSONAL` dashboards are readable and mutable only by their owner membership;
- `TENANT_SHARED` dashboards are readable by every active membership in the tenant;
- only role `ADMIN` may create, replace, or delete `TENANT_SHARED` dashboards;
- dashboard audience is immutable after creation;
- a cross-tenant dashboard or another membership's personal dashboard returns `DASHBOARD_NOT_FOUND` without disclosing existence;
- shared mutation by a non-admin returns `DASHBOARD_SHARED_ADMIN_REQUIRED`.

This policy uses the existing `MEMBER` and `ADMIN` membership values. It does not invent a new role model or infer authorization from client surface.

## API Contract

Create and replace bodies use nested, bounded class-validator DTOs. The API preserves the persistence limits for layouts, widgets, layout items, bindings, schema version, strings, and JSON objects.

Every mutation uses optimistic concurrency:

- replace requires `expectedRevision` in the request body;
- delete requires `expectedRevision` in the query;
- stale mutations return `409 DASHBOARD_REVISION_CONFLICT`;
- no partial child update is committed.

List responses are capped at 100 summaries. Aggregate responses expose dashboard, layout, widget, placement, and binding descriptors, but do not expose:

- `tenantId`;
- `ownerMembershipId`;
- raw Prisma records;
- credentials or secrets;
- raw MQTT topics;
- RTSP URLs or vendor tokens.

## Stable Error Mapping

Repository errors are mapped at the API boundary:

| Persistence condition | HTTP | Stable code |
| --- | ---: | --- |
| invalid aggregate or bounds | 400 | `DASHBOARD_PERSISTENCE_INVALID_INPUT` |
| invalid/inactive membership | 403 | `DASHBOARD_MEMBERSHIP_INVALID` |
| inaccessible or absent dashboard | 404 | `DASHBOARD_NOT_FOUND` |
| stale revision | 409 | `DASHBOARD_REVISION_CONFLICT` |
| invalid device/capability binding | 400 | `DASHBOARD_BINDING_TARGET_INVALID` |
| non-admin shared mutation | 403 | `DASHBOARD_SHARED_ADMIN_REQUIRED` |

## Observability

The service and repository emit bounded structured events for create, list, read, update, delete, rejection, and revision conflict outcomes. Tenant, membership, dashboard, device, and capability identifiers are not added as metric labels.

## Validation Evidence

The slice includes:

- controller and DTO contract coverage;
- service authorization and response-sanitization tests;
- tenant-context membership ID coverage;
- PostgreSQL integration proof for personal isolation, shared reads, admin-only shared mutation, list filtering, revision handling, and deletion;
- Prisma validation and generation;
- focused and full ESLint;
- Nest build;
- focused contracts and full Jest;
- lifecycle validate and simulation.

## Explicitly Out of Scope

Slice 10.3 does not implement:

- capability-driven widget semantic resolution;
- telemetry latest/history/aggregation execution through dashboard bindings;
- command execution through switch widgets;
- frontend workspaces or application shells;
- SSE or WebSocket delivery;
- CCTV, ONVIF, RTSP, camera credentials, or media gateways;
- QR/barcode device activation;
- Module 11;
- production deployment approval.

Slice 10.4 Capability-Driven Widget Resolution is the next candidate only after the Slice 10.3 commit is green remotely.
