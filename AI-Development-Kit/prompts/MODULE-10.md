# MODULE 10 --- Dynamic Dashboard

Baca System Instructions, Repository Memory, standards, architecture,
dan source code aktual.

Kerjakan melalui exact bounded candidate dan official repository workflow: **Modul 10 --- Dynamic Dashboard**.

## Scope

Implement dashboard/layout/widget schema dan capability-driven card,
switch, gauge, chart, map, table, status.

## Agent Rules

- Jangan hanya menampilkan kode di chat.
- Susun perubahan sebagai exact-file payload; jangan edit branch main secara langsung.
- Gunakan struktur dan package manager aktual.
- Pertahankan modul yang sudah selesai.
- Lakukan minimum coherent change set.
- Tambahkan migration, tests, Swagger/contracts, env example, dan docs
  bila relevan.
- Jalankan hanya official validation profile sesuai urutan gate murah ke mahal.
- Review git diff dan git status.
- Perbarui `AI-Development-Kit/agent/REPOSITORY-MEMORY.md` hanya
  dengan fakta baru.
- Jangan commit atau push kecuali saya memerintahkan.
- Jangan mengerjakan Modul 11 atau modul lain.

Gunakan output contract System Instructions. Jika blocker nyata tidak
dapat diselesaikan setelah failure protocol, jangan berpura-pura
selesai.

<!-- MODULE-10-ACTIVATION-ARCHITECTURE:START -->

## Approved Activation Architecture

Module 10 is active under the architecture contract in
`docs/module-10-multiplatform-architecture.md`.

The approved product surfaces are:

- Admin Web: Next.js App Router with TypeScript.
- User Web: Next.js App Router with TypeScript.
- User Mobile: React Native with Expo development builds and TypeScript,
  delivered Android-first while preserving an iOS-ready codebase.
- Existing NestJS/Fastify backend: remains authoritative and stays at the
  repository root.

This activation checkpoint does not install frontend dependencies or create
application shells. Those changes require later bounded Module 10 slices.

Mandatory boundaries for every Module 10 slice:

- preserve authenticated tenant isolation and server-side authorization;
- remain capability-driven and vendor/protocol neutral;
- never connect web or mobile clients directly to MQTT;
- do not expose raw RTSP URLs, camera credentials, device credentials, or
  vendor secrets;
- do not invent an administrator role that is absent from the backend domain;
- include loading, empty, stale, unauthorized, offline, and error states;
- add observable, bounded, and testable contracts without high-cardinality
  tenant labels;
- preserve accessibility and Indonesian/English localization readiness;
- keep Module 11 inactive;
- keep production deployment NOT APPROVED.

CCTV, ONVIF, RTSP, vendor camera connectors, stream gateways, and complete
barcode onboarding remain future roadmap work. Module 10 may define extension
boundaries and future-compatible UI entry points, but it must not implement
camera protocol integrations or activate a device solely from a scanned code.

Follow the approved slice sequence in
`docs/module-10-multiplatform-architecture.md`.
<!-- MODULE-10-ACTIVATION-ARCHITECTURE:END -->

<!-- MODULE-10-DASHBOARD-DOMAIN-SCHEMA-PROPOSAL:START -->

## Approved Slice 10.1 Dashboard Domain and Schema Proposal

The binding proposal is `docs/module-10-dashboard-domain-schema-proposal.md`.

Required decisions for later slices:

- persist Dashboard, DashboardLayout, DashboardWidget, DashboardLayoutItem, and DashboardWidgetBinding as normalized PostgreSQL relations;
- enforce tenant-aware ownership and referential integrity;
- use schemaVersion and aggregate revision for compatibility and optimistic concurrency;
- keep JSON limited, bounded, and validated;
- validate capability read, report, and write compatibility server-side;
- reject credentials, raw stream URLs, arbitrary SQL, scripts, CSS, MQTT topics, and vendor secrets;
- keep TENANT_SHARED access disabled until an explicit authorization policy exists;
- begin Slice 10.2 only after the Slice 10.1 commit is green remotely;
- keep API, frontend, CCTV, barcode runtime, Module 11, and production approval out of Slice 10.2.

<!-- MODULE-10-DASHBOARD-DOMAIN-SCHEMA-PROPOSAL:END -->

<!-- MODULE-10-DASHBOARD-PERSISTENCE-FOUNDATION:START -->

## Approved Slice 10.2 Dashboard Persistence Foundation

The binding implementation record is `docs/module-10-dashboard-persistence-foundation.md`.

Required boundaries for later slices:

