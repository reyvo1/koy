# IoT Platform - Architecture

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

## Current Module 10 Proposal Boundary

Slice 10.7 provides an authenticated tenant-authorized read-only User Web dashboard through same-origin Next.js server routes while the NestJS/Fastify backend remains authoritative at the repository root. Session material stays in HttpOnly cookies, concurrent refresh-token rotation is serialized, and browser clients receive no direct MQTT, command, realtime, camera-protocol, Module 11, or production-deployment authority.

Slice 10.8 adds a dedicated backend operational-summary module, completed and confirmed green remotely at audit-fix commit `53ec5c1` in GitHub Actions run `29716215821`. The endpoint reuses JWT authentication, trusted tenant context, and the existing active membership role `ADMIN`; it returns bounded tenant-safe aggregate counts and timestamps rather than Prometheus output, raw telemetry payloads, MQTT topics, or infrastructure secrets.

Slice 10.10 Admin Web Operational Dashboard UI Foundation is completed and green remotely at exact commit `f4195f814b5c83c5aa21409f284c73a08be64108` / GitHub Actions run `29766694450`. It implements the approved same-origin read-only Admin Web operational-summary UI while preserving backend authorization, tenant isolation, dependency boundaries, Module 11 inactivity, and separate deployment approval. The same commit proves the Windows-safe development execution path through automatic short work roots, projected path-budget enforcement, streamed process output with heartbeats, process-tree timeout cleanup, command-specific timeouts, content-addressed ZIP execution, and exact proven-commit fast-forward with no automatic push.

## Module 10 Completion Review Boundary

The read-only Module 10 Completion Review is recorded in `docs/module-10-completion-review.md` at exact remote-green base `ead0692b516f6795455ad53c23a13c17f7185bbe` / GitHub Actions run `30602246816`.

The review found no repository-level blocker to a later explicit Module 10 completion transition. It preserves backend-authoritative authentication, trusted tenant context, authorization, persistence, telemetry, adapter, onboarding, and camera decisions. It does not change runtime architecture, dependencies, schema, migrations, protocol behavior, CI, or deployment configuration.

Module 10 remains active at Slice 10.14. Module completion, Module 11 activation, and production deployment remain separate explicit gates.

## Architecture Goal

The platform is designed as a vendor-neutral and protocol-neutral IoT and smart home backend.

The core platform should provide a normalized architecture for devices, capabilities, telemetry, and commands.

Vendor-specific and protocol-specific complexity should be isolated behind adapters or connectors.

The architecture must support future device categories, including security cameras, without rebuilding the core domain for every manufacturer.

## Technology Stack

- NestJS
- TypeScript
- Fastify
- Prisma ORM
- PostgreSQL
- Redis
- MQTT webhook integration
- Jest
- GitHub Actions CI
- Next.js App Router web workspaces
- Shared React design-system package

## High-Level Architecture

The platform is divided into core application layers and future integration boundaries.

### API Layer

NestJS controllers receive HTTP and webhook requests.

The API layer is responsible for:

- Request parsing
- Trusted context extraction
- Basic contract validation
- Authentication and authorization boundaries
- Passing normalized input to application services

Controllers should not contain vendor-specific device business logic.

### Business Layer

NestJS services contain application rules and domain workflows.

The business layer handles:

- Tenant isolation
- Device validation
- Capability validation
- Telemetry ingestion
- Command lifecycle
- Idempotency
- Reliability rules

Business logic should operate on normalized platform concepts rather than vendor-specific payload models whenever possible.

### Data Layer

Prisma ORM provides database access to PostgreSQL.

PostgreSQL stores persistent platform state including:

- Tenants
- Users
- Devices
- Capabilities
- Telemetry
- Commands

Database constraints are part of the platform reliability model.

Unique constraints may be used to enforce idempotency and consistency at the database boundary.

### Cache and Coordination Layer

Redis supports temporary state and application coordination.

Potential responsibilities include:

- Temporary command state
- Coordination
- Caching
- Future distributed application concerns

