# Module 10 Slice 10.8 Admin Web Operational Dashboard

## Decision Status

Slice 10.8 Backend Operational Summary Foundation is completed and confirmed green remotely through implementation commit `4097356` and audit-fix commit `53ec5c1` in GitHub Actions run `29716215821`.

The backend runtime includes one bounded, tenant-isolated, read-only operational-summary endpoint. Its focused HTTP/PostgreSQL authorization and cross-tenant isolation evidence is green remotely. Admin Web UI remains deferred until a later bounded slice receives explicit approval.

## Remote-Green Closure Evidence

- exact checkout: `53ec5c168fe85c27586fe0e90792d04f51b62091`;
- GitHub Actions run: `29716215821`;
- full Jest: 87 suites / 635 tests;
- PostgreSQL integration: 5 suites / 18 tests;
- release artifact ID: `8450706871`;
- release artifact SHA-256: `d5b166ac738908823d305d1266c55a2464e03377213c82b22cfed2adda1ef4ad`;
- accepted production dependency-audit findings remain controlled technical debt;
- Admin Web UI, Module 11, and production deployment remain unapproved.

## Existing Repository Boundary

The repository already contains:

- an isolated Next.js App Router Admin Web shell;
- the shared accessible design-system package;
- JWT authentication and trusted tenant-context handling in the NestJS/Fastify backend;
- active membership roles `MEMBER` and `ADMIN`;
- tenant-scoped device, capability, telemetry, dashboard, and command domains;
- service-token-protected Prometheus metrics intended for operational infrastructure.

The repository now exposes a tenant-scoped `ADMIN`-only operational-summary API for an authenticated user. The existing metrics endpoint remains separate from this user-facing contract, and client-side role hiding is still not authorization.

## Approved Authorization Boundary

The Slice 10.8 runtime must:

- reuse the existing active tenant membership role `ADMIN` without creating a new role model;
- authenticate through the established JWT and same-origin server session boundary;
- derive tenant and membership context through backend guards;
- enforce `ADMIN` authorization in the backend for every operational-summary request;
- treat browser-provided tenant, role, device, capability, dashboard, and command identifiers only as selectors;
- return a stable unauthorized or forbidden response without leaking membership or resource details;
- keep access and refresh tokens out of browser storage and reuse single-flight refresh behavior for concurrent unauthorized responses.

No menu, route, component, or browser state may establish authorization.

## Approved Read-Only Operational Summary

The implementation slice may add one bounded endpoint:

```text
GET /admin/operational-summary
```

The endpoint must derive the selected tenant from the trusted request context and return normalized safe summaries only. The initial contract may include bounded counts or states for:

- devices and online or offline status;
- reportable and writable capabilities;
- latest telemetry observation and stale-device indicators;
- command lifecycle summaries such as pending, acknowledged, failed, or timed out;
- normalized health, readiness, and MQTT publisher state suitable for an authorized tenant administrator.

The response must not expose:

- Prometheus text or the metrics service token;
- database, Redis, MQTT, host, process, or deployment credentials;
- raw MQTT topics, raw telemetry payloads, or high-cardinality metric labels;
- RTSP URLs, ONVIF credentials, camera passwords, device credentials, or vendor secrets;
- unrestricted resource lists or cross-tenant selectors.

Query limits, response size, enum values, stale thresholds, and aggregation rules must be explicit and covered by tests during the runtime implementation slice.

## Admin Web Boundary

The initial Admin Web operational dashboard must remain read-only and use same-origin Next.js server routes. It must render bounded loading, empty, stale, unauthorized, offline, unsupported, and error states using the existing design system.

It may present operational cards or tables derived only from the approved summary contract. It must not implement:

- device commands or acknowledgement controls;
- provisioning, ownership assignment, membership mutation, revoke, or credential controls;
- dashboard mutation;
- direct Prometheus, MQTT, Redis, database, RTSP, ONVIF, or vendor API access;
- realtime SSE or WebSocket delivery;
- mobile, CCTV, or barcode runtime.

## Validation Boundary

The backend foundation changes only the bounded Admin Operations module, application-module registration, stable error-code contract, tests, and synchronized documentation. It leaves unchanged:

- Admin Web UI and browser session behavior;
- Prisma schema and migrations;
- dependencies and lockfiles;
- MQTT, Redis, and metrics access behavior;
- CI workflow;
- Module 11 state;
- production deployment approval.

The audit-fix adds an actual Fastify HTTP/PostgreSQL integration proof. It verifies authenticated ADMIN access, tenant-scoped aggregates that exclude another tenant, cross-tenant membership rejection, MEMBER rejection with the stable ADMIN-required code, inactive membership rejection, and unauthenticated rejection. Admin Web typecheck and build remain deferred until the UI implementation gate.

## Slice 10.8 Backend Operational Summary Foundation

This implementation adds a dedicated `AdminOperationsModule` and one read-only endpoint:

```text
GET /admin/operational-summary
```

The controller applies guards in this order:

1. `JwtAuthGuard`
2. `TenantContextGuard`
3. `AdminRoleGuard`

`AdminRoleGuard` accepts only the existing `ADMIN` membership role already attached to the trusted tenant context. The service receives only the trusted tenant ID and executes bounded aggregate queries for device status, stale or missing heartbeat counts, readable/reportable/writable capability counts, the latest telemetry timestamp, and command lifecycle status counts.

The response contains explicit enum maps, a five-minute stale threshold, one generation timestamp, and no resource lists or raw payloads. The implementation does not change Prisma schema or migrations, dependencies, MQTT, Redis, metrics access, Admin Web UI, Module 11, or production deployment approval.

## Remote-Green UI Consumer

The proposal checkpoint in `docs/module-10-admin-web-operational-dashboard-ui-proposal.md` is completed and green remotely at `658f020` / GitHub Actions run `29725053250`. The required Module Execution Kit v1.0.3 is completed and green remotely at `935c30e` / run `29741100028`. Slice 10.10 read-only Admin Web consumer is completed and green remotely at `f4195f8` / run `29766694450` without changing this backend contract.