- use the normalized Prisma dashboard aggregate and committed migration;
- preserve composite tenant-aware foreign keys and restrictive external references;
- use DashboardRepository as the persistence boundary rather than raw controller-level Prisma access;
- require active membership, trusted tenant context, and expected revision for mutations;
- keep TENANT_SHARED access disabled until Slice 10.3 defines explicit authorization;
- map persistence errors into stable API errors without leaking cross-tenant existence;
- keep widget semantic resolution, telemetry execution, command execution, frontend workspaces, CCTV, barcode runtime, Module 11, and production approval outside Slice 10.2;
- begin Slice 10.3 only after the Slice 10.2 commit is green remotely.

<!-- MODULE-10-DASHBOARD-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-10-TENANT-ISOLATED-DASHBOARD-API:START -->

## Module 10 Slice 10.3 Tenant-Isolated Dashboard API

The binding implementation record is `docs/module-10-tenant-isolated-dashboard-api.md`. The API uses JWT plus active tenant context, derives `membershipId` server-side, restricts PERSONAL dashboards to their owner, permits tenant-wide reads of TENANT_SHARED dashboards, and requires the existing `ADMIN` role for shared create, replace, and delete. Optimistic revision, safe not-found behavior, stable domain errors, bounded DTOs, and response sanitization are mandatory. Widget resolution, telemetry execution, command execution, frontend workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-TENANT-ISOLATED-DASHBOARD-API:END -->

<!-- MODULE-10-CAPABILITY-DRIVEN-WIDGET-RESOLUTION:START -->

## Module 10 Slice 10.4 Capability-Driven Widget Resolution

The binding implementation record is `docs/module-10-capability-driven-widget-resolution.md`. DashboardWidgetResolver validates CARD, SWITCH, GAUGE, CHART, MAP, TABLE, and STATUS against tenant-scoped device and capability metadata before persistence and again through the authenticated resolution endpoint. Resolution returns bounded safe metadata and per-widget READY, INVALID, or UNSUPPORTED states. MAP remains fail-closed until a coordinate semantic contract is approved. Telemetry execution, command execution, frontend workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-CAPABILITY-DRIVEN-WIDGET-RESOLUTION:END -->

<!-- MODULE-10-TELEMETRY-WIDGET-QUERY-INTEGRATION:START -->

## Module 10 Slice 10.5 Telemetry Widget Query Integration

The binding implementation record is `docs/module-10-telemetry-widget-query-integration.md`. The authenticated per-widget data endpoint resolves the authorized dashboard first, executes at most the selected widget's persisted sixteen bindings, and reuses the existing tenant-scoped latest, cursor-bounded history, and bounded PostgreSQL aggregation services. Only bound values, bounded points or buckets, normalized device status, safe per-binding states, and bounded summaries are returned. Command publication, realtime delivery, frontend workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-TELEMETRY-WIDGET-QUERY-INTEGRATION:END -->

<!-- MODULE-10-WEB-WORKSPACE-DESIGN-SYSTEM-FOUNDATION:START -->

## Module 10 Slice 10.6 Web Workspace and Design-System Foundation

The binding implementation record is `docs/module-10-web-workspace-design-system-foundation.md`. The repository uses explicit npm workspaces for `apps/admin-web`, `apps/user-web`, and `packages/design-system`; both web shells use Next.js App Router with TypeScript while the backend remains authoritative at the repository root. The shared design system provides bounded semantic shell, surface, loading, empty, stale, unauthorized, offline, and error primitives with light/dark tokens, visible focus, reduced-motion, and localization readiness. Authentication integration, API consumption, command controls, realtime delivery, mobile workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-WEB-WORKSPACE-DESIGN-SYSTEM-FOUNDATION:END -->

<!-- MODULE-10-USER-WEB-DYNAMIC-DASHBOARD:START -->

## Completed Slice 10.7 User Web Dynamic Dashboard

The binding implementation contract is `docs/module-10-user-web-dynamic-dashboard.md`.
User Web must authenticate through a same-origin Next.js server boundary, keep
session material out of browser storage, preserve server-authoritative tenant
isolation, and consume only the existing bounded dashboard, widget-resolution,
and telemetry-query APIs. The initial renderer remains read-only: CARD, GAUGE,
CHART, TABLE, and STATUS are supported; SWITCH remains command-deferred and MAP
remains fail-closed. Realtime delivery, command publication, Admin Web operations,
mobile, CCTV, barcode runtime, Module 11, and production deployment approval remain
outside Slice 10.7.

