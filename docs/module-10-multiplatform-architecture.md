# Module 10 Multiplatform Dashboard Architecture

## Decision Status

Module 10 - Dynamic Dashboard is active after explicit owner approval and the green remote completion checkpoint for Module 09 at commit `ec4851d`.

This activation checkpoint defines architecture and delivery boundaries only. It does not add frontend dependencies, create a dashboard database model, modify Prisma migrations, implement camera protocols, activate production deployment, or begin Module 11.

## Product Surfaces

The approved client topology is:

- **Admin Web**: Next.js App Router with TypeScript.
- **User Web**: Next.js App Router with TypeScript.
- **User Mobile**: React Native with Expo development builds and TypeScript.
- **Delivery order**: Android first, while preserving an iOS-ready shared mobile codebase.
- **Backend**: the existing NestJS and Fastify application remains authoritative.

The existing backend stays at the repository root during Module 10. A large relocation into `apps/api` is not approved.

When client implementation begins, the preferred repository direction is npm workspaces with isolated applications under `apps/` and narrowly shared packages under `packages/`. Workspace creation and dependency installation require their own validated Module 10 slice.

## Surface Responsibilities

### Admin Web

The Admin Web surface is intended for authorized operational users. Its dashboard scope may expose bounded tenant-authorized summaries for devices, capabilities, telemetry, commands, health, readiness, and metrics.

Slice 10.8 reuses the existing active tenant membership role `ADMIN`; it does not invent an administrator role or bypass backend authorization. Tenant and role checks must be enforced by the NestJS/Fastify backend. The Admin Web must consume a normalized read-only operational-summary contract and must not access the service-token Prometheus endpoint directly or derive authorization from client state.

Complete tenant, membership, provisioning, ownership, credential, audit, and camera connector administration requires later explicitly approved APIs and slices.

### User Web

The User Web surface provides the room-centric and device-centric application experience for normal platform users:

- tenant-authorized device visibility;
- latest telemetry;
- bounded telemetry history;
- bounded telemetry aggregation;
- capability-driven status and control widgets;
- command status where an approved API exists;
- responsive light and dark presentation.

The UI must not expose protocol, broker, vendor, or raw infrastructure details to normal users.

### User Mobile

The mobile surface is Android-first and iOS-ready. It provides monitoring, capability-driven controls, notifications when those backend contracts exist, and future guided device onboarding.

Mobile client code must not contain permanent device credentials, MQTT broker credentials, RTSP credentials, or vendor secrets. Sensitive session material must use platform secure storage. The exact authentication integration is implemented only after the current backend auth contract is reviewed in the dedicated Module 10 auth slice.

## Dashboard Domain Boundary

Module 10 implements a capability-driven dashboard model rather than hard-coded vendor screens.

The approved conceptual hierarchy is:

```text
Dashboard
  -> Layout
      -> Widget
          -> Data source or action binding
```

A widget descriptor must be tenant-owned through its dashboard, versioned, validated, and bound only to server-authorized resources.

The initial widget vocabulary follows the Module 10 prompt:

- card;
- switch;
- gauge;
- chart;
- map;
- table;
- status.

A widget must declare enough information to validate:

- widget kind and schema version;
- title and presentation metadata;
- layout placement and size;
- device and capability binding when applicable;
- read, report, or write intent;
- supported value type;
- query configuration for latest, history, or aggregation data;
- safe display options;
- refresh behavior;
- empty, loading, stale, unauthorized, and error states.

The backend remains authoritative for device ownership, capability existence, writability, reportability, query bounds, command validation, and tenant isolation.

## Tenant, Authorization, and Security

Every dashboard, layout, widget, query, and command interaction must preserve the trusted tenant context.

Client-provided tenant IDs, device IDs, capability keys, dashboard IDs, and widget IDs are selectors only. They never establish authorization.

Required boundaries:

- authenticated access for all private dashboard operations;
- tenant membership and resource ownership checks in the backend;
- no client-only authorization decisions;
- no direct browser or mobile connection to the MQTT broker;
- no raw RTSP URL or camera credential exposed as a general dashboard value;
- no long-lived token in browser local storage;
- no secret or tenant identifier in metric labels;
- structured errors without credential or sensitive payload leakage;
- auditability for sensitive administrative actions when the audit contract is introduced.

