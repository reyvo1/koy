# Repository Memory

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

This file is maintained by the project architect.

It contains FACTS about the current repository.

Never store plans or speculation.

---

CURRENT PROJECT
------------------------------------------------------------

Project:
IoT Platform

Goal:

Modern, secure, vendor-neutral IoT Platform supporting:

- Sensors
- Actuators
- CCTV
- Smart Home
- Industrial IoT

The architecture must remain protocol-neutral and vendor-neutral.

---

CURRENT PHASE
------------------------------------------------------------

Current Phase:

Module 11 - Automation Engine

Current Milestone:

Module 11 Slice 11.9 - Automation Telemetry Coordination Foundation is selected after remote-green Slice 11.8 closure commit `89c75d62c25290b20c635490d9e5faf617d429ac` / CI run `30968372456`.

The selected slice defines an inactive post-persistence coordination boundary over the existing evaluator, execution reservation, and dispatcher foundations. It is not implemented or runtime-reachable. Automation remains disabled by default; retry, activation, Module 12, deployment, and native iOS proof remain separate gates.

Previous Milestones:

Production Readiness Completion Review local gates passed.

MQTT Production Transport Implementation completed.

Deployment and Recovery Foundation completed.

Production Security Boundary Hardening completed.

Earlier Milestones:

Error Handling Completion Review, Error Handling Domain Error Code Normalization, and Error Contract Foundation completed.

Earlier Implementation Milestones:

Structured Logging completion review, Documentation synchronization gap closure, and Telemetry MQTT webhook contract validation hardening completed.

Completed Workstreams:

- Documentation Synchronization
- Structured Logging
- Observability
- Error Handling Consistency
- Integration and End-to-End Testing

Completed Structured Logging Slices:

- Logging Foundation
- Domain Event Normalization
- Completion Review

Completed Observability Slices:

- Health and Readiness Foundation
- Basic Operational Metrics
- Completion Review

Completed Error Handling Slices:

- Error Contract Foundation
- Domain Error Code Normalization
- Completion Review

Active Workstream:

- Module 11 - Automation Engine

Completed Integration and End-to-End Testing Slices:

- Testing Strategy Foundation
- Database Integration Test Foundation
- MQTT Workflow Integration Test Foundation
- Completion Review

Completed Production Readiness Slices:

- Review
- Production Configuration and Process Lifecycle Foundation
- Production Security Boundary Hardening
- Deployment and Recovery Foundation
- MQTT Production Transport Architecture Proposal
- MQTT Production Transport Implementation
- Production Readiness Completion Review — local gates passed

Active Slice:

- Module 11 Slice 11.8 - Automation Command Dispatch Foundation

Module Lifecycle Status:

- Module 10 is completed
- Module 11 is active after explicit owner approval
- Slice 11.7 closure is remote-green at `035bdc5106b6ae58f9c5d84c742f419d45301d2b`
- Slice 11.8 internal implementation is present but not closed or runtime-active
- Module 12 and production deployment remain separately gated

Current Active Module:

Module 11 - Automation Engine

The active engineering phase is Module 11.

Module 08 — Actuator & Device Command is completed.

---

CURRENT STACK
------------------------------------------------------------

Backend

- NestJS
- Fastify
- TypeScript

Database

- PostgreSQL
- Prisma ORM

Messaging

- MQTT

Cache

- Redis

Testing

- Jest

CI

- GitHub Actions

---

ARCHITECTURE
------------------------------------------------------------

Core Domain

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

Vendor-specific logic belongs only inside adapters.

---

MQTT
------------------------------------------------------------

MQTT is currently responsible for:

- Device Authentication
- Topic Validation
- Telemetry Ingestion
- Command Delivery
- ACK Handling

---

MQTT PRODUCTION TRANSPORT
------------------------------------------------------------

MQTT Production Transport Implementation completed.

`MqttService` remains the application facade and delegates to an internal MQTT.js publisher adapter using MQTT 5 over verified TLS, QoS 1, non-retained command publication, publish-only broker ACL, real readiness, bounded reconnect, and graceful shutdown.

Broker confirmation remains distinct from device acknowledgement. Disconnected publishes are rejected. Automatic retries, a persistent outbox, domain redesign, database changes, and Module 09 work are excluded from the first implementation.

Production MQTT publishing is implemented. Production deployment remains blocked until completion review and explicit approval.

---

COMMAND
------------------------------------------------------------

Command currently supports:

- Capability Validation

- Tenant Isolation

- Device Validation

- Idempotency

- ACK

- Timeout

---

TELEMETRY
------------------------------------------------------------

Telemetry currently supports:

- Topic Validation