The final Slice 10.7 completion checkpoint is commit `717ea9f`, confirmed green by
GitHub Actions run `29694607680`.
<!-- MODULE-10-USER-WEB-DYNAMIC-DASHBOARD:END -->

<!-- MODULE-10-ADMIN-WEB-OPERATIONAL-DASHBOARD:START -->

## Remote-Green Slice 10.8 Backend Operational Summary Foundation

The binding implementation record is
`docs/module-10-admin-web-operational-dashboard.md`. The backend exposes one bounded
read-only `GET /admin/operational-summary` endpoint guarded in order by JWT, trusted
tenant context, and the existing `ADMIN` membership role. The service derives every
query from the trusted tenant ID and returns only normalized device, capability,
telemetry timestamp, and command-status aggregates. Implementation commit `4097356` and HTTP/PostgreSQL tenant-isolation audit-fix commit `53ec5c1` are confirmed green in GitHub Actions run `29716215821`.

Prometheus service-token access, raw telemetry payloads, MQTT topics, infrastructure
secrets, command execution, provisioning, ownership mutation, credential controls,
Admin Web UI, realtime delivery, mobile, CCTV, barcode runtime, Module 11, and
production deployment approval remain outside Slice 10.8.
<!-- MODULE-10-ADMIN-WEB-OPERATIONAL-DASHBOARD:END -->

<!-- MODULE-10-ADMIN-WEB-UI-PROPOSAL:START -->

## Remote-Green Slice 10.9 Admin Web Operational Dashboard UI Proposal

The binding proposal is
`docs/module-10-admin-web-operational-dashboard-ui-proposal.md`.

This completed proposal-only checkpoint approves a same-origin Next.js server session
boundary, Admin-specific HttpOnly cookies, one read-only proxy route for
`GET /admin/operational-summary`, exact normalized summary fields, accessible bounded
states, Indonesian-first localization readiness, and strict infrastructure and mutation
exclusions. It is green remotely at `658f020` / run `29725053250`.

Slice 10.10 implements this proposal through the separate foundation record. Mobile
foundation remains Slice 10.11. Module 11 and production deployment remain unapproved.

<!-- MODULE-10-ADMIN-WEB-UI-PROPOSAL:END -->

<!-- MODULE-10-EXECUTION-FRAMEWORK-PREREQUISITE:START -->

## Slice 10.10 Development-Tooling Prerequisite

The binding execution contract is
`docs/development/module-execution-framework.md`. Module Execution Kit v1.0.3 is
completed and green remotely at `935c30e` / GitHub Actions run `29741100028`. The
integrated Slice 10.10 delivery upgrades the development-only runner to v1.1 before
proof: automatic short work roots, projected Windows path-budget enforcement, streamed
native progress and heartbeats, process-tree timeout cleanup, thirty-minute dependency
bootstrap, safe ZIP execution, and webpack-based local Admin build proof. Each Slice
10.10 change is still proved from an exact manifest and content-addressed payload in a
disposable Git worktree. The exact proved commit may move into `main` only by
fast-forward. The runner creates local evidence and stops without push.

This prerequisite does not alter backend authorization, tenant isolation, runtime
dependencies, Prisma, MQTT, Redis, metrics, Module 11, or production deployment
approval.

<!-- MODULE-10-EXECUTION-FRAMEWORK-PREREQUISITE:END -->

<!-- MODULE-10-ADMIN-WEB-UI-FOUNDATION:START -->

## Remote-Green Slice 10.10 Admin Web Operational Dashboard UI Foundation

The binding implementation record is
`docs/module-10-admin-web-operational-dashboard-ui-foundation.md`. Exact commit
`f4195f814b5c83c5aa21409f284c73a08be64108` is confirmed green in GitHub Actions
run `29766694450`. The Admin Web uses a same-origin server boundary, Admin-specific
HttpOnly cookies, fail-closed response validation, and read-only accessible
operational-summary states. The repository-local execution framework is proven on
Windows and in exact-SHA CI with no automatic push.

Slice 10.11 mobile work remains inactive until this documentation closure is green
remotely and the owner explicitly approves the next bounded slice. Command execution,
provisioning, resource drill-down, realtime delivery, CCTV, barcode runtime, Module 11,
and production deployment approval remain deferred.

<!-- MODULE-10-ADMIN-WEB-UI-FOUNDATION:END -->

<!-- MODULE-10-ADMIN-WEB-UI-FOUNDATION:START -->

## Active Slice 10.10 Admin Web Operational Dashboard UI Foundation

