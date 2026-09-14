# Module 10 Slice 10.9 Admin Web Operational Dashboard UI Proposal

## Decision Status

Slice 10.9 is a completed proposal-only checkpoint, confirmed green remotely at commit `658f020` in GitHub Actions run `29725053250`.

This checkpoint defines the bounded Admin Web UI architecture and validation contract. The separately approved implementation is recorded in `docs/module-10-admin-web-operational-dashboard-ui-foundation.md` and is completed and green remotely at `f4195f8` / run `29766694450` through the repository-standard execution framework.

## Delivery-Order Decision

Explicit owner approval inserts two bounded Admin Web steps before mobile work:

1. **10.9 Admin Web Operational Dashboard UI Proposal** — this documentation and contract checkpoint.
2. **10.10 Admin Web Operational Dashboard UI Foundation** — later implementation of the approved read-only UI.
3. **10.11 Mobile Foundation and Dynamic Dashboard** — Android-first and iOS-ready.
4. **10.12 Barcode and CCTV UI Compatibility Contract** — extension boundaries only.
5. **10.13 Security, Observability, Accessibility, and End-to-End Review**.
6. **10.14 Module 10 Completion Review**.

The sequencing change does not alter the normalized domain, backend authority, tenant isolation, protocol neutrality, vendor neutrality, or capability-driven architecture.

## Existing Proven Boundary

The repository already provides:

- the isolated `apps/admin-web` Next.js App Router workspace;
- the shared accessible design system under `packages/design-system`;
- the remote-green read-only `GET /admin/operational-summary` backend endpoint;
- backend authorization through `JwtAuthGuard` → `TenantContextGuard` → `AdminRoleGuard`;
- an actual Fastify HTTP/PostgreSQL proof for ADMIN authorization and tenant isolation;
- the proven User Web same-origin session pattern as a behavioral reference.

Slice 10.9 does not reuse User Web private source files directly. Cross-workspace extraction is deferred until a stable shared contract justifies a dedicated package.

## Approved Same-Origin Session Boundary

The Slice 10.10 implementation keeps access and refresh tokens out of browser JavaScript and browser storage.

The Admin Web will use server-only Next.js route handlers with an Admin-specific cookie namespace:

- `POST /api/session/login` accepts email, password, and tenant selector and forwards them to backend `POST /auth/login`;
- `POST /api/session/logout` calls backend `POST /auth/logout` when available and always clears local session cookies;
- `GET /api/operational-summary` calls backend `GET /admin/operational-summary`;
- access, refresh, and tenant values use `HttpOnly`, `SameSite=Lax`, path-scoped cookies and `Secure` in production;
- the server adapter sends `Authorization: Bearer ...` and `X-Tenant-Id` only from the server boundary;
- one single-flight refresh attempt may follow a backend `401` response;
- backend `403` remains authoritative for the ADMIN role and is never converted into client-side permission;
- unauthorized responses clear local cookies without exposing membership details.

No menu item, route, component, cookie value, or client state establishes authorization.

## Approved Operational Summary Contract

The Admin Web may consume only the current normalized response:

```text
generatedAt
staleThresholdSeconds
devices.total
devices.byStatus
devices.staleHeartbeat
devices.neverReportedHeartbeat
capabilities.readable
capabilities.reportable
capabilities.writable
telemetry.latestObservedAt
commands.total
commands.byStatus
```

The UI must not invent health, readiness, MQTT publisher, per-device, per-command, or per-capability detail that is absent from this endpoint.

The initial information architecture is limited to:

- a generated-at and stale-threshold summary header;
- device total and status cards;
- stale and never-reported heartbeat indicators;
- readable, reportable, and writable capability counts;
- latest telemetry observation timestamp;
- command total and status cards.

Zero counts are valid data. The UI must not fabricate sample resources or drill-down lists.

## Approved Interface States

The implementation must provide bounded accessible states using the shared design system:

- loading while the same-origin route is pending;
- unauthenticated login state when no local session exists;
- unauthorized state for backend `401` or `403` without role or membership leakage;
- empty state when every normalized count is zero and no telemetry has been observed;
- stale indication derived only from server-provided timestamps and thresholds;
- offline state when the backend API cannot be reached;
- error state with a safe backend request ID when available.

A refresh action may repeat the read-only request. No action may publish a command or mutate backend state.

## Implemented Slice 10.10 File Boundary

The implementation adds or modifies only the bounded Admin Web surface and its focused contracts, including:

- `apps/admin-web/lib/backend.ts`;
- `apps/admin-web/lib/session.ts`;
- `apps/admin-web/lib/contracts.ts`;
- `apps/admin-web/lib/operational-summary-loader.ts`;
- `apps/admin-web/app/api/session/login/route.ts`;
- `apps/admin-web/app/api/session/logout/route.ts`;
- `apps/admin-web/app/api/operational-summary/route.ts`;
- focused Admin Web components, page composition, and styles;
- focused contract tests and synchronized documentation.

The implementation must not add a frontend state-management library, chart library, table library, authentication library, or runtime dependency unless separately approved.

## Security and Data-Minimization Boundary

The Admin Web must never access or expose:

- Prometheus text or metrics service tokens;
- direct MQTT, Redis, PostgreSQL, RTSP, ONVIF, or vendor API connections;
- raw MQTT topics or raw telemetry payloads;
- device, broker, camera, or vendor credentials;
- unrestricted tenant resource lists;
- command, provisioning, ownership, membership, credential, or dashboard mutation controls.

Browser-provided tenant IDs remain selectors only. The backend trusted tenant context remains authoritative.

## Accessibility and Localization

The default user-facing language is Indonesian. Text and component boundaries must remain ready for English localization.

The implementation must preserve:

- semantic headings and landmarks;
- keyboard navigation;
- visible focus;
- sufficient contrast;
- reduced-motion behavior;
- status and alert semantics;
- readable timestamps and numeric labels without relying on color alone.

## Observability Boundary

The browser may surface a safe backend request ID. It must not emit tenant IDs, credentials, raw payloads, or high-cardinality resource identifiers into telemetry labels.

No new backend metric is approved in this proposal. Existing backend and infrastructure observability remain authoritative.

## Slice 10.10 Validation Contract

The implementation runs at least:

- Admin Web TypeScript validation;
- Admin Web production build;
- focused ESLint and formatting checks;
- focused session, route-handler, contract, state, and security-boundary tests;
- all Module 10 contracts;
- lifecycle validation and simulation;
- exact path allowlist and CRLF-aware whitespace checks.

Database, MQTT, and recovery integration gates are not required when those boundaries remain unchanged. GitHub Actions at the exact implementation commit remains the final clean-environment gate.

## Proposal-Only Change Boundary

Historically, this Slice 10.9 checkpoint changed only lifecycle metadata, Module 10 sequencing documentation, the proposal document, repository memory, and contract tests. Runtime implementation belongs only to the separate Slice 10.10 checkpoint.

It does not change:

- `apps/admin-web` runtime source;
- backend application source;
- Prisma schema or migrations;
- dependencies or lockfiles;
- MQTT, Redis, metrics, or CI workflow;
- Module 11 state;
- production deployment approval.
