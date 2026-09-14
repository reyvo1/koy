# Module 10 Slice 10.11 Mobile Foundation and Dynamic Dashboard Contract

## Decision Status

This contract checkpoint is completed and confirmed green remotely at exact commit `2ef81f55cac2396395986bd0db19f555f97381a5` in GitHub Actions run `29807634502`. Release artifact `8486153827` was uploaded with SHA-256 `8c997ce3f0ccfcf8bf993892a7c7b8f3ade0685a587add87206f031add6e058f`.

The contract remains binding for every Slice 10.11 implementation checkpoint. `docs/module-10-mobile-workspace-foundation.md` records the completed isolated Expo workspace, and `docs/module-10-mobile-secure-session-foundation.md` records the separately approved secure session and authenticated API-client checkpoint after workspace audit-fix commit `d946c741aa488178f692b5c6b9bcf66ab5ab70f2` became green in GitHub Actions run `29819923410`.

Login UI, authenticated screen orchestration, dashboard data, widget rendering, commands, realtime delivery, CCTV, barcode scanning, Module 11, and production deployment remain separately gated.

## Existing Proven Boundary

The repository already provides:

- an authoritative NestJS and Fastify backend at the repository root;
- authenticated tenant context through the existing JWT and membership flow;
- bounded `GET /users/profile` access;
- bounded dashboard list and aggregate APIs;
- capability-driven widget resolution;
- bounded per-widget telemetry data queries;
- a completed authenticated read-only User Web dashboard that proves the backend sequence and safe UI states;
- npm workspaces for the two web applications and the shared web design-system package.

The mobile implementation must reuse backend contracts rather than create a mobile-only authorization or data model.

## Approved Mobile Topology

The implementation checkpoint may add one isolated npm workspace at `apps/user-mobile` using:

- React Native;
- Expo development builds rather than Expo Go as the production-grade development target;
- TypeScript;
- Android-first delivery;
- an iOS-ready shared codebase;
- platform-native accessibility semantics;
- Indonesian-first user-facing copy with English localization readiness.

The existing backend remains authoritative and stays at the repository root. Web React components and React Native components are not assumed to be interchangeable. Shared code is limited to stable contracts, value models, validation helpers, tokens, and test utilities after a separate exact-file review.

No routing library, state-management library, chart library, notification service, analytics SDK, or native module is approved merely by this contract. Exact packages and versions must be content-addressed in the implementation manifest and justified by the approved boundary.

## Secure Mobile Session Boundary

Sensitive session material must use platform secure storage. The implementation may use the Expo-supported secure-storage adapter selected during dependency pinning, but it must not store access tokens, refresh tokens, tenant selectors, device credentials, broker credentials, camera credentials, or vendor secrets in AsyncStorage, plain files, logs, environment-derived public config, or source code.

The mobile session adapter must:

- submit email, password, and tenant selector to backend `POST /auth/login`;
- validate the returned `accessToken` and `refreshToken` before persistence;
- send `Authorization: Bearer ...` and `X-Tenant-Id` only to the configured IoT Platform API origin;
- permit one serialized refresh attempt through backend `POST /auth/refresh` after a backend `401`;
- replace both tokens atomically after successful refresh;
- clear local session material after refresh rejection, logout, malformed token responses, or explicit user sign-out;
- call backend `POST /auth/logout` when a refresh token exists while still clearing local secure storage if the backend is unreachable;
- preserve backend `401` and `403` decisions as authoritative;
- never infer authorization from a screen, route, stored tenant ID, local role, or cached profile.

The tenant ID is a selector only. Trusted tenant membership remains server-authoritative.

## API-Origin Boundary

The implementation must use one validated API base URL supplied through Expo public configuration. The configured origin must use HTTPS except for an explicitly detected loopback development host. Public application configuration must not contain secrets.

The mobile client must never connect directly to:

- MQTT or MQTT over TLS brokers;
- Redis;
- PostgreSQL;
- Prometheus metrics endpoints or service-token routes;
- RTSP, ONVIF, camera gateways, or vendor APIs.

Request and error handling may surface only safe status, normalized error code, user-facing message, and request ID. Credentials, raw payloads, tenant IDs, and high-cardinality resource identifiers must not be written to logs or analytics.

## Approved Read-Only Dashboard Flow

After authentication, the mobile application may consume only the existing bounded sequence:

1. `GET /users/profile`;
2. `GET /dashboards?limit=50`;
3. `GET /dashboards/:dashboardId`;
4. `GET /dashboards/:dashboardId/resolution`;
5. `GET /dashboards/:dashboardId/widgets/:widgetId/data` for READY widgets only.

