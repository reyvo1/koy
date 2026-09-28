# Master roadmap notice — 2026-09-15

The authoritative active roadmap is now `docs/ENTERPRISE-WAVE-ROADMAP.md` (Wave 1–13). The detailed module/slice chronology below is historical engineering evidence. Old `TODO`, `Deferred`, `inactive`, or module-current statements must not be treated as current without checking source and the active wave document. **Wave 1 and Wave 2 are both closed green; Wave 3 is ACTIVE and Wave 4 is blocked until Wave 3 heavy GitHub acceptance is green.** One complete large wave precedes one GitHub push.

---

# IoT Platform - Roadmap

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

Build a modern, secure, vendor-neutral IoT and smart home platform.

The long-term platform should provide one unified application for:

- Security cameras and CCTV
- Environmental sensors
- Motion sensors
- Smart switches
- Smart lights
- Smart plugs
- Future connected devices

The future user experience should be room-centric, modern, clean, and premium.

The platform core must remain capability-driven and must not be permanently coupled to one device manufacturer or protocol.

## Completed Platform Foundations

- [x] NestJS application foundation
- [x] TypeScript
- [x] Fastify
- [x] Prisma ORM
- [x] PostgreSQL integration
- [x] Redis integration
- [x] Authentication
- [x] Tenant isolation
- [x] User and tenant context handling
- [x] Device management
- [x] Device status handling
- [x] Device capability model
- [x] Capability value validation
- [x] MQTT webhook integration
- [x] MQTT device authentication
- [x] MQTT topic authorization
- [x] MQTT acknowledgement handling
- [x] Telemetry ingestion
- [x] Telemetry capability validation
- [x] Telemetry payload validation
- [x] Telemetry eventId idempotency protection
- [x] Telemetry duplicate race-condition protection
- [x] Telemetry MQTT webhook contract validation hardening
- [x] Latest telemetry API
- [x] Bounded telemetry history API
- [x] Telemetry storage strategy baseline
- [x] Command lifecycle
- [x] Command idempotency protection
- [x] Command acknowledgement handling
- [x] Command timeout scheduler
- [x] Prisma migrations
- [x] Automated unit testing
- [x] GitHub Actions CI
- [x] Prisma schema validation in CI
- [x] Prisma migration validation in CI
- [x] Application build validation in CI
- [x] Automated test execution in CI
- [x] Test coverage execution in CI

## Current Phase

Module 11 - Automation Engine.

Module 10 is completed. Module 11 remains active. Slices 11.1 through 11.9 are closed at their remote-green boundaries. Slice 11.9 closed at `7de76596c6c1d52bd725406f3fad381cc62aedaf` / CI run `30983551478`. Slice 11.10 Retry Safety Foundation is selected but not implemented. Coordinator, dispatcher, and retry remain runtime-inactive. Module 12 - Scene is not active.

## Current Focus

Select and validate a bounded PostgreSQL-authoritative Slice 11.10 retry safety contract without implementation or runtime activation.

The selection reuses the exact automation action command idempotency key, bounds total dispatch attempts to three, allows only explicit transient failures, and keeps persisted attempt state authoritative. Automation defaults disabled. Worker, scheduler, queue, retry runtime, activation, Module 12, and production deployment remain separately gated.

Native iOS build, Apple signing, TestFlight, and physical iPhone proof are deferred until the final release gate after Module 30. Shared Expo and React Native compatibility remains mandatory in current validation.

## Immediate Engineering Roadmap