Production deployment remains separately controlled and NOT APPROVED.

## Observability and Reliability

Client applications must propagate the backend request or correlation identifier when supported and surface safe retryable errors.

Module 10 observability must cover, without high-cardinality tenant labels:

- dashboard API request count and duration;
- widget resolution success and failure;
- invalid dashboard or widget schema;
- rejected cross-tenant access;
- rejected capability binding;
- bounded telemetry query outcomes;
- command initiation outcomes;
- client bootstrap and recoverable rendering failures.

Dashboard rendering must define loading, empty, stale, unauthorized, offline, and error states. A failed widget must not make the whole dashboard unusable.

## CCTV and Barcode Compatibility Boundary

CCTV, ONVIF, RTSP, vendor camera connectors, stream gateways, and the normalized camera domain remain future roadmap work. Module 10 must remain extensible for those capabilities without implementing them prematurely.

A future camera experience may add camera-grid, camera-status, and camera-live widgets only after a normalized camera and media-session contract is approved.

The following are prohibited during the Module 10 activation checkpoint:

- direct RTSP playback logic in generic dashboard code;
- ONVIF or vendor SDK integration;
- storage of camera passwords in dashboard or widget configuration;
- exposing raw stream credentials to web or mobile clients;
- treating QR or barcode scanning as a universal camera protocol;
- activating a device solely because a code was scanned.

Future QR or barcode onboarding is an entry point to a server-validated guided workflow. A scanned code must be resolved through the appropriate adapter or connector, tenant checks, authentication or pairing, capability discovery, normalized device registration, and location assignment.

## Realtime Boundary

Web and mobile clients do not subscribe directly to device MQTT topics.

A future SSE or WebSocket delivery adapter may be introduced behind authenticated tenant-isolated backend contracts. The transport decision requires a separate Module 10 slice and must not change the normalized telemetry, command, or camera domains.

## Shared Code Boundary

Future shared packages may contain:

- generated or curated API contracts;
- API client primitives;
- authentication and tenant-context client adapters;
- telemetry and dashboard value models;
- validation helpers;
- design tokens;
- test utilities.

Web React components and React Native components are not assumed to be interchangeable. Sharing should focus on contracts, models, tokens, and behavior rather than forcing one UI implementation across platforms.

## Accessibility and Internationalization

The web and mobile surfaces must support keyboard or assistive navigation appropriate to each platform, visible focus states, sufficient contrast, semantic labels, scalable text, and reduced-motion behavior.

User-facing text must be structured for Indonesian and English localization. Protocol and vendor terminology should remain outside the normal user experience unless operationally necessary.

## Approved Module 10 Slice Sequence