The implementation must preserve the existing per-widget bounded query behavior and must not broaden list limits, bypass resolution, issue unbounded telemetry queries, or create a mobile-only aggregate endpoint.

The first mobile renderer is read-only:

- `CARD` is supported;
- `GAUGE` is supported;
- `CHART` is supported through a bounded accessible representation;
- `TABLE` is supported through a bounded accessible representation;
- `STATUS` is supported;
- `SWITCH` remains command-deferred and must render as unavailable or unsupported without publishing a command;
- `MAP` remains fail-closed until a coordinate semantic contract is separately approved.

Dashboard and widget selectors never establish authorization. The backend remains authoritative for ownership, tenant isolation, membership, dashboard audience, capability access, resolution state, and telemetry query bounds.

## Required Interface States

The implementation must provide explicit and testable states for:

- loading;
- unauthenticated;
- unauthorized;
- empty;
- stale;
- offline;
- error;
- ready;
- invalid widget;
- unsupported widget.

Retry may repeat only authenticated read-only requests. The UI must not fabricate sample devices, sample telemetry, command success, inferred health, or connectivity state that is absent from normalized backend responses.

Stale state must be derived from backend timestamps and approved thresholds. Offline state means the API cannot be reached; it must not be presented as device offline unless the backend says so.

## Accessibility and Localization Boundary

The mobile implementation must preserve:

- semantic accessibility labels and roles;
- logical screen-reader traversal;
- sufficient contrast;
- scalable text without clipping critical values;
- touch targets appropriate to the platform;
- reduced-motion behavior;
- status meaning that does not rely on color alone;
- readable timestamps and numeric values;
- Indonesian as the default user-facing language;
- centralized copy ready for English localization.

## Explicit Exclusions

This Slice 10.11 contract does not approve:

- command publication or actuator controls;
- provisioning, ownership, membership, or credential mutation;
- realtime SSE, WebSocket, or direct MQTT subscriptions;
- push notifications;
- background tasks;
- barcode or QR scanning;
- CCTV, RTSP, ONVIF, stream playback, or vendor camera connectors;
- offline telemetry persistence or synchronization;
- biometric login;
- EAS production builds, store submission, over-the-air update policy, or signing credentials;
- Prisma schema or migration changes;
- backend runtime changes;
- Module 11 activation;
- production deployment approval.

## Implementation File Boundary

A separately approved implementation checkpoint within Slice 10.11 may change only:

- `apps/user-mobile/**`;
- root workspace and lockfile entries required for the exact mobile dependency set;
- narrowly justified shared contract files under a separately allowlisted package path;
- focused Module 10 mobile contract and unit tests;
- lifecycle and binding documentation;
- validation profiles only when the existing profiles cannot prove the mobile workspace without weakening current gates.

The implementation must not relocate the backend, reuse web-only server modules in React Native, or broadly refactor completed web applications.

## Implementation Validation Contract

The later implementation checkpoint must run at least:

- Module Execution Kit doctor before mutation;
- exact payload hash and path verification;
- clean dependency bootstrap;
- Expo public-config validation;
- mobile TypeScript validation;
- mobile-focused unit and contract tests;
- lint and formatting checks for changed source;
- existing Module 10 contract suites;
- full Jest suite;
- module lifecycle validation and simulation;
- disposable-worktree commit proof;
- bounded post-apply verification;
- exact-SHA GitHub Actions confirmation before any later slice.

Native Android development-build proof is required before Slice 10.11 implementation closure. iOS source compatibility must be preserved, but an App Store build, Apple signing, and production distribution are not approved.

## Contract Checkpoint Change Boundary

The completed contract commit changed lifecycle metadata, binding documentation, Module 10 guidance, and contract tests only. The later workspace-foundation checkpoint is documented separately and does not broaden this contract.

## Current Implementation Sequence

- Mobile contract: completed and remote-green at `2ef81f5`.
- Mobile workspace foundation: completed and remote-green through `d946c74`.
- Mobile secure session foundation: completed and remote-green at `0cb1cef15dc824081929baa127faca21b570cd7e` / run `29824946401`.
- Mobile login UI foundation: completed and remote-green at `9880a3e098ab98cf217dd45e7f87ff67714ccce8` / run `29831494195`.
- Mobile read-only dashboard integration: active under `docs/module-10-mobile-read-only-dashboard-integration.md`.

The active dashboard checkpoint may consume only tenant-authorized dashboard list, aggregate, resolution, and read-only widget-data APIs through the proven secure-session client. Commands, realtime delivery, barcode, CCTV, Module 11, and production deployment remain gated.