The binding implementation record is
`docs/module-10-admin-web-operational-dashboard-ui-foundation.md`. The slice adds
Admin-specific same-origin login, logout, and operational-summary route handlers;
HttpOnly session cookies; one serialized refresh attempt; strict runtime validation of
token pairs and aggregate consistency; and Indonesian loading, login, unauthorized,
offline, error, empty, stale, and ready states.

The backend remains authoritative for authentication, trusted tenant context, and the
existing `ADMIN` role. No command, provisioning, resource drill-down, realtime, direct
infrastructure access, dependency change, Module 11 activation, or production
deployment approval is introduced.

<!-- MODULE-10-ADMIN-WEB-UI-FOUNDATION:END -->

<!-- MODULE-10-MOBILE-FOUNDATION-CONTRACT:START -->

## Completed Slice 10.11 Mobile Foundation and Dynamic Dashboard Contract

The binding contract is `docs/module-10-mobile-foundation-dynamic-dashboard.md`. Exact commit `2ef81f55cac2396395986bd0db19f555f97381a5` is confirmed green in GitHub Actions run `29807634502`, with release artifact `8486153827` and SHA-256 `8c997ce3f0ccfcf8bf993892a7c7b8f3ade0685a587add87206f031add6e058f`.

The contract preserves secure storage, validated API-origin handling, backend-authoritative tenant isolation, serialized refresh, and bounded read-only dashboard rules for later checkpoints.

<!-- MODULE-10-MOBILE-FOUNDATION-CONTRACT:END -->

<!-- MODULE-10-MOBILE-WORKSPACE-FOUNDATION:START -->

## Completed Slice 10.11 Mobile Workspace Foundation

The binding implementation record is `docs/module-10-mobile-workspace-foundation.md` and the governing contract remains `docs/module-10-mobile-foundation-dynamic-dashboard.md`.

Implementation commit `24eda56fc5b384a80a2b1c736021d9f9b76fb62e` plus portability audit-fix commit `d946c741aa488178f692b5c6b9bcf66ab5ab70f2` are confirmed green in GitHub Actions run `29819923410`. Release artifact `8490998211` was uploaded with SHA-256 `e40baa357f499635011b87155f1f2fba558cd2659310825f6d36e1e020910713`.

The isolated Expo SDK 57 workspace, validated HTTPS-or-loopback public API origin, development-client scripts, and accessible Indonesian-first static shell are complete. The shell remains disconnected from authentication and dashboard data.

<!-- MODULE-10-MOBILE-WORKSPACE-FOUNDATION:END -->

<!-- MODULE-10-MOBILE-SECURE-SESSION-FOUNDATION:START -->

## Completed Slice 10.11 Mobile Secure Session Foundation

The binding implementation record is `docs/module-10-mobile-secure-session-foundation.md`. This checkpoint adds only the Expo SecureStore adapter, one versioned atomic session record, validated login and token parsing, same-origin authenticated requests, one serialized refresh, safe error normalization, and logout cleanup.

The visible mobile shell remains disconnected. Do not add login UI, routing, dashboard data, widget rendering, commands, realtime, notifications, barcode, CCTV, generated native projects, EAS distribution, Module 11, or production deployment in this checkpoint.

<!-- MODULE-10-MOBILE-SECURE-SESSION-FOUNDATION:END -->

<!-- MODULE-10-MOBILE-LOGIN-UI-FOUNDATION:START -->

## Completed Slice 10.11 Mobile Login UI Foundation

The binding implementation record is `docs/module-10-mobile-login-ui-foundation.md`. Mobile Secure Session Foundation commit `0cb1cef15dc824081929baa127faca21b570cd7e` is confirmed green in GitHub Actions run `29824946401`; release artifact `8492983648` was uploaded with SHA-256 `e1a0a3e8891298d4923d88af6606ab16f50ed87b72656ec15ba6ae3ef9c1773e`.

This checkpoint connects only an Indonesian-first login form, secure-session restoration, an authenticated tenant shell, bounded error states, and logout to the existing secure-session client. It adds no dependency and does not consume profile, dashboard, device, telemetry, command, realtime, barcode, CCTV, or infrastructure APIs.

The login UI checkpoint is completed and green remotely at `9880a3e098ab98cf217dd45e7f87ff67714ccce8`. The separately approved read-only dashboard checkpoint may compose around the authenticated shell; commands, realtime delivery, notifications, barcode, CCTV, Module 11, and production deployment remain gated.

<!-- MODULE-10-MOBILE-LOGIN-UI-FOUNDATION:END -->