- Capability Validation

- Payload Validation

- Duplicate Protection

- EventId Idempotency

- Tenant-isolated latest telemetry query
- Tenant-isolated bounded telemetry history query with opaque cursor pagination
- Approved PostgreSQL 16 non-partitioned telemetry storage baseline
- No automatic telemetry row retention or persisted aggregation is enabled
- Storage decision record: `docs/telemetry-storage-strategy.md`

---

ERROR HANDLING
------------------------------------------------------------

Error Contract Foundation currently supports:

- Global HTTP exception normalization

- Stable API error envelope

- Status-based machine-readable error codes

- Request ID propagation

- Sanitized validation details

- Internal exception detail masking

---

TESTING STRATEGY
------------------------------------------------------------

Testing Strategy Foundation currently supports:

- Separate unit/contract, integration, and E2E Jest execution

- Shared production and E2E application configuration

- Fastify-native request injection smoke coverage

- Sanitized per-run PostgreSQL, Redis, and MQTT resource namespaces

- Bounded and idempotent cleanup rules

- CI E2E smoke execution

Database Integration Test Foundation adds a run-owned PostgreSQL schema lifecycle, committed migration deployment, Prisma persistence and rollback proof, and a CI database integration gate. MQTT Workflow Integration Test Foundation adds a runner-owned loopback broker, run-owned topic namespace, telemetry and command acknowledgement workflow proofs, deterministic cleanup, and a CI MQTT integration gate. Integration and End-to-End Testing Completion Review verifies these layers as one coherent reliability gate. Production MQTT publishing is implemented through the approved adapter; the existing workflow integration remains an independent test boundary.

---

PRODUCTION READINESS REVIEW
------------------------------------------------------------

Status:

- NOT READY FOR PRODUCTION DEPLOYMENT

Finding status:

- PR-001 resolved by MQTT Production Transport Architecture Proposal and Implementation
- PR-002 resolved by Production Configuration and Process Lifecycle Foundation
- PR-003 resolved by Production Security Boundary Hardening
- PR-004 resolved by Deployment and Recovery Foundation
- PR-005 resolved by Deployment and Recovery Foundation
- PR-006 controlled by Deployment and Recovery Foundation; critical dependency acceptance is time-bounded
- Local Production Readiness Completion Review gates passed
- Remote CI confirmed green; explicit deployment approval pending

Evidence and ordered remediation slices are documented in `docs/production-readiness.md`.

SECURITY
------------------------------------------------------------

Implemented

- Tenant Isolation

- JWT Authentication

- Device Authentication

- Topic Validation

- Payload Validation

---

COMPLETED MODULES
------------------------------------------------------------

✔ Module 01
Project Bootstrap

✔ Module 02
Database Foundation

✔ Module 03
Authentication

✔ Module 04
User & Tenant Management

✔ Module 05
Device Management

✔ Module 06
MQTT Connectivity

✔ Module 07
Universal Sensor & Capability

✔ Module 08
Actuator & Device Command

---

REPOSITORY RULES
------------------------------------------------------------

Always read:

1.

docs/product-vision.md

2.

docs/project-state.md

3.

docs/architecture.md

4.

docs/roadmap.md

5.

AI-Development-Kit/architecture/SYSTEM.md

6.

REPOSITORY-MEMORY.md

7.

Current Module Prompt, only when a module is explicitly active

before changing code.

---

DO NOT MODIFY
------------------------------------------------------------

Do NOT redesign:

- Tenant Architecture

- Device Architecture

- Capability Architecture

- Telemetry Architecture

- Command Architecture

unless explicitly instructed by the project architect.

---

CURRENT ENGINEERING PRIORITIES
------------------------------------------------------------

Documentation synchronization is completed.

Structured Logging is completed, including Logging Foundation, Domain Event Normalization, and Completion Review.

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

- Module 10 Slice 10.11 - Mobile Workspace Foundation

Current Module 10 sequence:

- Telemetry widget query integration completed and green remotely at `1306238`
- Web workspace and design-system foundation completed and green remotely at `5953677`
- User Web dynamic dashboard completed and green remotely at completion checkpoint `717ea9f` / run `29694607680`
- Admin Web backend operational-summary foundation and HTTP/PostgreSQL tenant-isolation proof completed and green remotely at `53ec5c1` / run `29716215821`
- Admin Web UI proposal completed and green remotely at `658f020` / run `29725053250`
- Module Execution Kit v1.0.3 completed and green remotely at `935c30e` / run `29741100028`
- Admin Web UI foundation completed and green remotely at `f4195f8` / run `29766694450`

Module 10 is active after explicit owner approval. Module 11 remains inactive.