1. Module 10 completion — completed and remote-green.
2. Module 11 activation — completed and remote-green.
3. Module 11 Slice 11.1 Automation Domain Contract — implemented, closed, and remote-green.
4. Module 11 Slice 11.2 Automation Persistence Foundation — implemented, closed, and remote-green.
5. Module 11 Slice 11.3 Automation Evaluation Foundation — implemented, closed, and remote-green.
6. Module 11 Slice 11.4 Automation Runtime Safety Contract — implemented, closed, and remote-green.
7. Module 11 Slice 11.5 Automation Execution Reservation Foundation — implemented and closed at `3dc303c270ff8641d1df78ed511b101bb6ddda9c` / run `30822543569`.
8. Module 11 Slice 11.6 Automation Cooldown Reservation Foundation — implemented and closed at `4fcdaf1eec4f9e5b6899459baa326c409e7fcf53` / run `30880293865`.
9. Module 11 Slice 11.7 Automation Action-State Transition Foundation — implemented and closed at `035bdc5106b6ae58f9c5d84c742f419d45301d2b` / run `30913013664`.
10. Module 11 Slice 11.8 Automation Command Dispatch Foundation — implemented and closed at `d831149f920e1d5497cd1bb810f57266fe67fd17` / run `30938901883`; runtime remains inactive.
11. Module 11 Slice 11.9 Automation Telemetry Coordination Foundation — implemented and closed at `7de76596c6c1d52bd725406f3fad381cc62aedaf` / run `30983551478`; coordinator remains runtime-inactive.
12. Module 11 Slice 11.10 Automation Retry Safety Foundation — selected only; implementation and runtime activation remain false.
13. After Slice 11.10 implementation is remote-green, combine closure with the next legal Module 11 gate only after a new safety review.
14. Run native iOS cloud build, signing, TestFlight, physical-device proof, and App Store approval only at the final release gate after Module 30.

Slice 11.8 is bound by `docs/module-11-automation-command-dispatch-foundation.md`, `docs/module-11-automation-command-dispatch-foundation-implementation.md`, and `docs/module-11-automation-command-dispatch-foundation-closure.md`. Slice 11.9 is bound by its selection, implementation, and closure records. Slice 11.10 selection is bound by `docs/module-11-automation-retry-safety-foundation.md`.

## Platform Foundation Roadmap

### Reliability

- [x] Command idempotency
- [x] Command timeout handling
- [x] Telemetry eventId duplicate protection
- [x] Database race condition handling for telemetry ingestion
- [x] Structured application logging
  - [x] Centralized Pino configuration
  - [x] Request ID generation and propagation
  - [x] Sensitive-field redaction
  - [x] Environment-aware log levels
  - [x] Focused logger configuration tests
  - [x] Domain event normalization
  - [x] Structured logging completion review
- [x] Observability foundations
  - [x] Health and readiness foundation
  - [x] Basic operational metrics
  - [x] Observability completion review
- [x] Error Handling Consistency
  - [x] Error Contract Foundation
  - [x] Domain Error Code Normalization
  - [x] Error Handling Completion Review
- [ ] Production health monitoring integration
- [ ] Reliability review

### Production Readiness

- [x] Production Readiness Review
- [x] Production Configuration and Process Lifecycle Foundation
  - [x] Validated host and port binding
  - [x] Production-safe Swagger policy
  - [x] Production placeholder-secret rejection
  - [x] NestJS shutdown hooks
  - [x] Prisma and Redis cleanup contracts
  - [x] Startup and shutdown tests
- [x] Production Security Boundary Hardening
  - [x] Exact production CORS allowlist
  - [x] Loopback-only trusted proxy policy
  - [x] Explicit request body and receive-time limits
  - [x] Redis-backed sensitive authentication rate limits
  - [x] Metrics bearer-token access boundary
- [x] Deployment and Recovery Foundation
  - [x] Native non-root systemd service and loopback Nginx/TLS contract
  - [x] Manifest-verified release artifact and startup smoke
  - [x] Atomic release activation and application rollback
  - [x] Encrypted PostgreSQL backup, guarded restore, and automated recovery drill
  - [x] Non-mutating lint and critical dependency review policy
- [x] MQTT Production Transport Architecture Proposal
  - [x] Preserve `MqttService` as the application facade
  - [x] Define verified TLS, QoS 1, non-retained publish, readiness, reconnect, ACL, and shutdown decisions
  - [x] Obtain explicit architecture approval
- [x] MQTT Production Transport Implementation
- [ ] Production Readiness Completion Review
  - [x] Local completion gates
  - [ ] Green remote CI confirmation
  - [ ] Explicit production deployment decision

### API and Contracts

- [x] Improve telemetry webhook contract validation
- [ ] Introduce structured request DTOs
- [ ] Review validation consistency
- [x] Establish standard error envelope and validation error contract
- [x] Normalize domain-specific error codes
- [x] Complete error handling contract review
- [ ] Improve Swagger documentation
- [ ] Review API versioning strategy

### Testing

- [x] Unit testing foundation
- [x] CI automated tests
- [x] CI test coverage execution
- [x] Integration testing strategy
  - [x] Test taxonomy and directory conventions
  - [x] PostgreSQL, Redis, and MQTT isolation contract
  - [x] Deterministic cleanup contract
  - [x] Per-run resource namespace helper