Redis should not replace PostgreSQL as the authoritative persistent data store.

### Messaging Layer

MQTT webhook integration currently handles device-facing messaging workflows.

Current MQTT responsibilities include:

- Device authentication
- Topic authorization
- Command acknowledgement handling
- Telemetry ingestion

MQTT topics provide authoritative tenant and device context where applicable.

Payload data must not override trusted tenant or device identity derived from the topic or authenticated context.

## MQTT Production Transport Boundary

The approved architecture is documented in `docs/mqtt-production-transport-proposal.md`, and implementation evidence is documented in `docs/mqtt-production-transport.md`.

The proposal keeps `CommandService` and the completed Module 08 lifecycle unchanged. `MqttService` remains the application-facing facade and would delegate to an internal MQTT.js publisher adapter inside the MQTT boundary.

The proposed publisher uses one long-lived MQTT 5 client per application process, verified `mqtts://` TLS, a dedicated publish-only broker credential, QoS 1, `retain=false`, real connection readiness, bounded reconnect, publish confirmation timeout, and graceful idempotent shutdown. Broker confirmation only proves broker acceptance; the existing device acknowledgement remains authoritative.

Disconnected publishes are rejected. Automatic retry, an offline queue, a persistent outbox, schema changes, and Module 09 work are not included in the first implementation.

The approved production publisher is implemented behind the `MqttService` facade. MQTT.js remains isolated in the adapter layer, while Module 08 command lifecycle behavior is unchanged.

## Structured Logging

Structured logging is a cross-cutting reliability concern.

The platform uses centralized Pino configuration for:

- Request ID generation and propagation
- Environment-aware log levels
- HTTP outcome-based levels
- Sensitive-field redaction
- Stable structured request completion and failure messages

Trusted tenant, user, device, command, and telemetry context may be attached to logs when operationally useful.

Untrusted payload identity must not be logged as authoritative context.

Passwords, tokens, secrets, credentials, authorization headers, cookies, and raw device payloads must not be exposed in logs.

The detailed contract is documented in `docs/structured-logging.md`.

## Error Handling

Error handling is a cross-cutting API reliability concern.

The platform uses a global exception filter to produce one stable HTTP error envelope with:

- Numeric HTTP status
- Stable machine-readable error code
- Human-readable message
- Optional sanitized validation details
- Request correlation identifier
- UTC timestamp
- Request path without query parameters

Validation responses expose field paths and validator messages only. Rejected values, DTO targets, credentials, tokens, secrets, and raw device payloads must not be copied into API error responses.

Unexpected exceptions are masked from clients and return `INTERNAL_ERROR` with a generic message. The global error event records request context and safe error classification without copying raw exception messages or stack traces.

Existing domain services may continue raising NestJS HTTP exceptions. The filter standardizes the transport response without changing domain decisions or tenant boundaries.

The detailed contract is documented in `docs/error-handling.md`.

## Core Domain

### Tenant

Represents an isolated customer or organization.

Tenant isolation is a mandatory security boundary.

### User

Represents a platform user associated with authorized tenant context.

### Device

Represents connected hardware belonging to a tenant.

A device should remain a normalized platform concept.

The core Device model should not be permanently coupled to one manufacturer.

### Capability

Represents data or operations supported by a device.

Capabilities are the primary abstraction for device behavior.

A capability may define:

- Key
- Data type
- Semantic meaning
- Unit
- Constraints
- Readability
- Writability
- Reportability

The capability architecture should support future schema versioning and custom capabilities.

### Telemetry

Represents data reported by devices.

Telemetry processing preserves:

- Tenant isolation
- Device identity
- Device status validation
- Capability validation
- Payload validation
- Idempotency

Telemetry currently uses eventId-based duplicate protection.

Database-level uniqueness and Prisma P2002 handling protect concurrent duplicate telemetry ingestion while preserving tenant and payload consistency.

Latest and history queries remain tenant-isolated. History queries use opaque seek cursors over deterministic `createdAt DESC, id DESC` ordering, a maximum page size of 100, and a composite tenant/device/time/id index.