<!-- MODULE-10-MOBILE-READ-ONLY-DASHBOARD-INTEGRATION:START -->

## Active Slice 10.11 Mobile Read-Only Dashboard Integration

The binding implementation record is `docs/module-10-mobile-read-only-dashboard-integration.md`. Mobile Login UI Foundation commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8` is confirmed green in GitHub Actions run `29831494195`; release artifact `8495556056` was uploaded with SHA-256 `cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1`.

This checkpoint connects only tenant-authorized dashboard listing, selected aggregate and resolution reads, bounded read-only per-widget telemetry queries, accessible dashboard selection, refresh, and read-only widget rendering through the existing secure-session client. It adds no dependency and changes no backend, schema, database, MQTT, Redis, or CI workflow.

Dashboard mutation, command behavior, realtime delivery, notifications, barcode, CCTV, routing frameworks, Module 11, and production deployment remain separately gated.

<!-- MODULE-10-MOBILE-READ-ONLY-DASHBOARD-INTEGRATION:END -->

<!-- MODULE-10-BARCODE-CCTV-UI-COMPATIBILITY-CONTRACT:START -->

## Module 10 Slice 10.12 - Barcode and CCTV UI Compatibility Contract

The binding record is `docs/module-10-barcode-cctv-ui-compatibility-contract.md`. This owner-approved checkpoint defines only fail-closed client compatibility boundaries for future QR or barcode onboarding and normalized CCTV metadata or stream-availability presentation.

QR or barcode input remains an untrusted onboarding mechanism rather than a device protocol. ONVIF, RTSP, vendor connectors, identity resolution, tenant authorization, credential handling, and stream decisions remain behind future backend adapter boundaries. Clients must not receive raw RTSP URLs, camera credentials, vendor tokens, MQTT topics, or unrestricted infrastructure payloads.

This checkpoint changes documentation, lifecycle metadata, and one contract test only. It adds no scanner, pairing, camera discovery, playback, PTZ, notification, dependency, lockfile, application runtime, backend API, Prisma schema, migration, PostgreSQL, Redis, MQTT, native project, CI workflow, Module 11 activation, or production deployment approval.

<!-- MODULE-10-BARCODE-CCTV-UI-COMPATIBILITY-CONTRACT:END -->

<!-- MODULE-10-SLICE-10.13-REVIEW-CLOSURE:START -->

## Module 10 Slice 10.13 Review Closure

The binding review record is `docs/module-10-security-observability-accessibility-e2e-review.md`. Lifecycle-selection commit `259a6ed8348fe269a1de7ea42781b2e981086dc7` is confirmed remote-green in GitHub Actions run `30541648080` with 107/107 Jest suites and 755/755 tests.

The owner-approved read-only review found no repository-level runtime blocker across the established security, observability, accessibility, and layered integration/end-to-end boundaries. The review explicitly retains the absence of automated browser and native-device user-journey coverage and does not claim formal security certification, WCAG conformance, or deployment readiness.

This checkpoint adds documentation, lifecycle metadata, and one contract test only. It does not change application runtime behavior, dependencies, lockfiles, schema, migrations, PostgreSQL, Redis, MQTT, CI, security or tenant boundaries, barcode/CCTV runtime, or deployment configuration.

Slice 10.14 remains inactive. Module 11 remains inactive, and production deployment remains NOT APPROVED pending separate approvals.

<!-- MODULE-10-SLICE-10.13-REVIEW-CLOSURE:END -->

<!-- MODULE-10-COMPLETION-REVIEW-CLOSURE:START -->

## Module 10 Completion Review Closure

The binding immutable review record is `docs/module-10-completion-review.md`.

The owner-approved read-only review found no repository-level blocker at exact remote-green base `ead0692b516f6795455ad53c23a13c17f7185bbe`, confirmed by GitHub Actions run `30602246816`. The systemic historical-contract transition matrix proved this closure and the later completion and activation projections without freezing mutable lifecycle summaries.

This closure changes documentation, current lifecycle metadata, repository-tree inventory, contract classification, and one historical evidence contract only. It adds no runtime behavior, dependency, lockfile, schema, migration, PostgreSQL, Redis, MQTT, CI workflow, barcode/CCTV runtime, generated native project, Module 11 activation, or production deployment approval.

Module 10 remains active at Slice 10.14. A later `module:complete 10` transition requires separate owner approval after this closure is committed, pushed separately after approval, and confirmed remote-green at the exact pushed SHA.

<!-- MODULE-10-COMPLETION-REVIEW-CLOSURE:END -->