- [x] Database integration test foundation
  - [x] Run-owned PostgreSQL schema lifecycle
  - [x] Committed Prisma migration deployment
  - [x] Persistence and transaction rollback proof
  - [x] CI database integration gate
- [ ] Broader database integration scenarios
- [x] MQTT workflow integration test foundation
  - [x] Runner-owned loopback broker lifecycle
  - [x] Run-owned topic namespace and non-retained round-trip proof
  - [x] Telemetry broker-to-webhook persistence proof
  - [x] Command acknowledgement broker-to-webhook proof
  - [x] CI MQTT workflow integration gate
- [x] End-to-end testing strategy
  - [x] Shared production and E2E application bootstrap
  - [x] Fastify-native E2E smoke test
  - [x] CI E2E smoke gate
- [x] Integration and End-to-End Testing completion review
- [ ] Critical platform E2E tests

### Security

- [x] Tenant isolation
- [x] Device identity validation
- [x] Revoked device rejection
- [x] Controlled MQTT webhook access
- [x] Authoritative topic tenant context
- [x] Authoritative topic device context
- [ ] Security architecture review
- [ ] Secret management review
- [ ] Production authentication review
- [ ] Rate limiting strategy
- [ ] Audit logging strategy

## Device Platform Roadmap

### Device Management

- [x] Normalized device model
- [x] Device status handling
- [x] Capability model
- [x] Capability validation
- [ ] Device provisioning improvements
- [ ] Device onboarding workflow
- [ ] Device health model
- [ ] Device online and offline state
- [ ] Device metadata normalization

### Capability Architecture

- [x] Capability-driven device behavior
- [x] Capability data type validation
- [x] Reportable capability validation
- [ ] Capability semantic model review
- [ ] Capability unit support review
- [ ] Capability constraints improvements
- [ ] Capability schema versioning
- [ ] Custom capability support

## Adapter and Connector Roadmap

The platform should isolate vendor-specific and protocol-specific integrations behind adapters or connectors.

Planned integration boundaries include:

- [ ] MQTT adapter architecture review
- [ ] HTTP device adapter foundation
- [ ] Vendor cloud connector architecture
- [ ] Local network connector architecture
- [ ] Device discovery abstraction
- [ ] Capability normalization contract
- [ ] Telemetry normalization contract
- [ ] Command translation contract
- [ ] Device status synchronization contract

Adding a new manufacturer should ideally require a new adapter or connector rather than changes to the core tenant, telemetry, or command architecture.

## Room and Location Roadmap

The future application experience should be room-centric.

Planned location concepts include:

- Home
- Office
- Building
- Floor
- Room
- Area

Future work:

- [ ] Design location domain model
- [ ] Support hierarchical locations
- [ ] Assign devices to locations
- [ ] Query devices by room or area
- [ ] Room device summary APIs
- [ ] Room telemetry summary APIs
- [ ] Room control APIs

## CCTV and Security Camera Roadmap

Security cameras are a planned major platform device category.

CCTV implementation should begin only after the required platform foundations are stable.

### Camera Architecture

- [ ] Design normalized camera domain contract
- [ ] Define camera capability mapping
- [ ] Define camera status model
- [ ] Define stream availability model
- [ ] Define camera health information model

### ONVIF

- [ ] Research supported ONVIF camera workflows
- [ ] Design ONVIF adapter boundary
- [ ] Implement compatible camera discovery
- [ ] Normalize ONVIF device information
- [ ] Map supported camera capabilities
- [ ] Review ONVIF authentication requirements

### RTSP

- [ ] Design RTSP stream integration boundary
- [ ] Define normalized stream contract
- [ ] Secure stream credential handling
- [ ] Review browser and application playback architecture
- [ ] Review stream proxy or gateway requirements
- [ ] Review production streaming scalability

### Vendor Camera Connectors

- [ ] Define vendor camera connector interface
- [ ] Isolate vendor authentication
- [ ] Isolate vendor device identifiers
- [ ] Isolate vendor API contracts
- [ ] Normalize vendor camera status
- [ ] Normalize vendor camera capabilities
- [ ] Support future manufacturer-specific connectors

### Camera Onboarding

The preferred future onboarding experience is consumer-friendly guided pairing.