Latest-state reads use the existing telemetry persistence boundary. The authenticated API derives tenant identity from `TenantContextGuard`, verifies the device belongs to that tenant, orders by `createdAt` and `id` descending for deterministic selection, and returns `null` when the authorized device has not reported telemetry.

The approved storage baseline remains PostgreSQL 16 with the existing non-partitioned telemetry table and composite query index. Raw telemetry row deletion is disabled by default, backup retention is a separate recovery policy, and aggregation remains read-time. Partitioning requires measured operational evidence and a separately approved backward-compatible migration. The complete decision is recorded in `docs/telemetry-storage-strategy.md`.

### Command

Represents an instruction sent to a device.

Commands preserve:

- Tenant isolation
- Capability validation
- Idempotency
- Lifecycle state
- Acknowledgements
- Timeout handling

Commands are normalized platform operations.

Future adapters may translate normalized commands into protocol-specific or vendor-specific operations.

## Adapter and Connector Architecture

Future external integrations should be isolated behind adapters or connectors.

The core platform should operate on normalized internal models.

An adapter or connector may be responsible for:

- Device discovery
- Vendor authentication
- Device onboarding
- Capability mapping
- Telemetry normalization
- Command translation
- Device status synchronization

Potential adapter categories include:

- MQTT adapter
- HTTP device adapter
- Vendor cloud connector
- Local network connector
- ONVIF camera adapter
- RTSP stream integration
- Future protocol adapters

Adding a new vendor should ideally add an integration boundary rather than modify core tenant, telemetry, and command rules.

## CCTV and Camera Architecture Direction

Security cameras are a planned major device category.

The camera architecture should support multiple integration mechanisms.

### ONVIF Integration

ONVIF may provide standardized discovery and supported camera operations for compatible devices.

An ONVIF adapter should translate supported camera information into normalized platform concepts.

### RTSP Integration

RTSP may provide a stream source for compatible cameras.

RTSP stream details should be isolated from the general device domain.

The application should consume a normalized camera or streaming contract rather than directly spreading RTSP-specific logic throughout the platform.

### Vendor Camera Connectors

Some manufacturers may require proprietary APIs or cloud authentication.

Vendor-specific camera connectors should isolate:

- Vendor authentication
- Vendor device identifiers
- Vendor API contracts
- Vendor-specific pairing
- Vendor-specific status mapping

The core camera experience should consume normalized camera information.

### Camera Normalization

Future normalized camera information may include:

- Platform device identity
- Tenant identity
- Vendor
- Model
- Camera status
- Online or offline state
- Room or location
- Supported camera capabilities
- Stream availability
- Device health information

The exact camera domain model should be introduced when the CCTV implementation phase begins.

It should not be prematurely forced into the current telemetry reliability work.

## Camera Onboarding Direction

Camera onboarding should eventually provide a guided consumer experience.

QR code or barcode scanning is a preferred discovery and pairing entry point when supported.

The onboarding flow may:

1. Scan a device code.
2. Extract or resolve device identity information.
3. Identify the vendor or protocol.
4. Select the appropriate adapter.
5. Perform required authentication or pairing.
6. Discover supported capabilities.
7. Register the normalized device.
8. Assign the device to a room or location.

QR scanning is an onboarding mechanism, not a universal camera protocol.

The adapter layer remains responsible for vendor or protocol integration.

## Future Room and Location Domain

The future smart home experience is room-centric.

The domain should eventually support hierarchical or structured locations such as:

- Home
- Office
- Building
- Floor
- Room
- Area

Devices may be assigned to a location.

The exact location domain model should be designed when the corresponding product phase begins.

## Future Real-Time Delivery

The application should eventually receive real-time or near-real-time updates.

Potential update categories include:

- Telemetry changes
- Device online or offline status
- Command lifecycle changes
- Camera status changes

The real-time delivery mechanism should be selected based on scalability and application requirements.

The core domain should not be unnecessarily coupled to one client delivery technology.

## Security Boundaries

The architecture must preserve:

