# IoT Platform Project Bootstrap v1.0

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

This document is the migration checkpoint for the IoT Platform project.

It allows a new engineering session or AI coding agent to continue from the current repository state without redesigning previous decisions.

This document is NOT the primary architecture document.

The source of truth remains:

1. docs/product-vision.md
2. docs/project-state.md
3. docs/architecture.md
4. docs/roadmap.md

---

# Project Identity

Project:

IoT Platform

Goal:

Build a modern, secure, vendor-neutral IoT Platform supporting:

- Smart Home
- Sensors
- Actuators
- CCTV
- Industrial IoT
- Future device categories

The platform must remain:

- Vendor Neutral
- Protocol Neutral
- Capability Driven
- Tenant Isolated
- Secure
- Observable
- Testable
- Extensible

---

# Current Repository State

## Current Phase

Module 11 - Automation Engine — Slice 11.9 Automation Telemetry Coordination Foundation Implementation

## Current Milestone

Implement the internal post-persistence telemetry coordinator after remote-green selection `5781c65014c24fb5498b02fb611eaf885eea2c85` / CI run `30971468421`. The coordinator is registered only as an internal provider and is not runtime-reachable. Automation defaults disabled, and retry, activation, Module 12, and production deployment remain separately gated.

## Completed Workstreams

- Documentation Synchronization
- Structured Logging
- Observability
- Error Handling Consistency
- Integration and End-to-End Testing

## Completed Structured Logging Slices

- Logging Foundation
- Domain Event Normalization
- Completion Review

## Completed Observability Slices

- Health and Readiness Foundation
- Basic Operational Metrics
- Completion Review

## Completed Error Handling Slices

- Error Contract Foundation
- Domain Error Code Normalization
- Completion Review

## Active Workstream

- Module 11 - Automation Engine

## Completed Integration and End-to-End Testing Slices

- Testing Strategy Foundation
- Database Integration Test Foundation
- MQTT Workflow Integration Test Foundation
- Completion Review

## Completed Production Readiness Slices

- Review
- Production Configuration and Process Lifecycle Foundation
- Production Security Boundary Hardening
- Deployment and Recovery Foundation
- MQTT Production Transport Architecture Proposal
- MQTT Production Transport Implementation
- Production Readiness Completion Review — local gates passed

## Active Slice

- Module 10 Slice 10.14 - Module 10 Completion Review

Status:

- Module 09 is completed at commit `ec4851d` and confirmed green remotely
- Module 10 is active after explicit owner approval
- Multiplatform dashboard architecture is documented
- Module 11 remains inactive
- Explicit production deployment approval remains pending and separate

## Current Module 10 Sequence

- Activation and multiplatform architecture contract — completed
- Dashboard domain and schema proposal — completed
- Dashboard persistence foundation — completed and green remotely at `401d52a`
- Tenant-isolated dashboard API — completed and green remotely at `06325f1`
- Capability-driven widget resolution — completed and green remotely at `253c6ee`
- Telemetry widget query integration — completed and green remotely at `1306238`
- Web workspace and design-system foundation — completed and green remotely at `5953677`
- User Web dynamic dashboard — completed and green remotely at completion checkpoint `717ea9f` / run `29694607680`
- Admin Web backend foundation — completed and green remotely at `53ec5c1` / run `29716215821`
- Admin Web UI proposal — completed and green remotely at `658f020` / run `29725053250`
- Module Execution Kit v1.0.3 — completed and green remotely at `935c30e` / run `29741100028`; disposable-worktree proof, content-addressed payload, exact proven-commit fast-forward, and separate guarded push
- Admin Web UI foundation — completed and green remotely at `f4195f8` / run `29766694450`; same-origin HttpOnly session routes, runtime response validation, and read-only accessible summary states
- Mobile contract — completed and green remotely at `2ef81f5` / run `29807634502`
- Mobile workspace foundation — completed and green remotely through `d946c74` / run `29819923410`
- Mobile secure session foundation — completed and green remotely at `0cb1cef` / run `29824946401`
- Mobile login UI foundation — active; secure-session restoration, login, authenticated tenant shell, and logout only
- Barcode and CCTV UI compatibility contract — deferred to Slice 10.12; no camera protocol implementation

