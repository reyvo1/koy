# IoT Platform System Architecture

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

## Purpose

This document is the condensed architecture reference for all coding agents.

The authoritative documentation remains:

1. docs/product-vision.md
2. docs/project-state.md
3. docs/architecture.md
4. docs/roadmap.md

This file is only a compact architecture summary.

## Remote-Green Slice 10.10 Boundary

Slice 10.10 is completed and green remotely at exact commit `f4195f814b5c83c5aa21409f284c73a08be64108` / GitHub Actions run `29766694450`. The approved Admin-specific same-origin session boundary, runtime response validation, and read-only operational-summary experience passed the repository-default web build, full Jest, PostgreSQL, MQTT, recovery, coverage, release, and startup-smoke gates. The Windows-safe Module Execution Kit v1.1.2 contract also passed its exact-file, disposable-worktree, lifecycle, and post-apply checks. The existing backend remains the `GET /admin/operational-summary` authority behind JWT, trusted tenant context, and the existing `ADMIN` role.

The backend operational-summary foundation remains completed and green remotely through `4097356` and `53ec5c1` / run `29716215821`. Slice 10.10 adds only the approved read-only Admin Web consumer. Write operations, Prisma schema and migrations, dependencies, MQTT, Redis, metrics access, Module 11, and production deployment approval remain unchanged.

---

## Product Goal

Build a modern, secure, vendor-neutral IoT Platform.

Support:

- Sensors
- Smart Home
- CCTV
- Industrial IoT
- Future protocols
- Future vendors

without redesigning the platform core.

---

## Architecture Principles

The platform MUST remain:

- Vendor Neutral
- Protocol Neutral
- Capability Driven
- Tenant Isolated
- Secure
- Observable
- Testable
- Extensible

Vendor-specific logic belongs inside adapters.

---

## Core Domain

Tenant

↓

User

↓

Device

↓

Capability

↓

Telemetry

↓

Command

Everything integrates into these normalized concepts.

---

## High-Level Architecture

Client

↓

NestJS API

↓

Application Services

↓

Prisma ORM

↓

PostgreSQL

Redis provides coordination.

MQTT provides device communication.

Workers execute asynchronous tasks.

---

## Telemetry Flow

Device

↓

MQTT

↓

Authentication

↓

Topic Validation

↓

Capability Validation

↓

Telemetry Normalization

↓

Database

↓

Realtime Event

## Telemetry Storage Strategy

The approved baseline remains PostgreSQL 16 with the existing non-partitioned telemetry table. Raw telemetry row deletion is disabled by default, backup retention remains a separate recovery policy, and aggregation remains read-time until a capability-driven contract and measured workload justify a later change. The detailed decision is recorded in `docs/telemetry-storage-strategy.md`.

---

## Command Flow

Client

↓

API

↓

Permission Validation

↓

Capability Validation

↓

Command Record

↓

MQTT Publish

↓

ACK

↓

Status Update

↓

Realtime Event

---

## Adapter Layer

Future adapters:

- MQTT
- HTTP
- Zigbee
- Z-Wave
- Modbus
- OPC-UA
- ONVIF
- RTSP
- Vendor APIs

---

## Error Handling

The HTTP boundary uses:

- Global exception normalization
- Stable error envelope
- Status-based machine-readable codes
- Request ID propagation
- Sanitized validation details
- Internal error masking
- Safe structured unhandled-error classification
- Automated error-handling completion contract gate

Domain business decisions and tenant isolation remain unchanged.

---

## Testing Strategy

The reliability testing foundation uses:

- Separate unit/contract and E2E Jest execution
- Shared production and E2E application configuration
- Fastify-native request injection
- Per-run PostgreSQL, Redis, and MQTT resource namespaces
- Bounded and idempotent cleanup
- CI E2E smoke execution
- Run-owned PostgreSQL schema lifecycle
- Prisma migration, persistence, and rollback integration proof
- CI database integration execution

The active messaging integration slice must follow `docs/testing-strategy.md`.

---

## Module 10 Web Workspace Boundary

Admin Web and User Web are isolated Next.js App Router workspaces. Shared UI code is limited to `packages/design-system`; the backend remains authoritative at the repository root. Clients do not connect directly to MQTT, do not carry device or camera credentials, and do not establish tenant authorization.