Future module sequence:

Module 09

Telemetry & Time-Series

↓

Module 10

Dashboard

---

IMPORTANT DECISIONS
------------------------------------------------------------

Platform remains:

- Vendor Neutral

- Protocol Neutral

- Capability Driven

- Tenant Isolated

Architecture documents are the source of truth.

Repository Memory only summarizes repository facts.

---

KNOWN TECHNICAL DEBT
------------------------------------------------------------

Current reliability phase priorities:

- Observability completion review (completed)

- Error Handling Consistency (completed)

- Testing Strategy Foundation (completed)

- Database Integration Test Foundation (completed)

- MQTT Workflow Integration Test Foundation (completed)

- Integration and End-to-End Testing Completion Review (completed)

- Production Readiness Review (completed)

- Production Configuration and Process Lifecycle Foundation (completed)

- Production Security Boundary Hardening (completed)

- Deployment and Recovery Foundation (completed)

- MQTT Production Transport Architecture Proposal (completed and approved)

- MQTT Production Transport Implementation (completed)

---

RUNTIME CONTRACT
------------------------------------------------------------

Validated runtime:

- Node.js 22.23.1
- npm 10.9.8
- `.nvmrc` and `.node-version` are authoritative runtime pins
- Native Windows development is supported without Docker
- GitHub Actions uses the same Node.js runtime file

DEPLOYMENT AND RECOVERY
------------------------------------------------------------

Deployment and Recovery Foundation provides a native VPS systemd/Nginx contract, a manifest-verified release artifact, atomic current/previous release symlinks, liveness-verified rollback, encrypted PostgreSQL backup scripts and timer, guarded restore procedures, an isolated recovery drill, non-mutating lint, a critical dependency review policy, production startup smoke, and CI artifact upload. Redis is non-authoritative. Database migrations are not automatically reversed. Production MQTT publishing is implemented through the approved MQTT.js adapter; final production approval still requires the completion review and verified broker configuration.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:START -->

## Current Slice: CI Dependency Bootstrap Recovery

Commit `16038dc` was pushed as the first CI dependency bootstrap stabilization. Remote run `80119471457` still failed before build or tests. Evidence: checkout resolved `16038dccc64321cab9b24d0c4652e7cc09086982`; `actions/setup-node@v4` selected Node.js `22.23.1` and npm `10.9.8`; npm caching was configured but no cache was found; `npm ci --ignore-scripts` emitted dependency deprecation warnings, then produced no further progress; the workflow terminated orphan process `npm ci` after the Bootstrap dependencies step timed out at seven minutes.

The recovery replaced bundled-npm installation with a directly invoked temporary npm `10.8.0` CLI, used a fresh bounded cache, constrained registry fetch behavior, preferred IPv4 DNS ordering, emitted heartbeat output, and captured diagnostic logs. No source application, schema, dependency manifest, architecture, or Module 09 activation was included. At that checkpoint, remote GitHub Actions success was still required.
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

READ-TIME TELEMETRY AGGREGATION
------------------------------------------------------------

Implemented:

- Authenticated and tenant-isolated device aggregation endpoint
- Numeric `integer` and `number` reportable capability validation
- Canonical UTC `[from, to)` query semantics
- `15m`, `1h`, and `1d` buckets
- 31-day range and 744-bucket bounds
- Parameterized PostgreSQL 16 `date_bin` and JSONB numeric filtering
- `count`, `min`, `max`, and `avg` without synthetic empty buckets
- Structured aggregation success/failure logs
- Bounded-cardinality aggregation query and duration metrics
- Unit, contract, and isolated PostgreSQL integration coverage

Unchanged:

- Telemetry ingestion, latest, and history behavior
- Prisma schema and migrations
- Non-partitioned storage baseline
- Retention deletion and persisted rollups remain disabled
- Module 10 remains inactive
- Production deployment remains NOT APPROVED

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

<!-- M10S11-CI-CONTRACT-RECONCILIATION:START -->

## Module 10 Slice 10.11 CI Contract Reconciliation

Remote CI for commit $ExpectedHead failed only because
est/module-10-mobile-workspace-foundation.contract.spec.ts retained the
pre-expo-system-ui exact dependency expectation. The contract is reconciled
with the already approved expo-system-ui version ~57.0.1. No dependency,
architecture, runtime, native-build, Slice 10.12, Module 11, or production
deployment scope is added. Remote-green remains pending.
<!-- M10S11-CI-CONTRACT-RECONCILIATION:END -->

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

## Module 11 Slice 11.1 - Automation Domain Contract

