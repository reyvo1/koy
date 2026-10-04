# Module 10 Slice 10.10 Admin Web Operational Dashboard UI Foundation

## Decision Status

Slice 10.10 is completed and green remotely at exact commit `f4195f814b5c83c5aa21409f284c73a08be64108` in GitHub Actions run `29766694450`, after the remote-green Slice 10.9 proposal checkpoint at `658f020` / run `29725053250` and Module Execution Kit v1.0.3 checkpoint at `935c30e` / run `29741100028`.

This slice implements only the approved read-only Admin Web operational-summary experience. The backend remains authoritative, the normalized `GET /admin/operational-summary` contract is unchanged, and no write operation, command execution, provisioning flow, realtime transport, infrastructure credential, Module 11 activation, or production deployment approval is introduced.

## Implemented Runtime Boundary

The Admin Web adds an isolated same-origin server boundary under `apps/admin-web`:

- `POST /api/session/login` forwards bounded credentials to backend `POST /auth/login`;
- `POST /api/session/logout` attempts backend logout and always clears local cookies;
- `GET /api/admin/operational-summary` calls backend `GET /admin/operational-summary`;
- `apps/admin-web/lib/backend.ts` permits HTTPS, with plain HTTP allowed only for loopback development hosts;
- `apps/admin-web/lib/session.ts` uses the Admin-specific `iot_admin_access`, `iot_admin_refresh`, and `iot_admin_tenant` cookie namespace;
- access, refresh, and tenant cookies are `HttpOnly`, `SameSite=Lax`, path-scoped, and `Secure` in production;
- the server adapter attaches `Authorization: Bearer ...` and `X-Tenant-Id` only on the server;
- concurrent unauthorized requests share one refresh-token rotation through a single-flight promise;
- backend `401` and `403` responses become one non-leaking unauthorized browser state and clear local cookies.

No browser code can read session cookies or establish tenant or ADMIN authorization.

## Bounded Response Validation

`apps/admin-web/lib/operational-summary-loader.ts` accepts only the approved normalized response:

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

The loader validates object shape, required status counts, safe non-negative integer counts, device and command total consistency, bounded heartbeat counts, bounded stale threshold, and parseable timestamps. It returns a newly constructed safe object and drops unapproved extra fields. Malformed success payloads fail closed as a bounded backend-response error. Login and refresh success payloads also require non-empty bounded access and refresh token strings before any cookie is written.

## User Interface

The Admin Web page now renders an Indonesian-first read-only experience using the shared design system:

- loading state while the same-origin route is pending;
- login state when the Admin-specific session is absent;
- one unauthorized state for missing, expired, inactive, or non-ADMIN access without role or membership leakage;
- offline and bounded error states with a safe request ID when available;
- empty state when all normalized counts are zero and no telemetry has been observed;
- stale notice derived only from backend `generatedAt`, `staleThresholdSeconds`, heartbeat counts, and latest telemetry timestamp;
- device status, heartbeat, capability, telemetry timestamp, and command status summary cards;
- read-only refresh and logout controls.

Zero values remain valid data. The UI does not fabricate resource lists, charts, health scores, or sample data.

## Security and Architecture Boundary

This implementation does not add or expose:

- direct MQTT, Redis, PostgreSQL, metrics, RTSP, ONVIF, or vendor API access;
- Prometheus text or metrics service tokens;
- raw telemetry payloads or MQTT topics;
- device, broker, camera, vendor, or infrastructure credentials;
- device IDs, capability IDs, command IDs, or unrestricted resource drill-down;
- command publication, provisioning, ownership, membership, credential, or dashboard mutations;
- SSE, WebSocket, or other realtime delivery;
- new frontend dependencies, state-management libraries, chart libraries, or authentication libraries.

The existing backend guard order remains `JwtAuthGuard` → `TenantContextGuard` → `AdminRoleGuard`. Browser-provided tenant IDs remain selectors only.

## Validation Contract

The slice is validated through:

- Admin Web TypeScript validation;
- Admin Web production build;
- focused ESLint and Prettier checks;
- runtime tests for single-flight refresh-token rotation;
- route-handler tests for bounded login input, validated token success, operational-summary success, unauthorized, offline, and safe request-ID behavior;
- response-loader tests for shape validation, empty state, and stale-state derivation;
- focused security and UI contract coverage;
- all repository contract suites;
- all Module 10 suites;
- lifecycle validation and simulation through Module 30;
- exact path allowlist and CRLF-aware whitespace checks.

Database, MQTT, recovery, and backend integration gates are not rerun locally because those boundaries are unchanged. GitHub Actions at the exact implementation commit remains the final clean-environment gate.

The integrated acceptance profile starts from exact remote-green base `935c30e`, verifies all exact payload hashes and line endings before dependency installation, uses an automatically selected short Windows work root, runs a thirty-minute clean dependency bootstrap with streamed progress, generates Prisma Client, runs the runner self-test, checks all web workspaces, performs the local Admin Web production proof through webpack, runs non-mutating lint, repository contracts, all Module 10 suites, lifecycle validation, and lifecycle simulation through Module 30, then creates one exact proven commit and stops without push. Exact-SHA GitHub Actions retains the repository-default build plus full Jest, PostgreSQL, MQTT, recovery, and release gates.