Slice 10.8 backend operational-summary runtime and its HTTP/PostgreSQL tenant-isolation proof are green remotely at `53ec5c1` / GitHub Actions run `29716215821`. A later explicitly approved Admin Web UI slice must reuse the existing active tenant membership role `ADMIN`, consume only the normalized read-only backend contract, and must not access the service-token Prometheus endpoint or trust client-only role checks.

## Current Phase

Module 11 - Automation Engine — Slice 11.6 Automation Cooldown Reservation Foundation

Completed workstreams:

- Documentation Synchronization
- Structured Logging
- Observability
- Error Handling Consistency
- Integration and End-to-End Testing

Completed Structured Logging slices:

- Logging Foundation
- Domain Event Normalization
- Completion Review

Completed Observability slices:

- Health and Readiness Foundation
- Basic Operational Metrics
- Completion Review

Completed Error Handling slices:

- Error Contract Foundation
- Domain Error Code Normalization
- Completion Review

Active workstream:

- Module 10 - Dynamic Dashboard

Completed Integration and End-to-End Testing slices:

- Testing Strategy Foundation
- Database Integration Test Foundation
- MQTT Workflow Integration Test Foundation
- Completion Review

Completed Production Readiness slices:

- Review
- Production Configuration and Process Lifecycle Foundation
- Production Security Boundary Hardening
- Deployment and Recovery Foundation
- MQTT Production Transport Architecture Proposal
- MQTT Production Transport Implementation

Active slice checkpoint:

- Module 10 Slice 10.14 - Module 10 Completion Review

The read-only review is bound to `docs/module-10-completion-review.md` at exact remote-green base `ead0692b516f6795455ad53c23a13c17f7185bbe` / GitHub Actions run `30602246816`. It found no repository-level blocker to a later explicit completion transition while preserving backend authority, tenant isolation, fail-closed unsupported behavior, and separate deployment approval.

Module lifecycle status:

- Module 09 is completed and confirmed green remotely at `ec4851d`
- Module 10 is active after explicit owner approval
- Module 11 remains inactive until Module 10 completion and explicit approval
- Explicit production deployment approval remains separate

## Production Readiness Decision

The Production Readiness Review still records **NOT READY FOR PRODUCTION DEPLOYMENT** because deployment approval is explicit and environment-specific. All repository-level implementation blockers are resolved or controlled, the Production Readiness Completion Review passed its local gates, and remote CI is confirmed green. Evidence is maintained in `docs/production-readiness.md` and `docs/production-readiness-completion.md`. Explicit production deployment approval remains pending.

## MQTT Production Transport

`docs/mqtt-production-transport-proposal.md` records the approved architecture decision and `docs/mqtt-production-transport.md` records the implementation. `MqttService` remains the application facade, MQTT.js stays inside the adapter boundary, command publication uses verified TLS, MQTT 5, QoS 1, and non-retained messages, broker confirmation remains distinct from device acknowledgement, disconnected publishes are rejected, and no automatic retry or outbox is added.

---

## Repository Truth

Priority:

1. docs/product-vision.md
2. docs/project-state.md
3. docs/architecture.md
4. docs/roadmap.md
5. SYSTEM.md
6. REPOSITORY-MEMORY.md
7. MODULE-XX.md

Higher priority always wins.

---

## Agent Rule

Always read:

- product-vision.md
- project-state.md
- architecture.md
- roadmap.md
- SYSTEM.md
- REPOSITORY-MEMORY.md
- Current Module Prompt, only when a module is explicitly active

before changing the repository.

## Runtime Contract

Validated runtime:

- Node.js 22.23.1
- npm 10.9.8
- Native Windows development supported
- Docker optional for local development

Local, CI, and future VPS execution must remain on Node.js 22 until a dedicated runtime upgrade is approved and validated.

## Deployment and Recovery

The native VPS contract uses Nginx TLS termination, a loopback NestJS listener, a non-root systemd service, immutable release directories, atomic symlink activation, and liveness-verified application rollback. PostgreSQL custom-format backups are encrypted, checksummed, retained, and restored first into an isolated target. CI validates recovery, release manifests, startup, lint, dependency policy, and artifact upload. Database migrations are not automatically reversed.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:START -->

## CI Dependency Bootstrap Operational Recovery

CI dependency installation is an operational reliability concern and does not change the application architecture. The recovery workflow preserves Node.js 22, the committed `package-lock.json`, application dependencies, module boundaries, protocols, data models, and production runtime behavior. A CI-only npm `10.8.0` CLI is fetched into runner temporary storage and invoked directly for the clean install; it is not added to `package.json`, `package-lock.json`, or the production release.