QR code or barcode scanning should be supported when appropriate for the device integration.

Planned flow:

1. Scan device QR code or barcode.
2. Extract or resolve device identity.
3. Identify vendor or supported protocol.
4. Select the appropriate adapter or connector.
5. Perform required authentication or pairing.
6. Discover device information.
7. Normalize supported capabilities.
8. Register the platform device.
9. Assign the camera to a room or location.

Future work:

- [ ] QR or barcode onboarding contract
- [ ] Device identity resolution
- [ ] Vendor detection strategy
- [ ] Adapter selection strategy
- [ ] Guided pairing workflow
- [ ] Camera registration workflow
- [ ] Room assignment workflow

### Security Camera Experience

Future camera application capabilities may include:

- [ ] Camera grid
- [ ] Live camera view
- [ ] Camera online and offline status
- [ ] Camera room or location context
- [ ] Camera identity
- [ ] Camera health information
- [ ] Fast camera navigation
- [ ] Multi-brand normalized camera experience

## Real-Time Platform Roadmap

The future application should support real-time or near-real-time updates.

Planned update categories include:

- Telemetry changes
- Device online and offline state
- Command lifecycle changes
- Camera status changes

Future work:

- [ ] Define real-time event contract
- [ ] Select client delivery architecture
- [ ] Real-time telemetry delivery
- [ ] Real-time device status delivery
- [ ] Real-time command status delivery
- [ ] Real-time camera status delivery
- [ ] Review scaling and connection management

## Dashboard and Application Backend Roadmap

- [ ] Dashboard summary APIs
- [ ] Room summary APIs
- [ ] Device status APIs
- [x] Latest telemetry APIs
- [x] Telemetry history APIs
- [ ] Command status APIs
- [ ] Camera summary APIs
- [ ] User application backend contracts

## User Experience Direction

The final application should feel:

- Modern
- Clean
- Premium
- Simple for normal users
- Room-centric
- Device-neutral

The primary interface should focus on:

- Rooms and locations
- Device status
- Camera visibility
- Sensor information
- Simple device controls
- Clear online and offline state

Protocol, vendor API, MQTT, RTSP, and infrastructure complexity should not dominate the normal user experience.

## Production Roadmap

- [x] Production readiness gap assessment
  - [x] Record explicit NOT READY deployment decision
  - [x] Classify production blockers PR-001 through PR-006
  - [x] Define ordered remediation slices
- [x] Production configuration strategy
- [x] Secret management
- [x] Database deployment strategy
- [x] Redis deployment strategy
- [ ] MQTT production architecture
- [ ] Camera streaming infrastructure review
- [ ] Metrics and monitoring
- [ ] Centralized logging
- [x] Backup and recovery strategy
- [ ] Scalability review
- [ ] Reliability review

### Production Readiness

- [x] Production Readiness Review
- [x] Production Configuration and Process Lifecycle Foundation
  - [x] Validated host and port binding
  - [x] Production-safe Swagger policy
  - [x] Production placeholder-secret rejection
  - [x] NestJS shutdown hooks
  - [x] Prisma and Redis cleanup contracts
  - [x] Startup and shutdown tests
- [x] Production Security Boundary Hardening
  - [x] Exact production CORS allowlist
  - [x] Loopback-only trusted proxy policy
  - [x] Explicit request body and receive-time limits
  - [x] Redis-backed sensitive authentication rate limits
  - [x] Metrics bearer-token access boundary
- [x] Deployment and Recovery Foundation
  - [x] Native non-root systemd service and loopback Nginx/TLS contract
  - [x] Manifest-verified release artifact and startup smoke
  - [x] Atomic release activation and application rollback
  - [x] Encrypted PostgreSQL backup, guarded restore, and automated recovery drill
  - [x] Non-mutating lint and critical dependency review policy
- [x] MQTT Production Transport Architecture Proposal
  - [x] Preserve `MqttService` as the application facade
  - [x] Define verified TLS, QoS 1, non-retained publish, readiness, reconnect, ACL, and shutdown decisions
  - [x] Obtain explicit architecture approval
- [x] MQTT Production Transport Implementation
- [ ] Production Readiness Completion Review
  - [x] Local completion gates
  - [ ] Green remote CI confirmation
  - [ ] Explicit production deployment decision
- [ ] Security review
- [ ] Production deployment architecture

## Long-Term Goal

Deliver one unified IoT and smart home application where users can:

- Monitor security cameras
- View sensor information
- Understand device status
- Control supported devices
- Organize devices by rooms and locations
- Use devices from multiple supported manufacturers

The platform should grow across device types, protocols, and manufacturers without rebuilding the core architecture for every new integration.

## Project Principles

The project must preserve:

- Security
- Tenant isolation
- Idempotency
- Database consistency
- Testability
- Observability
- Vendor neutrality
- Protocol neutrality
- Capability-driven architecture
- Extensibility
- Production reliability

Large future features should be introduced in the correct platform phase rather than forced prematurely into unrelated backend work.

## Runtime Reliability

- [x] Standardize local and CI execution on Node.js 22
- [x] Add `.nvmrc` and `.node-version`
- [x] Enforce Node.js 22 through `package.json` engines
- [x] Keep native Windows development supported without requiring Docker
- [ ] Revalidate the runtime contract before any future Node.js major-version upgrade

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

<!-- MODULE-10-WEB-WORKSPACE-DESIGN-SYSTEM-FOUNDATION:START -->

## Module 10 Slice 10.6 Web Workspace and Design-System Foundation

The implementation record is `docs/module-10-web-workspace-design-system-foundation.md`. Explicit npm workspaces provide Next.js App Router shells for Admin Web and User Web plus a narrowly shared design-system package. The backend remains authoritative at the repository root. Authentication integration, API consumption, commands, realtime delivery, mobile, CCTV, barcode runtime, Module 11, and production deployment approval remain outside this slice.

Slice 10.7 User Web Dynamic Dashboard followed after this Slice 10.6 commit was confirmed green remotely and is now completed at final checkpoint `b0c5b8e`.
<!-- MODULE-10-WEB-WORKSPACE-DESIGN-SYSTEM-FOUNDATION:END -->

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

## Module 11 Slice 11.2 - Automation Persistence Foundation

- Closed and remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / GitHub Actions run `83411702069`.
- Added the tenant-scoped `Automation` aggregate and normalized `AutomationAction` child model.
- Preserved trigger lookup indexes and restrictive membership, device, and capability references.
- Added owner-scoped atomic repository CRUD with optimistic revision.
- Revalidated the Slice 11.1 domain contract and every tenant capability reference before persistence.
- Persisted only `enabled=false`; runtime activation and evaluation remain deferred.
- Proved schema, migration, repository boundary, and PostgreSQL referential behavior.
- Kept Module 12 and production deployment inactive.
- The next bounded Module 11 slice requires separate explicit owner approval.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:START -->

## Module 11 Slice 11.3 - Automation Evaluation Foundation

- Closed and remote-green at `ef37d0860c90c168b5ba357ccb5d0f255b0be54c` / GitHub Actions run `30798541836`.
- Added a deterministic pure evaluator for one persisted disabled automation definition and one normalized capability report.
- Preserved the approved `ALWAYS`, `ALL`, `ANY`, `NOT`, and `COMPARE` vocabulary.
- Used `TRUE`, `FALSE`, and `UNKNOWN` semantics so missing latest values and type mismatches remain fail-closed.
- Required exact trigger identity and tenant consistency.
- Returned frozen ordered action intents only; no command or side effect is created.
- Preserved activation, subscription, cooldown, execution logging, runtime idempotency, broader loop prevention, Redis, MQTT, Module 12, and production deployment as later explicit gates.
- The next bounded Module 11 slice requires separate explicit owner approval.

<!-- MODULE-11-AUTOMATION-EVALUATION-FOUNDATION:END -->

<!-- MODULE-11-AUTOMATION-RUNTIME-SAFETY-CONTRACT:START -->

## Module 11 Slice 11.4 - Automation Runtime Safety Contract

- Closed and remote-green at `c12da413561ed6ba39f0725d2af3c083a2aa396c` / GitHub Actions run `30808609333`.
- Fixed trusted telemetry identity and deterministic tenant-bound execution identity.
- Required replay-safe idempotency and database-authoritative atomic cooldown reservation.
- Bounded automation ancestry to depth `16` for causal-loop suppression.
- Defined forward-only execution and action state transitions.
- Required sequential persisted action ordering and `CommandService`-only dispatch.
- Preserved every automation as disabled and introduced no runtime side effect.
- The next bounded Module 11 implementation slice requires separate explicit owner approval.

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