- Tenant isolation
- Device identity validation
- Revoked device rejection
- Controlled webhook access
- Authoritative tenant context
- Authoritative device context
- Authentication
- Authorization
- Input validation

Untrusted payload data must not override trusted identity context.

## Reliability Architecture

Production reliability is a core architecture concern.

Important mechanisms include:

- Idempotent event handling
- Database unique constraints
- Race condition handling
- Command timeout processing
- Structured logging
- Observability
- Automated tests
- Continuous integration
- Prisma migration validation

Application-level duplicate checks should be supported by database-level consistency guarantees when concurrent processing is possible.

## Testing and Continuous Integration

The project uses Jest for automated testing.

Test layers are separated by responsibility:

- Unit and contract tests isolate application logic and run through the default Jest configuration.
- Integration tests exercise real PostgreSQL, Redis, or MQTT infrastructure inside a run-owned namespace.
- End-to-end tests exercise the NestJS and Fastify HTTP boundary through the shared production application configuration.

Production and E2E startup share `src/bootstrap/configure-application.ts` so global validation and error behavior cannot drift into a test-only implementation. E2E tests use Fastify request injection and do not open a TCP listener.

External integration resources are scoped by a sanitized `TEST_RUN_ID`:

- PostgreSQL uses a run-owned database or schema.
- Redis uses a run-owned key prefix and never global flush operations.
- MQTT uses a run-owned topic prefix and clears any retained test messages.

Cleanup must be bounded, idempotent, and close all application and infrastructure clients.

Database integration tests use `test/scripts/run-database-integration.ts`. The runner requires explicit test-mode opt-in, creates only the run-owned PostgreSQL schema, applies committed Prisma migrations with `prisma migrate deploy`, runs sequential integration tests, and drops the schema from a `finally` path. It never drops a database or mutates the public schema.

MQTT workflow integration tests use `test/scripts/run-mqtt-integration.ts`. The runner reuses the isolated database lifecycle, starts a test-only broker on loopback with an ephemeral port, limits publishes to `tests/<run-id>`, exercises telemetry and command acknowledgement through the existing webhook boundaries, and closes clients, broker, application, Prisma, and schema deterministically. Production MQTT publisher integration is isolated behind the `MqttService` facade and does not alter the test-only broker workflow, telemetry webhook, or device acknowledgement boundaries.

Integration and End-to-End Testing Completion Review validates the unit, contract, Fastify E2E, PostgreSQL, and MQTT workflow layers as one coherent reliability gate. The workstream is complete and Production Readiness is active. This transition does not activate Module 09 or introduce production MQTT transport behavior.

## Production Readiness Boundary

Production Readiness Review records **NOT READY FOR PRODUCTION DEPLOYMENT** until deployment is explicitly approved for a real environment. The review does not alter the normalized domain or adapter boundaries. All repository-level findings PR-001 through PR-006 are resolved or controlled.

The ordered remediation plan is documented in `docs/production-readiness.md`, and completion evidence is recorded in `docs/production-readiness-completion.md`. Production Readiness Completion Review gates passed and remote CI is confirmed green. Module 09 is completed and confirmed green remotely at `ec4851d`. Module 10 is active after explicit owner approval under `docs/module-10-multiplatform-architecture.md`. Explicit production deployment approval remains pending and environment-specific.

Current CI validates:

- Dependency installation
- Prisma schema
- Prisma migrations
- Application build
- Unit and contract tests
- Fastify E2E smoke test
- Isolated PostgreSQL integration test
- Runner-owned MQTT workflow integration test
- Test coverage execution
- Non-mutating TypeScript lint
- Critical production dependency review policy
- PostgreSQL backup/restore recovery drill
- Manifest-verified production release artifact
- Production artifact startup smoke
- GitHub Actions release artifact upload

The detailed contract is documented in `docs/testing-strategy.md`.

Engineering changes should preserve a green CI pipeline.

## Production HTTP Security Boundary

