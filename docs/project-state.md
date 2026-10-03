# Active enterprise state — 2026-10-03

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->

Authoritative execution is `docs/ENTERPRISE-WAVE-ROADMAP.md`. The 30 modules are foundation-complete; enterprise certification is still being closed. Waves 1–12 have **software scope CLOSED / GREEN** under their actual evidence tiers. Wave 13 Final Enterprise Certification is **IN PROGRESS**. Missing ESP32/camera lab hardware is non-blocking: production-shaped `SIMULATED_HARDWARE_LIVE_SERVICE` evidence must cover software-controlled behavior and remain explicitly distinct from later PHYSICAL/HIL field validation. Provider-owned external behavior stays separately gated. Historical module-current statements below are chronology only.

---

# IoT Platform - Project State

> **Current-work notice (2026-09-11):** `CURRENT-STATE.md` is the operational source of truth for new work. Module/Slice activation statements below are historical evidence and do not override the Rescue workflow.

<!-- MODULE-LIFECYCLE:START -->
## Current Module Lifecycle

- Lifecycle state: complete
- Active module: None
- Last completed module: Module 30
- Next module: None
- Active slice: Module 30 - ESP32 Device SDK & Provisioning Completion Review
- Evidence: docs/module-30-completion-review.md: SDK contract header + spec green; Jest 150 suites / 1030 tests; ROADMAP COMPLETE - all 30 modules have foundations with closures and green gates
- Updated on: 2026-08-23
- Production deployment: NOT APPROVED; environment-specific approval remains separate.

Historical status statements elsewhere in this document record earlier checkpoints and do not override this managed block.
<!-- MODULE-LIFECYCLE:END -->

## Product Direction

The project is a modern, secure, vendor-neutral IoT and smart home platform.

The long-term product should provide one unified application for:

- Security cameras and CCTV
- Sensors
- Smart switches
- Smart lights
- Smart plugs
- Future connected devices

The primary future user experience is room-centric, modern, clean, and premium.

The complete product vision is documented in `docs/product-vision.md`.

## Current Development Phase

Module 11 - Automation Engine is active at `Module 11 Slice 11.10 - Automation Retry Safety Foundation Selection`.

Slice 11.9 is closed remote-green at `7de76596c6c1d52bd725406f3fad381cc62aedaf` from CI run `30983551478`. Slice 11.10 is selected only; retry is not implemented or runtime-active. Coordinator and dispatcher remain internal and runtime-inactive. Module 10 remains completed. Module 12 - Scene remains inactive.

## Current Milestone

Select and validate the Slice 11.10 retry safety contract without implementation, worker, scheduler, queue, or runtime wiring.

The selected boundary requires persisted attempt authority, the existing action command idempotency key, at most three total dispatch attempts, explicit transient-error allowlisting, deterministic bounded backoff, and fail-closed behavior. Automation defaults disabled. No retry runtime, telemetry hook, activation surface, Module 12 activation, or production deployment is approved.

Native iOS build and physical-device proof are deferred by `docs/ios-final-release-proof-policy.md` until the final release gate after Module 30. Shared Expo and React Native compatibility remains mandatory during current modules.

## Current Status

Production Readiness Review result: **NOT READY FOR PRODUCTION DEPLOYMENT**.

Production Readiness Completion Review: **LOCAL GATES PASSED — REMOTE CI CONFIRMED — EXPLICIT DEPLOYMENT APPROVAL PENDING**.

Module 11 Slice 11.1: **CLOSED — REMOTE CI CONFIRMED AT `af9a9978b8a9ae56c040f00178c992c65c109aa5` / RUN `83397563006`**.