## Execution Reliability Closure

Early Slice 10.10 package attempts were rejected safely before repository mutation:

- v1.0.0 carried nine CRLF payload files where the repository policy required LF;
- v1.0.1 reached the Admin build but Turbopack generated a Windows source-map path beyond the filesystem-safe budget;
- a manual rerun exposed a package-location assumption;
- the next verified run reached `npm ci` but the old generic ten-minute timeout terminated it after 600 seconds.

The final one-package delivery closes those defects in the repository-local runner instead of adding more operator scripts. It does not weaken exact-file verification, reuse the main worktree dependencies, skip validation, or enable automatic push.

## Deferred Work

Still deferred:

- Admin write operations and command execution;
- provisioning and ownership or credential management;
- per-device, per-capability, or per-command drill-down;
- realtime operational delivery;
- mobile workspaces;
- CCTV, ONVIF, RTSP, media sessions, and barcode onboarding;
- Module 11;
- production deployment approval.

## One-Pack v1.0.2 Windows contract-timeout closure

The v1.0.1 Windows acceptance run proved package integrity, both runner self-tests,
clean dependency installation, Prisma generation, Web type-check, Admin Web webpack
build, lint, repository contracts, and all Module 10 tests. During the later full
Jest pass, the same real runner self-test was launched again by the framework
contract with a fixed 120-second `spawnSync` timeout. Windows load caused that
duplicate child process to cross the limit, so Node returned `status: null` even
though the self-test had already passed twice and the contracts-only run had passed.

v1.0.2 aligns that child-process timeout with the existing 300-second
pre-dependency self-test budget and emits explicit timeout diagnostics. No Admin
Web behavior, backend boundary, dependency, database, messaging, tenant isolation,
Module 11 state, or deployment approval changes.

## Closure CI audit-fix

The first documentation-closure commit `2df924d4bf2db8eaebafd2406b075fe4d83e4328`
was checked out by CI run `29801672061`. Runtime build, type-check, lint, dependency
bootstrap, Prisma migration, and 668 of 670 Jest tests passed. The two failures were
stale documentation contract assertions:

- the Slice 10.8 contract still required the superseded heading
  `## Current Slice 10.10 Implementation Boundary`;
- the Slice 10.9 proposal contract still required the historical phrase
  `Slice 10.10 is active`.

A complete audit of both failed cases also found three assertions hidden behind the
first Slice 10.8 failure that still treated the earlier 87-suite / 635-test backend
checkpoint and artifact `8450706871` as the current repository state.

The source-of-truth documentation correctly records Slice 10.10 as completed and
remote-green. This audit-fix updates only those stale contract assertions to require
the current remote-green heading, 94-suite / 670-test result, artifact `8471149165`,
and exact implementation evidence. It does not change product runtime, architecture,
dependencies, database, messaging, Module 11 state, or production deployment
approval.

## Remote-Green Evidence

GitHub Actions run `29766694450` checked out exact commit
`f4195f814b5c83c5aa21409f284c73a08be64108` and completed the repository workflow:

- full Jest: 94 suites / 670 tests;
- repository contracts: 36 suites / 299 tests;
- Module 10: 16 suites / 90 tests;
- E2E smoke: 1 suite / 4 tests;
- PostgreSQL integration: 5 suites / 18 tests;
- MQTT workflow: 1 suite / 3 tests;
- MQTT production publisher TLS: 1 suite / 1 test;
- recovery drill: 15 applied migrations with verified data;
- coverage: 69.43% statements, 62.39% branches, 70.97% functions, and 69.20% lines;
- production release build and verification: 317 manifest entries;
- production artifact startup smoke: liveness 200 with honest unavailable-MQTT readiness.

Release artifact ID `8471149165` is named
`iot-platform-f4195f814b5c83c5aa21409f284c73a08be64108`, has size 378372 bytes,
and SHA-256 `b2ee7043b79a8e7cadd8e10a56c8e33afdc6c2a3b1dc67478a79013424758883`.

The controlled dependency-audit findings remain 1 critical, 8 high, and 10 moderate,
with `@fastify/middie` retained under the existing time-bounded policy. GitHub-hosted
actions targeting Node.js 20 were executed by the platform on Node.js 24. Neither
warning changes the production deployment boundary.

Slice 10.10 is therefore remote-complete. Slice 10.11 remains inactive until the
closure commit is green remotely and the owner explicitly approves the next bounded
product slice. Module 11 remains inactive and production deployment remains NOT
APPROVED.

## Current deep-audit correction — 2026-10-04

The original Slice 10.10 text above records the historical foundation behavior, where backend 401 and 403 were intentionally collapsed into one browser unauthorized state. That behavior is **superseded** by the current product security contract: 401 and 403 are distinct facts. A final 401 invalidates the local session; 403 preserves it and reports authorization refusal. Successful refresh-token rotation must be persisted to the Admin Web HttpOnly cookies on the response that used the rotated credentials. Shared and direct BFF routes are contract-tested against this rule, and upstream failures must not be rewritten as successful empty data.