At that checkpoint, Module 09 had not yet been activated because the complete remote workflow was not yet green.
<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:END -->

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

<!-- M10S11-ANDROID-NATIVE-PROOF-PREPARATION:START -->

## Module 10 Slice 10.11 Android Native Proof Preparation

The owner-approved Android application ID is com.reyvo.iotplatform.
The User Mobile workspace pins expo-system-ui at ~57.0.1
for Expo SDK 57 compatibility. Repository preparation is complete; one native
Android development-build and launch proof on the authorized physical device
remains pending. Slice 10.12, Module 11, and production deployment remain
inactive.
<!-- M10S11-ANDROID-NATIVE-PROOF-PREPARATION:END -->

<!-- M10S11-ANDROID-NATIVE-DEVELOPMENT-BUILD-PROOF:START -->

## Module 10 Slice 10.11 Native Android Proof Closure

The User Mobile application completed local Android debug compilation,
exact-serial verified installed-package, direct Metro connection, process persistence, and foreground-launch proof
from remote-green commit 24e8b2f31dfb6c88c186f40aa681d25ed4329c15. The application identity remains
com.reyvo.iotplatform. Architecture and inactive-scope gates remain unchanged.
<!-- M10S11-ANDROID-NATIVE-DEVELOPMENT-BUILD-PROOF:END -->

<!-- MODULE-10-BARCODE-CCTV-UI-COMPATIBILITY-CONTRACT:START -->

## Module 10 Slice 10.12 - Barcode and CCTV UI Compatibility Contract

The binding record is `docs/module-10-barcode-cctv-ui-compatibility-contract.md`. This owner-approved checkpoint defines only fail-closed client compatibility boundaries for future QR or barcode onboarding and normalized CCTV metadata or stream-availability presentation.

QR or barcode input remains an untrusted onboarding mechanism rather than a device protocol. ONVIF, RTSP, vendor connectors, identity resolution, tenant authorization, credential handling, and stream decisions remain behind future backend adapter boundaries. Clients must not receive raw RTSP URLs, camera credentials, vendor tokens, MQTT topics, or unrestricted infrastructure payloads.

This checkpoint changes documentation, lifecycle metadata, and one contract test only. It adds no scanner, pairing, camera discovery, playback, PTZ, notification, dependency, lockfile, application runtime, backend API, Prisma schema, migration, PostgreSQL, Redis, MQTT, native project, CI workflow, Module 11 activation, or production deployment approval.

<!-- MODULE-10-BARCODE-CCTV-UI-COMPATIBILITY-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-DOMAIN-CONTRACT:START -->

## Module 11 Automation Domain Contract

Module 11 Slice 11.1 is closed and remote-green at `af9a9978b8a9ae56c040f00178c992c65c109aa5` / GitHub Actions run `83397563006`. It defines a versioned, bounded automation definition independent of persistence and transport. The only approved trigger is a normalized capability report. Conditions form a fail-closed boolean tree with explicit depth, node, and fan-out limits. The only approved action is a primitive-valued device command.

Tenant IDs are not accepted from the contract input. Future repository and runtime layers must resolve all device and capability references inside trusted tenant context and must reuse `CommandService` for publication. Direct MQTT publication, arbitrary executable content, persistence, evaluation, cooldown, execution logging, runtime idempotency, Scene, Scheduler, Notification, Module 12 activation, and production deployment are outside Slice 11.1.

<!-- MODULE-11-AUTOMATION-DOMAIN-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:START -->

## Module 11 Automation Persistence Foundation

Slice 11.2 is closed and remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / GitHub Actions run `83411702069`. `Automation` is the tenant-owned aggregate root and `AutomationAction` is its normalized child. Trigger identity is indexed for future dispatch, condition JSON remains bounded by the Slice 11.1 validator, action order is explicit, and external membership/device/capability references are restrictive. The repository is the only approved write boundary and uses transactions plus optimistic revision.

The persisted state is always disabled. There is no HTTP surface, trigger evaluation, command invocation, Redis dependency, MQTT publication, or execution audit in Slice 11.2. No later Module 11 slice, Module 12 activation, or production deployment approval is implied by this closure.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:START -->

## Portable Handoff and Session Continuity

The official Module Execution Kit generates protocol-v5 portable handoffs. Each handoff is content-addressed and self-contained: it includes the exact Git snapshot, state, lifecycle evidence, active module prompt, source-of-truth context, validation policy, failure-prevention rules, and internal SHA-256 manifest. New sessions must audit these files before mutation.