## Current Active Module

Module 10 — Dynamic Dashboard.

The active workstream is Module 10.

Module 09 — Telemetry & Time-Series Data is completed.

Module 11 — Automation Engine remains inactive until Module 10 is completed and explicitly approved.

# Completed Modules

## Module 01

Project Bootstrap

Completed.

## Module 02

Database Foundation

Completed.

Technology:

- PostgreSQL
- Prisma ORM

## Module 03

Authentication

Completed.

Includes:

- JWT Authentication
- Argon2id
- User Credential
- Refresh Token

## Module 04

User & Tenant Management

Completed.

Includes:

- Tenant isolation
- Membership model
- Tenant context handling

## Module 05

Device Management

Completed.

## Module 06

MQTT Connectivity

Completed.

Includes:

- Device authentication
- Topic validation
- MQTT communication

## Module 07

Universal Sensor & Capability Management

Completed.

Includes:

- Capability model
- Capability validation
- Telemetry validation foundation

## Module 08

Actuator & Device Command

Completed.

Includes:

- Command lifecycle
- Command idempotency
- Command acknowledgement handling
- Command timeout scheduler

---

# Current Architecture

Core Domain:

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

Vendor-specific implementation must only exist inside adapters.

---

# Technology Stack

Backend:

- NestJS
- Fastify
- TypeScript

Database:

- PostgreSQL
- Prisma ORM

Messaging:

- MQTT

Cache:

- Redis

Testing:

- Jest

CI:

- GitHub Actions

---

# Existing Automation

Available tools:

tools/

- finish-module.ps1
- review-project.ps1
- sync-architecture.ps1

Automation:

tools/automation/

- Update-Roadmap.ps1
- Update-ProjectState.ps1
- Update-RepositoryMemory.ps1
- Update-System.ps1
- Validation.ps1

After finishing a module:

Run:

tools\finish-module.ps1

---

# Documentation Rules

Always read before modifying code:

1. docs/product-vision.md
2. docs/project-state.md
3. docs/architecture.md
4. docs/roadmap.md
5. AI-Development-Kit/architecture/SYSTEM.md
6. AI-Development-Kit/agent/REPOSITORY-MEMORY.md

Do not redesign existing architecture unless explicitly instructed.

---

# Next Roadmap

Completed workstreams:

- Documentation Synchronization
- Structured Logging
- Observability
- Error Handling Consistency
- Integration and End-to-End Testing

Completed Observability slices:

- Health and Readiness Foundation
- Basic Operational Metrics
- Completion Review

Completed Error Handling slices:

- Error Contract Foundation
- Domain Error Code Normalization
- Completion Review

Current active workstream:

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

- Module 10 Slice 10.11 - Mobile Login UI Foundation

Current Module 10 sequence:

- Telemetry widget query integration completed and green remotely at `1306238`
- Web workspace and design-system foundation completed and green remotely at `5953677`
- User Web dynamic dashboard completed and green remotely at completion checkpoint `717ea9f` / run `29694607680`
- Admin Web backend operational-summary foundation and HTTP/PostgreSQL tenant-isolation proof completed and green remotely at `53ec5c1` / run `29716215821`
- Admin Web UI proposal completed and green remotely at `658f020` / run `29725053250`
- Module Execution Kit v1.0.3 completed and green remotely at `935c30e` / run `29741100028`
- Admin Web UI foundation completed and green remotely at `f4195f8` / run `29766694450`

Module 10 is active after explicit owner approval. Module 11 remains inactive.

After the reliability phase:

↓

Module 09

Telemetry & Time-Series Data

↓

Module 10

Dynamic Dashboard

---

# Migration Instruction For New AI Session

The new AI agent must:

1. Read all source-of-truth documentation.
2. Verify repository state.
3. Continue from the current managed Module 10 slice without reopening completed backend, reliability, telemetry, or earlier dashboard work.
4. Treat Module 08 as completed.
5. Do not activate Module 10 before Module 09 is completed and explicitly approved.
6. Avoid recreating completed modules.
7. Preserve existing architecture decisions.

---

# Final Checkpoint

Project:

IoT Platform

Version:

Bootstrap v1.0

Checkpoint:

Module 08 completed; Deployment and Recovery Foundation completed.

Previous milestones:

MQTT Workflow Integration Test Foundation completed.

Earlier completed milestones:

Error Handling Completion Review, Error Handling Domain Error Code Normalization, Error Contract Foundation, and Observability Completion Review completed.

Earlier implementation milestones:

Structured Logging completion review, Documentation synchronization gap closure, and Telemetry MQTT webhook contract validation hardening completed.

Status:

MQTT Production Transport Architecture Proposal and MQTT Production Transport Implementation are completed. Integration and End-to-End Testing, Error Handling Consistency, Observability, and Structured Logging are completed. Module 09 is active. The platform remains not approved for production deployment until explicit environment-specific approval.

---

# Runtime Contract

Validated development and CI runtime:

- Node.js 22.23.1
- npm 10.9.8
- `.nvmrc` and `.node-version` pin the runtime
- Native Windows development does not require Docker
- Future VPS deployment must preserve Node.js 22 until a dedicated upgrade is approved

# Deployment and Recovery Checkpoint

Native VPS deployment evidence includes a non-root systemd service, Nginx TLS and loopback proxy template, private metrics routing, manifest-verified release artifact, atomic application rollback, encrypted PostgreSQL backups, guarded restore, automated isolated recovery drill, lint, dependency policy, startup smoke, and CI artifact upload. Local Docker remains optional. Production MQTT publishing is implemented through the approved MQTT.js adapter; final production approval still requires the completion review and verified broker configuration.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:START -->

## CI Dependency Bootstrap Recovery

The active slice remains CI Dependency Bootstrap Stabilization. Remote run `80119471457` for commit `16038dc` confirmed that the first stabilization did not resolve the runner-specific npm hang: GitHub Actions selected Node.js `22.23.1` with bundled npm `10.9.8`, `setup-node` npm caching remained enabled but empty, and `npm ci --ignore-scripts` stopped progressing after dependency deprecation notices until the seven-minute step timeout.

The recovery control keeps the Node.js 22 application runtime contract unchanged. The workflow disables `setup-node` npm caching and delegates installation to `ops/scripts/ci-bootstrap-dependencies.sh`. That script uses a fresh per-run cache, fetches npm `10.8.0` as a registry package, invokes that pinned CLI directly through Node without a global install, disables lifecycle scripts during the locked install, bounds execution, emits heartbeat output, and dumps npm diagnostics on failure. Module 08 remained completed. At that checkpoint, Module 09 had not yet been activated because the complete remote GitHub Actions workflow had not succeeded.
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

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:START -->

## Module 11 Slice 11.2 - Automation Persistence Foundation Closure

Slice 11.2 is closed and remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / GitHub Actions run `83411702069`. The binding record is `docs/module-11-automation-persistence-foundation.md`. Tenant-scoped and owner-scoped disabled automation persistence, normalized actions, restrictive target references, atomic repository writes, optimistic revision, and PostgreSQL proof are complete.

No later Module 11 slice is active. API exposure, evaluation, command execution, cooldown, runtime idempotency, execution logging, Redis, MQTT, Scene, Scheduler, Notification, Module 12 activation, and production deployment remain separately gated.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

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

## Current Module 11 Retry Selection

Slice 11.9 is closed remote-green at `7de76596c6c1d52bd725406f3fad381cc62aedaf` / run `30983551478`. Slice 11.10 Retry Safety Foundation is selected but unimplemented and inactive. Automation remains disabled; coordinator, dispatcher, worker, scheduler, queue, MQTT wiring, Module 12, and production deployment remain gated.