The application-level production HTTP boundary is capability-neutral and applies before domain processing. Production configuration requires an exact HTTPS CORS allowlist, while wildcard origins, credential-bearing origins, paths, queries, and fragments are rejected. The production Fastify adapter trusts forwarded addresses only from loopback, limits request bodies to 256 KiB, and applies a 30-second request receive timeout.

Sensitive public authentication routes use a Redis-backed, atomic, per-route and per-client-IP limiter. Redis keys hash the client identity, exceeded requests return a stable `AUTH_RATE_LIMIT_EXCEEDED` code and `Retry-After`, and limiter failures deny protected requests with `RATE_LIMIT_UNAVAILABLE`. `/metrics` requires a production bearer token compared in constant time; deployment must still restrict the endpoint at the reverse-proxy or monitoring-network boundary.

The detailed contract is documented in `docs/production-security.md`. These controls do not change tenant, device, capability, telemetry, command, or MQTT adapter architecture.

## Architecture Principles

The platform architecture must remain:

- Vendor-neutral
- Protocol-neutral
- Capability-driven
- Tenant-isolated
- Secure
- Testable
- Observable
- Extensible

The platform should grow through clear integration boundaries rather than accumulating vendor-specific logic inside the core domain.

## Runtime Contract

The validated application runtime is Node.js 22. Local development and GitHub Actions use the repository-owned `.nvmrc` contract, while `package.json` restricts supported execution to Node.js 22.

Docker is optional rather than required for local development. Native Windows services for PostgreSQL, Redis, and MQTT remain supported. Future VPS deployment may use native services or containers as long as the same Node.js 22 runtime contract and validation gates are preserved.

## Production Configuration and Process Lifecycle

Production startup is separated into application creation and runtime start boundaries. The runtime resolves validated `HOST`, `PORT`, and `SWAGGER_ENABLED` values before listening, applies the shared HTTP configuration, and enables NestJS shutdown hooks. Production Swagger exposure is rejected, and documented placeholder values for JWT and MQTT webhook secrets are rejected before startup.

Prisma participates in application shutdown through `$disconnect()`. Redis cleanup is registered as a lifecycle provider, attempts graceful `quit()`, is bounded to five seconds, falls back to a forced disconnect, and is idempotent across repeated shutdown notifications. The detailed contract is documented in `docs/production-configuration.md`.

## Deployment and Recovery Boundary

The initial production deployment contract is native Linux VPS infrastructure and does not require Docker for local development. Nginx terminates TLS and proxies only to the NestJS listener on loopback. systemd runs the application as a dedicated non-root user with restrictive process and filesystem controls. Runtime secrets remain in a root-owned environment file outside release directories.

Release directories are immutable and activated through `current` and `previous` symlinks. Deployment applies committed Prisma migrations before switching the application symlink, verifies liveness, and restores the previous application symlink on failure. Database migrations are never automatically reversed; releases must remain compatible with the immediately preceding schema unless a separate expand-and-contract plan is approved.

PostgreSQL is the authoritative recovery source. Production backups use verified custom-format dumps, GPG encryption, SHA-256 sidecars, bounded retention, and off-host copies. The automated recovery drill restores committed migrations and marker data into a run-owned database and cleans both source and target databases deterministically. Redis remains non-authoritative.

The detailed contract is documented in `docs/deployment-recovery.md`. Production MQTT transport remains outside this foundation.

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

<!-- MODULE-11-AUTOMATION-DOMAIN-CONTRACT:START -->

## Module 11 Slice 11.1 - Automation Domain Contract

The binding record is `docs/module-11-automation-domain-contract.md`. Slice 11.1 is closed and remote-green at `af9a9978b8a9ae56c040f00178c992c65c109aa5` / GitHub Actions run `83397563006`. The core contract is vendor-neutral and capability-driven: `CAPABILITY_REPORTED` is the only approved trigger, conditions use a bounded `ALWAYS`/`ALL`/`ANY`/`NOT`/`COMPARE` tree, and `DEVICE_COMMAND` is the only approved action.