Validation continuity is fail-closed. Focused tests alone cannot establish a verified package; Full Jest, historical transition safety, exact-file hashes, allowed-path review, and the official disposable-worktree profile remain mandatory. Environment limitations do not count as passes.

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:END -->

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:START -->

## Module 11 Slice 11.3 Automation Evaluation Foundation Closure

Slice 11.3 is closed and remote-green at `ef37d0860c90c168b5ba357ccb5d0f255b0be54c` / GitHub Actions run `30798541836`. The binding implementation record is `docs/module-11-automation-evaluation-foundation.md`, and the immutable closure evidence is `docs/module-11-automation-evaluation-foundation-closure.md`. The deterministic read-only `AutomationEvaluator`, fail-closed three-state condition semantics, exact trigger and tenant matching, immutable ordered action intents, and bounded input validation are complete.

Every persisted automation remains disabled. This closure adds no controller, telemetry subscription, command dispatch, database write, Redis state, MQTT publication, cooldown, retry, execution log, runtime idempotency, ancestry tracking, cross-automation loop graph, Module 12 activation, or production deployment approval. No later Module 11 slice is active; the next bounded slice requires separate explicit owner approval.

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-RUNTIME-SAFETY-CONTRACT:START -->

## Closed Module 11 Slice 11.4 - Automation Runtime Safety Contract

Slice 11.4 is closed and remote-green at `c12da413561ed6ba39f0725d2af3c083a2aa396c` / GitHub Actions run `30808609333`. The binding contract remains `docs/module-11-automation-runtime-safety-contract.md`, and immutable closure evidence is recorded in `docs/module-11-automation-runtime-safety-contract-closure.md`.

The closed contract fixes trusted telemetry identity, deterministic tenant-bound execution identity, replay-safe idempotency, database-authoritative cooldown reservation, bounded ancestry, auditable forward-only execution states, ordered action snapshots, and `CommandService`-only dispatch semantics.

Every persisted automation remains disabled. This closure adds no schema, migration, repository runtime, telemetry subscription, coordinator, worker, queue, command dispatch, MQTT publication, Redis state, execution row, activation endpoint, Module 12 activation, or production deployment approval. No later Module 11 slice is active; the next bounded implementation slice requires separate explicit owner approval.

<!-- MODULE-11-AUTOMATION-RUNTIME-SAFETY-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-EXECUTION-RESERVATION-FOUNDATION:START -->

## Closed Module 11 Slice 11.5 - Automation Execution Reservation Foundation

Slice 11.5 is closed and remote-green at `260b49192156c9eadad1ca6bae5dbb639420ded1` / GitHub Actions run `30818815202`. The binding implementation record remains `docs/module-11-automation-execution-reservation-foundation.md`, and immutable closure evidence is recorded in `docs/module-11-automation-execution-reservation-foundation-closure.md`.

The closed foundation provides PostgreSQL-backed `AutomationExecution` and `AutomationExecutionAction` evidence, canonical tenant-bound reservation, immutable accepted-telemetry and ordered-action snapshots, equivalent replay, fail-closed conflict rejection, and bounded persisted loop suppression.

Normal automation writes remain disabled. This closure adds no telemetry subscriber, evaluator coordinator, execution dispatcher, `CommandService` invocation, device-command creation, MQTT publication, worker, queue, scheduler, cooldown configuration or reservation, action-state coordinator, activation endpoint, Module 12 activation, or production deployment approval. No later Module 11 slice is active; the next bounded implementation slice requires separate explicit owner approval.
<!-- MODULE-11-AUTOMATION-EXECUTION-RESERVATION-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-COOLDOWN-RESERVATION-FOUNDATION:START -->

## Closed Module 11 Slice 11.6 - Automation Cooldown Reservation Foundation

Slice 11.6 is closed and remote-green at `84dad046319a886ef6b4878288b859cc023d10be` / GitHub Actions run `30875978216`. The binding implementation record remains `docs/module-11-automation-cooldown-reservation-foundation.md`, and immutable closure evidence is recorded in `docs/module-11-automation-cooldown-reservation-foundation-closure.md`.

The closed foundation provides bounded internal cooldown persistence, PostgreSQL-authoritative transaction serialization and database-clock evaluation, canonical replay under lock, immutable cooldown evidence, restrictive same-automation references, and auditable `SUPPRESSED_COOLDOWN` reservations that never extend the cooldown window.