- Exact remote-green lifecycle base: `8db047a3c244fab23ef03cff124b90cabfc7c030` / GitHub Actions run `83390592083`.
- Implementation and closure evidence: `af9a9978b8a9ae56c040f00178c992c65c109aa5` / GitHub Actions run `83397563006`.
- Binding record: `docs/module-11-automation-domain-contract.md`.
- Approved trigger: `CAPABILITY_REPORTED` only.
- Approved condition nodes: `ALWAYS`, `ALL`, `ANY`, `NOT`, and `COMPARE`, bounded to depth 5, 32 nodes, and 8 children per boolean group.
- Approved action: `DEVICE_COMMAND` only, with one to sixteen unique definition-local action IDs and unique device-capability targets.
- Contract values are primitive only; hidden fields, non-finite values, structured payloads, and direct trigger-source feedback actions are rejected.
- Tenant authorization, persistence, evaluation, cooldown, execution log, runtime idempotency, broader loop prevention, Scene, Scheduler, Notification, Module 12 activation, and production deployment remain deferred.

<!-- MODULE-11-AUTOMATION-DOMAIN-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:START -->

## Module 11 Slice 11.2 Automation Persistence Foundation

Use `docs/module-11-automation-persistence-foundation.md` as the binding record. Slice 11.2 is closed and remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / GitHub Actions run `83411702069`. Automations are tenant-scoped and owner-scoped. Definitions are revalidated, capability targets are resolved inside tenant context, writes are transactional, and replacement/deletion use optimistic revision. Action rows are deterministic aggregate children. All persisted automations remain `enabled=false`.

Do not treat this closure as approval for a controller, evaluator, telemetry subscription, Redis state, MQTT publication, direct device command execution, cooldown, retry, execution log, Scene, Scheduler, Notification, Module 12 activation, or production deployment. The next bounded Module 11 slice requires separate explicit owner approval.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:START -->

## Module Execution Handoff Protocol v5

Every portable handoff embeds the exact tracked snapshot, integrity manifest, machine-readable state, active-module prompt, repository source-of-truth, validation policy, cross-slice regression rules, failure protocol, and continuity checklist. A new session must begin in audit-only mode and end its first response with `No repository changes made.`

A package may be described as verified only when every mandatory local gate for the exact candidate has passed, including Full Jest and historical transition safety. An unavailable mandatory gate keeps the artifact in `DRAFT CANDIDATE` state. New contract tests must be registered in `test/contract-surface-policy.json`, and historical contracts must preserve closure evidence without freezing the current repository against approved later slices. Push and production deployment remain separately approved operations.

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

<!-- IOS-FINAL-RELEASE-PROOF-POLICY:START -->

## iOS Final Release Proof Policy

The binding policy is `docs/ios-final-release-proof-policy.md`.

Native iOS compilation, Apple signing, TestFlight, physical iPhone proof, and App Store approval are deferred until a separately approved final release gate after Module 30. Their absence must not block Modules 11-30.

Shared Expo and React Native configuration, TypeScript compatibility, secure-session behavior, and mobile contracts remain mandatory during normal validation. Current module profiles must not require Xcode, CocoaPods, Apple credentials, an `.ipa`, an iPhone, or an iOS simulator.
<!-- IOS-FINAL-RELEASE-PROOF-POLICY:END -->

## Module 11 Slice 11.9 Implementation Candidate

Remote-green selection evidence is `5781c65014c24fb5498b02fb611eaf885eea2c85` / CI run `30971468421`. The candidate adds an internal telemetry coordinator and PostgreSQL runtime read repository, explicit approved-runtime evaluator mode, deterministic report/candidate ordering, replay/cooldown/ancestry suppression composition, focused tests, and PostgreSQL integration. The providers remain non-exported and are not wired into telemetry ingestion or MQTT. Automation defaults disabled; retry, activation, Module 12, push, and deployment remain separate gates.

## Closed Module 11 Slice 11.9 and Selected Slice 11.10

Slice 11.9 is closed and remote-green at `7de76596c6c1d52bd725406f3fad381cc62aedaf` / GitHub Actions run `30983551478`. The immutable closure evidence is `docs/module-11-automation-telemetry-coordination-foundation-closure.md`. The coordinator remains internal and runtime-inactive.

Slice 11.10 Automation Retry Safety Foundation is selected by `docs/module-11-automation-retry-safety-foundation.md`. Retry is not implemented or active. The selection requires PostgreSQL-authoritative attempt state, exact reuse of the existing action command idempotency key, at most three total dispatch attempts, explicit transient-error allowlisting, deterministic bounded backoff, and no direct MQTT publication. Worker, queue, scheduler, telemetry wiring, public API, Module 12, and production deployment remain inactive.