1. **10.0 Activation and Multiplatform Architecture Contract** - completed at `4ada560`.
2. **10.1 Dashboard Domain and Schema Proposal** - completed; binding decision in `docs/module-10-dashboard-domain-schema-proposal.md`.
3. **10.2 Dashboard Persistence Foundation** - completed and green remotely at `401d52a`; normalized Prisma models, additive migration, repository transaction contract, and PostgreSQL integration proof.
4. **10.3 Tenant-Isolated Dashboard API** - completed and green remotely at `06325f1`; bounded authenticated CRUD, server-derived ownership, and PERSONAL/TENANT_SHARED authorization.
5. **10.4 Capability-Driven Widget Resolution** - completed and green remotely at `253c6ee`; card, switch, gauge, chart, map, table, and status validation with a safe resolution plan.
6. **10.5 Telemetry Widget Query Integration** - completed and green remotely at `1306238`; tenant-isolated per-widget latest, history, aggregation, and device-status execution using existing bounded APIs.
7. **10.6 Web Workspace and Design-System Foundation** - implemented after remote-green Slice 10.5 commit `1306238`; explicit npm workspaces, Admin Web and User Web shells, and shared accessible design-system primitives without moving the backend.
8. **10.7 User Web Dynamic Dashboard** - completed and green remotely at completion checkpoint `717ea9f` in GitHub Actions run `29694607680`; authenticated tenant-authorized read-only dashboard.
9. **10.8 Admin Web Operational Dashboard Backend Foundation** - backend operational-summary foundation and HTTP/PostgreSQL tenant-isolation proof completed and green remotely at `53ec5c1` in GitHub Actions run `29716215821`.
10. **10.9 Admin Web Operational Dashboard UI Proposal** - completed and green remotely at `658f020` / run `29725053250`; proposal-only same-origin session, read-only summary, state, security, accessibility, and validation contract.
11. **Module Execution Kit v1.0.3 prerequisite** - completed and green remotely at `935c30e` / run `29741100028`; repository-standard exact-file disposable-worktree proof.
12. **10.10 Admin Web Operational Dashboard UI Foundation** - completed and green remotely at `f4195f8` / run `29766694450`; bounded read-only Next.js implementation consuming only the normalized summary endpoint.
13. **10.11 Mobile Foundation and Dynamic Dashboard** - active contract checkpoint after explicit owner approval and exact-SHA remote-green audit-fix evidence; Android-first and iOS-ready React Native with Expo development builds. Runtime implementation remains separately gated.
14. **10.12 Barcode and CCTV UI Compatibility Contract** - UI entry points and extension boundaries only; no camera protocol implementation.
15. **10.13 Security, Observability, Accessibility, and End-to-End Review**.
16. **10.14 Module 10 Completion Review**.

Each slice must read the source of truth, make the smallest coherent change, validate according to risk, update documentation, and commit locally. Module 11 remains inactive until Module 10 is completed and explicitly approved.

## Activation Checkpoint Validation Boundary

This checkpoint changes lifecycle metadata, documentation, and contract tests only.

It intentionally leaves unchanged:

- application runtime behavior;
- Prisma schema and migrations;
- production and development dependencies;
- MQTT and Redis behavior;
- telemetry and command contracts;
- camera and barcode runtime behavior;
- production deployment approval.

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

Dashboard integration, routing frameworks, command behavior, realtime delivery, notifications, barcode, CCTV, Module 11, and production deployment remain separately gated.

<!-- MODULE-10-MOBILE-LOGIN-UI-FOUNDATION:END -->

## Active Slice 10.11 Mobile Read-Only Dashboard Integration

The binding implementation record is `docs/module-10-mobile-read-only-dashboard-integration.md`. Mobile Login UI Foundation commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8` is confirmed green in GitHub Actions run `29831494195`; release artifact `8495556056` was uploaded with SHA-256 `cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1`.

This checkpoint connects only tenant-authorized dashboard listing, selected aggregate and resolution reads, bounded read-only per-widget telemetry queries, accessible dashboard selection, refresh, and read-only widget rendering through the existing secure-session client. It adds no dependency and changes no backend, schema, database, MQTT, Redis, or CI workflow.

Dashboard mutation, command behavior, realtime delivery, notifications, barcode, CCTV, routing frameworks, Module 11, and production deployment remain separately gated.

<!-- MODULE-10-SLICE-10.13-REVIEW-CLOSURE:START -->

## Module 10 Slice 10.13 Review Closure

The binding review record is `docs/module-10-security-observability-accessibility-e2e-review.md`. Lifecycle-selection commit `259a6ed8348fe269a1de7ea42781b2e981086dc7` is confirmed remote-green in GitHub Actions run `30541648080` with 107/107 Jest suites and 755/755 tests.

The owner-approved read-only review found no repository-level runtime blocker across the established security, observability, accessibility, and layered integration/end-to-end boundaries. The review explicitly retains the absence of automated browser and native-device user-journey coverage and does not claim formal security certification, WCAG conformance, or deployment readiness.

This checkpoint adds documentation, lifecycle metadata, and one contract test only. It does not change application runtime behavior, dependencies, lockfiles, schema, migrations, PostgreSQL, Redis, MQTT, CI, security or tenant boundaries, barcode/CCTV runtime, or deployment configuration.

Slice 10.14 remains inactive. Module 11 remains inactive, and production deployment remains NOT APPROVED pending separate approvals.

<!-- MODULE-10-SLICE-10.13-REVIEW-CLOSURE:END -->