Normal automation writes remain disabled and force cooldown to zero. This closure adds no public cooldown configuration, telemetry subscriber, evaluator coordinator, execution dispatcher, `CommandService` invocation, device-command creation, MQTT publication, worker, queue, scheduler, retry, activation endpoint, Module 12 activation, or production deployment approval. No later Module 11 slice is active; the next bounded implementation slice requires separate explicit owner approval.
<!-- MODULE-11-AUTOMATION-COOLDOWN-RESERVATION-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-ACTION-STATE-TRANSITION-FOUNDATION:START -->

## Closed Module 11 Slice 11.7 - Automation Action-State Transition Foundation

Slice 11.7 is closed and remote-green at `058ae7b793608d02bbdb834b537e443af61b4b49` / GitHub Actions run `30907702263`. The binding implementation record remains `docs/module-11-automation-action-state-transition-foundation.md`, and immutable closure evidence is recorded in `docs/module-11-automation-action-state-transition-foundation-closure.md`.

The closed foundation provides PostgreSQL-authoritative forward-only execution and action transitions, transaction-scoped claim serialization, database-authored transition timestamps, deterministic command-identity verification, idempotent terminal replay, first-failure skip/finalization semantics, and literal structured event logging.

Normal automation writes remain disabled. This closure adds no telemetry subscriber, evaluator coordinator, execution dispatcher, `CommandService` invocation, device-command creation, MQTT publication, worker, queue, scheduler, retry, activation endpoint, Module 12 activation, or production deployment approval. No later Module 11 slice is active; the next bounded implementation slice requires separate explicit owner approval.
<!-- MODULE-11-AUTOMATION-ACTION-STATE-TRANSITION-FOUNDATION:END -->

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

<!-- MODULE-11-AUTOMATION-TELEMETRY-COORDINATION-FOUNDATION:START -->

## Selected Module 11 Slice 11.9 - Automation Telemetry Coordination Foundation

Slice 11.9 is selected after remote-green Slice 11.8 closure
`89c75d62c25290b20c635490d9e5faf617d429ac` / CI run `30968372456`.
The immutable selection record is
`docs/module-11-automation-telemetry-coordination-foundation.md`.

The selected architecture starts only from trusted persisted telemetry evidence
and composes the existing `AutomationEvaluator`,
`AutomationExecutionRepository`, and `AutomationCommandDispatcher` boundaries.
It requires deterministic tenant-bound candidate and latest-value reads, replay
safety, bounded ancestry, and structured logging without raw payloads.

This selection adds no coordinator implementation, telemetry subscriber, MQTT
consumer, runtime caller, public endpoint, worker, scheduler, queue, retry,
automation enablement, Module 12 activation, or production deployment approval.

<!-- MODULE-11-AUTOMATION-TELEMETRY-COORDINATION-FOUNDATION:END -->

<!-- IOS-FINAL-RELEASE-PROOF-POLICY:START -->

## iOS Final Release Proof Policy

The binding policy is `docs/ios-final-release-proof-policy.md`.

Native iOS compilation, Apple signing, TestFlight, physical iPhone proof, and App Store approval are deferred until a separately approved final release gate after Module 30. Their absence must not block Modules 11-30.

Shared Expo and React Native configuration, TypeScript compatibility, secure-session behavior, and mobile contracts remain mandatory during normal validation. Current module profiles must not require Xcode, CocoaPods, Apple credentials, an `.ipa`, an iPhone, or an iOS simulator.
<!-- IOS-FINAL-RELEASE-PROOF-POLICY:END -->

## Module 11 Slice 11.9 Boundary

Telemetry coordination is implemented as an internal, runtime-inactive provider. It validates exact persisted telemetry evidence, loads enabled exact-trigger candidates and only required latest values through PostgreSQL, evaluates in explicit approved-runtime mode, reserves idempotent execution state, and dispatches only persisted `RESERVED` or `DISPATCHING` executions. No telemetry hook, MQTT subscriber, retry, public endpoint, or runtime activation is present.

## Module 11 Retry Safety Boundary

After remote-green closure of Slice 11.9 at `7de76596c6c1d52bd725406f3fad381cc62aedaf`, Slice 11.10 selects only a persisted retry safety contract. Retry must reuse the existing action command idempotency key, remain tenant-bound, use PostgreSQL as authority, allow at most three total attempts, and fail closed for unknown errors. No runtime wiring, worker, scheduler, queue, direct MQTT publication, Module 12 activation, or deployment approval is included.