The validator rejects unknown fields, unsupported event or action kinds, non-primitive values, non-finite numbers, oversized condition trees, duplicate action identities, duplicate device-capability targets, and a direct action edge back to the triggering capability. All device and capability references still require future resolution under trusted authenticated tenant context; syntax validation is not authorization.

The contract layer does not depend on Prisma, Redis, MQTT, controllers, or frontend workspaces. Future runtime execution must reuse the existing `CommandService` rather than publishing directly to MQTT. Persistence, evaluation, cooldown, execution logging, retry, runtime idempotency, broader causal-loop prevention, Scene, Scheduler, Notification, Module 12 activation, and production deployment remain deferred.

<!-- MODULE-11-AUTOMATION-DOMAIN-CONTRACT:END -->

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:START -->

## Module 11 Automation Persistence Foundation

Slice 11.2 is closed and remote-green at `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` / GitHub Actions run `83411702069`. `Automation` is the tenant-owned aggregate root and `AutomationAction` is its normalized child. Trigger identity is indexed for future dispatch, condition JSON remains bounded by the Slice 11.1 validator, action order is explicit, and external membership/device/capability references are restrictive. The repository is the only approved write boundary and uses transactions plus optimistic revision.

The persisted state is always disabled. There is no HTTP surface, trigger evaluation, command invocation, Redis dependency, MQTT publication, or execution audit in Slice 11.2. No later Module 11 slice, Module 12 activation, or production deployment approval is implied by this closure.

<!-- MODULE-11-AUTOMATION-PERSISTENCE-FOUNDATION:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:START -->

## Session Handoff Architecture

Portable handoff protocol v5 is the continuity boundary between chat sessions or accounts. It embeds the active prompt and repository source-of-truth alongside the exact tracked snapshot and machine-readable validation policy. Integrity is proven by the external ZIP SHA-256 and internal `MANIFEST-SHA256.txt`.

The first response after a handoff is audit-only. Before any candidate, the next session must perform a cross-slice impact audit, register every new contract test, and distinguish historical closure evidence from current-state assertions. Packages with an unrun mandatory gate are drafts rather than verified artifacts.

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V5:END -->

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V6:START -->

## Session Handoff Architecture v6

Portable handoff protocol v6 is the current continuity boundary. Its schema is derived from one protocol-version constant, and repository source checks reject contract assertions that pin an obsolete handoff version. The generated handoff carries fail-fast text hygiene, Git-native whitespace proof, time-efficient validation ordering, exact state, source-of-truth context, package trust classification, and mandatory full-proof requirements.

Protocol v5 remains historical evidence for its original remote-green checkpoint. Protocol v6 supersedes it for newly generated handoffs without changing historical artifacts or weakening the audit-only first-response, no-automatic-push, and separate-deployment-approval rules.

<!-- MODULE-EXECUTION-HANDOFF-PROTOCOL-V6:END -->

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

## Module 11 Slice 11.9 Internal Telemetry Coordination

The Slice 11.9 implementation composes accepted persisted telemetry, tenant-bound PostgreSQL candidate/latest-value reads, `AutomationEvaluator`, `AutomationExecutionRepository`, and `AutomationCommandDispatcher`. The coordinator and runtime read repository are internal non-exported `AutomationModule` providers. They are not called by `TelemetryService`, MQTT controllers, subscribers, workers, queues, schedulers, or public endpoints. PostgreSQL remains authoritative for replay, cooldown, ancestry suppression, and action state. Automation defaults disabled and production deployment remains not approved.

## Module 11 Slice 11.9 Closure and Slice 11.10 Retry Safety Selection

Slice 11.9 is closed remote-green at `7de76596c6c1d52bd725406f3fad381cc62aedaf` / run `30983551478`. The internal telemetry coordinator remains disconnected from telemetry ingestion and MQTT. Slice 11.10 selects a PostgreSQL-authoritative retry safety foundation only. It preserves `automation:<executionId>:<actionId>`, bounds total dispatch attempts to three, treats unknown errors as non-retryable, and keeps all worker, scheduler, queue, and runtime wiring inactive.