Module 11 Slice 11.2: **CLOSED — REMOTE CI CONFIRMED AT `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / RUN `83411702069`**.

Module 11 Slice 11.3: **CLOSED — REMOTE CI CONFIRMED AT `ef37d0860c90c168b5ba357ccb5d0f255b0be54c` / RUN `30798541836`**.

Module 11 Slice 11.4: **CLOSED — REMOTE CI CONFIRMED AT `c12da413561ed6ba39f0725d2af3c083a2aa396c` / RUN `30808609333`**.

Module 11 Slice 11.5: **CLOSED — REMOTE CI CONFIRMED AT CLOSURE `3dc303c270ff8641d1df78ed511b101bb6ddda9c` / RUN `30822543569`**.

Module 11 Slice 11.6: **CLOSED — REMOTE CI CONFIRMED AT CLOSURE `4fcdaf1eec4f9e5b6899459baa326c409e7fcf53` / RUN `30880293865`**.

Module 11 Slice 11.7: **CLOSED — REMOTE CI CONFIRMED AT CLOSURE `035bdc5106b6ae58f9c5d84c742f419d45301d2b` / RUN `30913013664`**.

Module 11 Slice 11.8: **CLOSED — REMOTE CI CONFIRMED AT CLOSURE `89c75d62c25290b20c635490d9e5faf617d429ac` / RUN `30968372456`; RUNTIME INACTIVE**.

Module 11 Slice 11.9: **CLOSED — REMOTE CI CONFIRMED AT `7de76596c6c1d52bd725406f3fad381cc62aedaf` / RUN `30983551478`; COORDINATOR RUNTIME INACTIVE**.

Module 11 Slice 11.10: **SELECTED — RETRY NOT IMPLEMENTED — RUNTIME INACTIVE — AUTOMATION DEFAULT DISABLED**.

Validated foundations remain passing:

- Prisma schema and committed migrations
- Application build
- Unit and contract tests
- Fastify E2E smoke test
- PostgreSQL integration test
- MQTT workflow integration test
- Test coverage execution
- Remote CI for the preceding Integration and End-to-End Testing completion checkpoint

Production readiness finding status:

- PR-001: Resolved by MQTT Production Transport Architecture Proposal and Implementation
- PR-002: Resolved by Production Configuration and Process Lifecycle Foundation
- PR-003: Resolved by Production Security Boundary Hardening
- PR-004: Resolved by Deployment and Recovery Foundation
- PR-005: Resolved by Deployment and Recovery Foundation
- PR-006: Controlled by Deployment and Recovery Foundation; time-bounded dependency acceptance remains tracked
- Local completion-review gates: Passed
- Remote CI confirmation: Confirmed green for commit `f8fac48`
- Explicit production deployment approval: Pending

The evidence, severity, and ordered remediation plan are documented in `docs/production-readiness.md`.

## Implemented Platform Foundations

- NestJS application foundation
- TypeScript
- Fastify
- Prisma ORM
- PostgreSQL
- Redis integration
- Authentication
- Tenant isolation
- User and tenant context handling
- Device management
- Device status handling
- Device capability model
- Capability value validation
- MQTT webhook integration
- MQTT device authentication
- MQTT authorization
- MQTT acknowledgement handling
- Telemetry ingestion
- Telemetry capability validation
- Telemetry payload validation
- Telemetry eventId idempotency
- Tenant-isolated latest telemetry query
- Tenant-isolated bounded telemetry history query
- Approved telemetry storage strategy baseline
- Command lifecycle
- Command idempotency
- Command acknowledgement handling
- Command timeout scheduler
- Prisma migrations
- Automated unit testing
- GitHub Actions CI
- Validated production host and port binding
- Production-safe Swagger configuration policy
- Production placeholder-secret rejection
- NestJS shutdown-hook bootstrap
- Prisma application shutdown cleanup
- Bounded and idempotent Redis shutdown cleanup
- Exact production HTTPS CORS allowlist
- Loopback-only trusted proxy policy
- Explicit 256 KiB request-body limit and 30-second request receive timeout
- Redis-backed fail-closed rate limits for sensitive authentication routes
- Bearer-token access boundary for `/metrics`
- Centralized structured logging configuration
- Request ID generation and propagation
- Sensitive log-field redaction
- Environment-aware log levels
- Normalized command, scheduler, MQTT, and telemetry events
- Consistent structured error serialization
- Payload-safe domain logging
- Backward-compatible application liveness endpoint
- Explicit liveness and readiness endpoints
- PostgreSQL and Redis dependency readiness checks
- Honest MQTT transport readiness status
- Isolated dependency timeouts and stable health reason codes
- Prometheus-compatible operational metrics endpoint
- Bounded HTTP request count and duration metrics
- Telemetry ingestion outcome counters
- Device command lifecycle counters
- Readiness count and duration metrics
- Low-cardinality and payload-safe metrics labels
- Automated observability endpoint, readiness, metric naming, and cardinality contract review
- Global HTTP exception filter
- Standard API error envelope
- Stable status-based error codes
- Request ID propagation in error responses
- Normalized validation error details
- Internal exception detail masking
- Automated error contract tests
- Stable domain-specific error code catalog
- Domain HTTP exception subclasses that preserve NestJS status semantics
- Normalized auth, tenant, device, capability, telemetry, command, and MQTT boundary errors
- Automated domain error-code contract tests
- Automated error-handling completion contract review
- Shared production and E2E application configuration
- Fastify-native E2E application bootstrap helper
- Hermetic application bootstrap smoke test
- Per-run PostgreSQL, Redis, and MQTT resource namespaces
- Documented deterministic integration-test cleanup contract
- Automated testing-strategy contract review
- CI E2E smoke gate
- Run-owned PostgreSQL schema lifecycle
- Committed Prisma migration deployment for integration tests
- Prisma persistence and transaction rollback integration proof
- CI database integration gate
- Runner-owned loopback MQTT broker lifecycle
- Run-owned MQTT topic namespace and non-retained round-trip proof
- Broker-to-webhook telemetry persistence proof
- Broker-to-webhook command acknowledgement proof
- Deterministic MQTT client, broker, application, Prisma, and schema cleanup
- CI MQTT workflow integration gate
- Automated Integration and End-to-End Testing completion contract review
- Native VPS systemd and Nginx deployment contract
- Non-root runtime identity and restrictive environment-file ownership
- Manifest-verified production release artifact
- Atomic release activation and liveness-verified application rollback
- Daily encrypted PostgreSQL backup timer and bounded retention
- Guarded PostgreSQL restore procedure and isolated automated recovery drill
- Non-mutating lint and production dependency review policy
- Production artifact startup smoke and CI artifact upload
- Production MQTT 5 publisher over verified TLS
- QoS 1 non-retained broker-confirmed command publication
- Real MQTT publisher readiness, bounded reconnect, and graceful shutdown
- Loopback verified-TLS MQTT 5 integration proof without Docker

## Core Architecture Direction

The platform core must remain:

- Vendor-neutral
- Protocol-neutral
- Capability-driven
- Tenant-isolated
- Testable
- Observable
- Extensible

Device and vendor-specific complexity should eventually be isolated behind adapters and connectors.

The normalized platform domain is based around devices, capabilities, telemetry, and commands.

## CCTV and Camera Direction

Security cameras are a planned major device category.

The future platform should support a unified camera experience across supported brands.

Planned camera integration paths may include:

- ONVIF
- RTSP
- Vendor APIs
- Vendor cloud connectors
- Future camera adapters

Camera onboarding should eventually support consumer-friendly guided pairing.

QR code or barcode scanning is a preferred onboarding pattern when supported by the device integration.

The future camera experience may include:

- Camera grid
- Live camera view
- Online and offline status
- Room or location context
- Camera identity
- Device health information

CCTV implementation is not the current engineering phase.

## Current Reliability Work

Telemetry latest-state reads are exposed through an authenticated, tenant-context-guarded device endpoint. The service verifies device ownership inside the trusted tenant before querying telemetry and returns `null` when an authorized device has no telemetry.

The approved telemetry storage baseline keeps PostgreSQL 16 and the current non-partitioned table. Automatic telemetry row deletion and persisted rollups remain disabled; backup retention is a separate recovery policy. The detailed decision is recorded in `docs/telemetry-storage-strategy.md`.

Telemetry ingestion uses eventId-based duplicate protection.

Application-level duplicate detection is backed by a database unique constraint.

Telemetry ingestion now handles Prisma P2002 unique constraint errors caused by concurrent duplicate event creation.

When a duplicate race occurs, the service reloads and returns the existing telemetry event.

This preserves idempotent telemetry processing under concurrent delivery.

The automated test suite includes explicit coverage for telemetry duplicate race-condition handling.

## Current Reliability Workstream

Documentation synchronization, Structured Logging, Observability, Error Handling Consistency, and Integration and End-to-End Testing are completed.

Completed Structured Logging slices:

1. Logging Foundation
2. Domain Event Normalization
3. Completion Review

Completed Observability slices:

1. Health and Readiness Foundation
2. Basic Operational Metrics
3. Completion Review

Completed Error Handling slices:

1. Error Contract Foundation
2. Domain Error Code Normalization
3. Completion Review

The active workstream is Production Readiness.

Completed Integration and End-to-End Testing slices:

1. Testing Strategy Foundation
2. Database Integration Test Foundation
3. MQTT Workflow Integration Test Foundation
4. Completion Review

Completed Production Readiness slices:

1. Review
2. Production Configuration and Process Lifecycle Foundation
3. Production Security Boundary Hardening
4. Deployment and Recovery Foundation
5. MQTT Production Transport Architecture Proposal
6. MQTT Production Transport Implementation
7. Production Readiness Completion Review — local gates passed

Active slice checkpoint:

1. Module 10 Slice 10.11 - Mobile Workspace Foundation

Slice 10.7 is completed at documentation checkpoint `717ea9f`. Slice 10.8 backend operational-summary foundation and HTTP/PostgreSQL tenant-isolation proof are completed and green remotely at `53ec5c1` in GitHub Actions run `29716215821`. Slice 10.9 proposal is completed and green remotely at `658f020` / run `29725053250`. Module Execution Kit v1.0.3 is completed and green remotely at `935c30e` / run `29741100028`. Slice 10.10 implementation is completed and green remotely at `f4195f8` / run `29766694450`, with closure audit-fix `0163f92` green in run `29804352719`. The Slice 10.11 mobile contract is completed and green remotely at `2ef81f5` / run `29807634502`; the isolated mobile workspace foundation is the active checkpoint.

The readiness endpoint reports the real MQTT publisher connection state. Development and test processes without publisher configuration remain honestly unconfigured; production requires verified-TLS publisher settings.

Completed Module 09 sequence:

1. Latest telemetry query foundation — completed
2. Telemetry history query foundation — completed
3. Telemetry storage strategy decision record — completed
4. Bounded read-time aggregation query foundation — completed

Current Module 10 sequence:

1. Activation and multiplatform architecture contract — completed
2. Dashboard domain and schema proposal — completed
3. Dashboard persistence foundation — completed and green remotely at `401d52a`
4. Tenant-isolated dashboard API — completed and green remotely at `06325f1`
5. Capability-driven widget resolution — completed and green remotely at `253c6ee`
6. Telemetry widget query integration — completed and green remotely at `1306238`
7. Web workspace and design-system foundation — completed and green remotely at `5953677`
8. User Web dynamic dashboard — completed and green remotely at completion checkpoint `717ea9f` / run `29694607680`
9. Admin Web backend foundation — completed and green remotely at `53ec5c1` / run `29716215821`
10. Admin Web UI proposal — completed and green remotely at `658f020` / run `29725053250`
11. Module Execution Kit v1.0.3 — completed and green remotely at `935c30e` / run `29741100028`
12. Admin Web UI foundation — completed and green remotely at `f4195f8` / run `29766694450`
13. Mobile contract — completed and green remotely at `2ef81f5` / run `29807634502`; isolated mobile workspace foundation is active

The completed structured logging contract is documented in `docs/structured-logging.md`. The completed health, readiness, operational metrics, and observability review contracts are documented in `docs/observability.md`. The completed HTTP error and error-handling review contracts are documented in `docs/error-handling.md`. The completed Integration and End-to-End Testing strategy, infrastructure proofs, and completion review are documented in `docs/testing-strategy.md`. Production readiness findings and ordered remediation slices are documented in `docs/production-readiness.md`. The completed runtime configuration and resource shutdown contract is documented in `docs/production-configuration.md`. The completed application-level HTTP security boundary is documented in `docs/production-security.md`. The completed native VPS deployment, release artifact, backup, restore, and rollback contract is documented in `docs/deployment-recovery.md`. The approved MQTT production transport architecture and implementation are documented in `docs/mqtt-production-transport-proposal.md` and `docs/mqtt-production-transport.md`.

Module 09 is completed and confirmed green remotely at `ec4851d`. Module 10 is active after explicit owner approval. Module 11 remains inactive until Module 10 is completed and explicitly approved.

Additional tracked follow-ups include Swagger API documentation and Jest worker teardown or open-handle warnings.

## Development Workflow

For each focused engineering task:

1. Review project state and architecture.
2. Make the smallest coherent change.
3. Validate according to risk.
4. Review the Git diff.
5. Update documentation.
6. Commit the checkpoint.
7. Push and verify CI.

Risk-based validation means documentation-only changes use diff checks and focused contracts; runtime changes add build and focused tests; database, MQTT, or security changes add the relevant integration gate; full Jest, coverage, recovery, and all integration gates are reserved for completion reviews and release checkpoints unless the changed boundary requires them.

## Project Continuity Rule

Before continuing development after a long break or a new AI session, review:

- `docs/product-vision.md`
- `docs/project-state.md`
- `docs/architecture.md`
- `docs/roadmap.md`

The repository documentation is the authoritative continuity checkpoint for the project.

## Runtime Contract

The current validated runtime is Node.js `22.23.1` with npm `10.9.8`. Local development and GitHub Actions are aligned through `.nvmrc`, `.node-version`, `package.json` engines, and the CI workflow. Local Docker usage is optional and not required.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:START -->

## CI Dependency Bootstrap Stabilization

- Module 08 is completed.
- Production Readiness Completion Review remains committed.
- Commit `16038dc` did not produce a green remote run: `npm ci --ignore-scripts` hung on GitHub Actions until the seven-minute timeout.
- The recovery keeps Node.js 22 and all application dependencies unchanged while invoking a CI-only temporary npm `10.8.0` CLI directly.
- Local validation is focused on the workflow contract, Bash syntax, formatting, and the CI bootstrap contract test.
- At that checkpoint, Module 09 had not yet been activated because a complete remote GitHub Actions run had not reported success.
- No automatic push is permitted.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:END -->

## CI Lockfile Registry Provenance Recovery - 2026-07-18

GitHub Actions run 80140752022 showed that dependency bootstrap was blocked by package-lock.json resolved URLs referencing an environment-specific internal Artifactory host. GitHub-hosted runners could not reach that host and npm retried until the bounded bootstrap terminated.

This recovery normalizes only the affected resolved URL prefixes to https://registry.npmjs.org/, while preserving dependency versions and integrity values. CI now fails fast if private registry provenance returns and explicitly replaces registry hosts with the public npm registry. Application source, Prisma schema, package.json, system architecture, and the then-pending Module 09 activation were unchanged. At that checkpoint, Module 09 had not yet been activated because the complete remote workflow had not succeeded.

<!-- CI-ORDERED-WORKFLOW-MARKER-REPAIR-20260718:START -->

## CI Ordered Workflow Marker Repair

Remote GitHub Actions run 80153444968 completed dependency bootstrap, the production dependency audit policy, non-mutating lint, deployment shell validation, Prisma validation and migration deployment, and the application build. Full Jest then failed only because the Integration and End-to-End Testing Completion Review contract retained commands from the former workflow.

The ordered contract now tracks the current commands for the bounded dependency bootstrap, production dependency audit policy, and direct Prisma CLI validation and migration steps. Application source, Prisma schema, package manifests, dependency lock data, architecture, and the then-pending Module 09 activation were unchanged. At that checkpoint, Module 09 had not yet been activated because a complete remote GitHub Actions run had not reported success.
<!-- CI-ORDERED-WORKFLOW-MARKER-REPAIR-20260718:END -->

<!-- MODULE-09-TELEMETRY-AGGREGATION:START -->

## Module 09 Read-Time Telemetry Aggregation Query Foundation

The approved device-scoped aggregation endpoint reads numeric `integer` and `number` capability observations at query time. It uses authenticated tenant context, verifies device and capability ownership, enforces canonical UTC `[from, to)` bounds, supports only `15m`, `1h`, and `1d` buckets, caps the range at 31 days and the result at 744 buckets, and returns `count`, `min`, `max`, and `avg` without synthesizing empty buckets.

PostgreSQL 16 `date_bin` and JSONB numeric filtering are executed through parameterized `Prisma.sql` and `$queryRaw`. The existing non-partitioned telemetry table and composite history index remain unchanged. No retention deletion, partitioning, persisted rollup, scheduler, migration, dependency, MQTT, Module 10, or production approval is introduced. The detailed contract is recorded in `docs/telemetry-aggregation.md`.
<!-- MODULE-09-TELEMETRY-AGGREGATION:END -->

<!-- MODULE-09-COMPLETION-REVIEW:START -->

## Module 09 Completion Review

Module 09 is complete at the repository level. Its completed capability set includes source-of-truth reconciliation, authenticated tenant-isolated latest reads, bounded cursor history, the PostgreSQL 16 storage strategy, and bounded read-time numeric aggregation.

The read-only completion audit passed 114 checks with 0 failures. Implementation commit `207894e` is confirmed green in remote GitHub Actions. This completion patch changes lifecycle metadata, documentation, and contract tests only; runtime behavior, Prisma schema and migrations, dependencies, MQTT behavior, Redis behavior, retention, partitioning, and persisted rollups remain unchanged.

Module 10 remains inactive until this completion-review commit is green remotely and activation is explicitly approved. Production deployment remains NOT APPROVED.
<!-- MODULE-09-COMPLETION-REVIEW:END -->

<!-- MODULE-10-ACTIVATION:START -->

## Module 10 Activation and Multiplatform Architecture

Module 10 - Dynamic Dashboard is active after explicit owner approval and the green remote Module 09 completion checkpoint at commit `ec4851d`.

The approved client direction is Admin Web and User Web with Next.js App Router and TypeScript, plus an Android-first and iOS-ready User Mobile application using React Native, Expo development builds, and TypeScript. The existing NestJS/Fastify backend remains authoritative and stays at the repository root.

This activation checkpoint adds architecture, lifecycle, documentation, and contract-test evidence only. It does not add frontend dependencies, change Prisma schema or migrations, implement CCTV/ONVIF/RTSP/vendor connectors, implement barcode activation, change MQTT or Redis behavior, activate Module 11, or approve production deployment.

The binding architecture and ordered slices are documented in `docs/module-10-multiplatform-architecture.md`.
<!-- MODULE-10-ACTIVATION:END -->

<!-- MODULE-10-DASHBOARD-DOMAIN-SCHEMA-PROPOSAL:START -->

## Module 10 Slice 10.1 Dashboard Domain and Schema Proposal

Slice 10.1 defines a normalized PostgreSQL dashboard aggregate with Dashboard, DashboardLayout, DashboardWidget, DashboardLayoutItem, and DashboardWidgetBinding. Ownership is tenant-aware through membership, widget bindings remain capability-driven, and aggregate mutations use schema versioning plus optimistic revision control.

The proposal is documented in `docs/module-10-dashboard-domain-schema-proposal.md`. This checkpoint changes documentation, lifecycle metadata, and contract tests only. Prisma schema, migrations, runtime behavior, dependencies, MQTT, Redis, CCTV, barcode onboarding, Module 11, and production deployment approval remain unchanged.

Slice 10.2 Dashboard Persistence Foundation is the next candidate only after this proposal commit is green remotely.
<!-- MODULE-10-DASHBOARD-DOMAIN-SCHEMA-PROPOSAL:END -->

<!-- MODULE-10-DASHBOARD-PERSISTENCE-FOUNDATION:START -->

## Module 10 Slice 10.2 Dashboard Persistence Foundation

Slice 10.2 implements the normalized Dashboard, DashboardLayout, DashboardWidget, DashboardLayoutItem, and DashboardWidgetBinding aggregate in PostgreSQL through Prisma.

Composite tenant-aware foreign keys bind dashboard ownership to Membership(id, tenantId), device bindings to Device(id, tenantId), and capability bindings to Capability(id, deviceId). Dashboard-owned children cascade only with the dashboard; membership, device, and capability references remain restrictive.

DashboardRepository provides atomic personal-dashboard create, read, and aggregate replacement with active membership verification, bounded persistence validation, binding target checks, and optimistic revision increments. TENANT_SHARED authorization remains disabled until Slice 10.3.

The migration and repository are proven through run-owned PostgreSQL integration tests. No dashboard API, frontend dependency, widget resolution, CCTV, barcode runtime, Module 11 activation, or production deployment approval is introduced.

Slice 10.3 Tenant-Isolated Dashboard API is next after this commit is green remotely.
<!-- MODULE-10-DASHBOARD-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-10-TENANT-ISOLATED-DASHBOARD-API:START -->

## Module 10 Slice 10.3 Tenant-Isolated Dashboard API

The binding implementation record is `docs/module-10-tenant-isolated-dashboard-api.md`. The API uses JWT plus active tenant context, derives `membershipId` server-side, restricts PERSONAL dashboards to their owner, permits tenant-wide reads of TENANT_SHARED dashboards, and requires the existing `ADMIN` role for shared create, replace, and delete. Optimistic revision, safe not-found behavior, stable domain errors, bounded DTOs, and response sanitization are mandatory. Widget resolution, telemetry execution, command execution, frontend workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-TENANT-ISOLATED-DASHBOARD-API:END -->

<!-- MODULE-10-CAPABILITY-DRIVEN-WIDGET-RESOLUTION:START -->

## Module 10 Slice 10.4 Capability-Driven Widget Resolution

The binding implementation record is `docs/module-10-capability-driven-widget-resolution.md`. DashboardWidgetResolver validates CARD, SWITCH, GAUGE, CHART, MAP, TABLE, and STATUS against tenant-scoped device and capability metadata before persistence and again through the authenticated resolution endpoint. Resolution returns bounded safe metadata and per-widget READY, INVALID, or UNSUPPORTED states. MAP remains fail-closed until a coordinate semantic contract is approved. Telemetry execution, command execution, frontend workspaces, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.
<!-- MODULE-10-CAPABILITY-DRIVEN-WIDGET-RESOLUTION:END -->

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

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:START -->

## Closed Module 11 Slice 11.2 - Automation Persistence Foundation

The binding record is `docs/module-11-automation-persistence-foundation.md`. The tenant-scoped `Automation` aggregate, normalized `AutomationAction` children, restrictive external foreign keys, owner membership validation, target capability resolution, atomic replacement, and optimistic revision control are remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / run `83411702069`.

Every definition remains persisted with `enabled=false`. Evaluation, execution, command dispatch, cooldown, runtime idempotency, execution logging, Redis, MQTT, Scene, Scheduler, Notification, Module 12, and production deployment remain gated pending separate owner-approved slices and remote-green evidence.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:START -->

## Continuity Safety

The repository now requires portable handoff protocol v5 for cross-session continuity. The handoff carries exact state, source-of-truth context, validation policy, cross-slice audit rules, and package trust classification. This tooling hardening remains part of the remote-green Slice 11.2 checkpoint. It does not start a later Module 11 slice or approve runtime automation execution, Module 12, push, or production deployment.

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V6:START -->

## Current Continuity Safety

Portable handoff protocol v6 is now the current generator contract. It derives the handoff schema from one version constant, rejects stale literal version assertions during the dependency-free Module Runner source check, and embeds fail-fast validation rules so predictable text and whitespace defects are rejected before dependency bootstrap or long-running proof.

The protocol upgrade changes tooling continuity only. It does not activate automation, authorize push, approve production deployment, or alter the historical evidence carried by protocol v5 checkpoints.

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V6:END -->

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:START -->

## Closed Module 11 Slice 11.3 - Automation Evaluation Foundation

The binding implementation record is `docs/module-11-automation-evaluation-foundation.md`, and the immutable closure evidence is `docs/module-11-automation-evaluation-foundation-closure.md`. The deterministic read-only evaluator is remote-green at `ef37d0860c90c168b5ba357ccb5d0f255b0be54c` / GitHub Actions run `30798541836`. It validates the exact bounded domain definition, requires tenant consistency, applies exact normalized trigger matching, preserves unavailable and type-incompatible values as fail-closed `UNKNOWN`, and emits immutable ordered action intents only for matches.

Every persisted automation remains disabled. Trigger subscription, API exposure, command dispatch, cooldown, execution logging, runtime idempotency, Redis, MQTT, broader loop prevention, Module 12, and production deployment remain gated. No later Module 11 slice is active until separately approved.

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-RUNTIME-SAFETY-CONTRACT:START -->

## Closed Module 11 Slice 11.4 - Automation Runtime Safety Contract

The binding contract is `docs/module-11-automation-runtime-safety-contract.md`, and immutable closure evidence is `docs/module-11-automation-runtime-safety-contract-closure.md`. The contract-only checkpoint is remote-green at `c12da413561ed6ba39f0725d2af3c083a2aa396c` / GitHub Actions run `30808609333`.

Every persisted automation remains disabled. Runtime subscription, execution persistence, cooldown implementation, action dispatch, Redis state, MQTT publication, activation endpoints, Module 12, and production deployment remain separately gated. No later Module 11 slice is active until separately approved.

<!-- MODULE-11-AUTOMATION-RUNTIME-SAFETY-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-COMMAND-DISPATCH-FOUNDATION:START -->

## Closed Module 11 Slice 11.8 - Automation Command Dispatch Foundation

Slice 11.8 is closed and remote-green at `d831149f920e1d5497cd1bb810f57266fe67fd17` / GitHub Actions run
`30938901883`. The immutable selection record remains
`docs/module-11-automation-command-dispatch-foundation.md`, the binding
implementation record remains
`docs/module-11-automation-command-dispatch-foundation-implementation.md`, and
immutable closure evidence is recorded in
`docs/module-11-automation-command-dispatch-foundation-closure.md`.

The closed foundation provides an internal bounded dispatcher that claims
persisted actions in order through `AutomationExecutionTransitionRepository`,
calls only `CommandService`, uses deterministic
`automation:<executionId>:<actionId>` idempotency, recovers failed command
identity through a tenant-bound lookup, records terminal action outcomes, and
stops after the first failure.

Automation remains disabled. The dispatcher has no telemetry subscriber,
runtime caller, public endpoint, worker, scheduler, queue, retry path, or direct
MQTT dependency. No later Module 11 slice, Module 12 activation, or production
deployment is approved by this closure.

<!-- MODULE-11-AUTOMATION-COMMAND-DISPATCH-FOUNDATION:END -->

<!-- IOS-FINAL-RELEASE-PROOF-POLICY:START -->

## iOS Final Release Proof Policy

The binding policy is `docs/ios-final-release-proof-policy.md`.

Native iOS compilation, Apple signing, TestFlight, physical iPhone proof, and App Store approval are deferred until a separately approved final release gate after Module 30. Their absence must not block Modules 11-30.

Shared Expo and React Native configuration, TypeScript compatibility, secure-session behavior, and mobile contracts remain mandatory during normal validation. Current module profiles must not require Xcode, CocoaPods, Apple credentials, an `.ipa`, an iPhone, or an iOS simulator.
<!-- IOS-FINAL-RELEASE-PROOF-POLICY:END -->
