# Module 10 Slice 10.11 Mobile Workspace Foundation

## Decision Status

This implementation checkpoint is completed. Implementation commit `24eda56fc5b384a80a2b1c736021d9f9b76fb62e` and portability audit-fix commit `d946c741aa488178f692b5c6b9bcf66ab5ab70f2` are confirmed green in GitHub Actions run `29819923410`. Release artifact `8490998211` was uploaded with SHA-256 `e40baa357f499635011b87155f1f2fba558cd2659310825f6d36e1e020910713`.

The binding contract remains `docs/module-10-mobile-foundation-dynamic-dashboard.md`. This checkpoint implemented only the workspace foundation permitted by that contract. Secure mobile session behavior is a separate active checkpoint documented in `docs/module-10-mobile-secure-session-foundation.md`.

## Implemented Workspace Boundary

The repository adds one isolated npm workspace at `apps/user-mobile` with the following exact dependency set:

- Expo `57.0.7`;
- Expo development client `57.0.7`;
- React Native `0.86.0`;
- React `19.2.3`;
- TypeScript `6.0.3`;
- React type definitions `~19.2.4`, resolved by the lockfile to a compatible `19.2.x` release.

The workspace is Android-first and preserves one iOS-ready TypeScript codebase. It uses Expo development-client commands rather than treating Expo Go as the production-grade development target.

No router, state-management library, chart library, localization framework, secure-storage adapter, notification SDK, analytics SDK, or additional native module is introduced by this checkpoint.

## Public API-Origin Foundation

`EXPO_PUBLIC_API_BASE_URL` is the only public API-origin input. The app configuration:

- validates an absolute URL;
- rejects embedded credentials;
- rejects paths, queries, and fragments;
- requires HTTPS except for explicit loopback development hosts;
- exposes only the normalized origin through Expo public configuration;
- defaults to `http://127.0.0.1:3000` only for local development when the variable is absent.

Public configuration contains no token, tenant membership, device credential, broker credential, camera credential, or vendor secret. The shell does not make network requests yet.

## Development Shell

The first runtime source is an accessible static shell only. It provides:

- Indonesian-first copy;
- an English-ready typed message dictionary without adding a localization dependency;
- automatic light and dark appearance handling;
- a semantic heading and explicit non-connected status;
- no fabricated telemetry, device state, command result, or connectivity claim.

The shell does not authenticate, select a tenant, call the backend, render dashboards, publish commands, or connect to infrastructure.

## Repository Integration

The root workspace list now includes `apps/user-mobile`. Root validation scripts expose:

- `mobile:config:validate`;
- `mobile:typecheck`;
- `mobile:validate`.

The existing CI-invoked `web:typecheck` script retains all prior web checks and then runs the mobile configuration and TypeScript validation. This adds mobile proof without changing the GitHub Actions workflow or weakening existing gates.

The Module Execution Kit adds a dedicated `module-10-mobile-workspace` validation profile. Because this checkpoint changes dependencies and the lockfile, it performs one clean dependency bootstrap. Expo dependency compatibility runs immediately afterward so version drift fails before broader validation. Prisma generation, public-config validation, mobile TypeScript validation, repository lint, one full Jest run, lifecycle validation, and lifecycle simulation then provide the completion gate. Separate Module 10 and contract-suite runs are intentionally omitted because the full Jest run already includes them.

## Explicit Exclusions

This checkpoint does not approve or implement:

- login, refresh, logout, or secure token persistence;
- `expo-secure-store` or any session adapter;
- dashboard list, resolution, telemetry query, or widget renderer;
- command publication, actuator controls, or optimistic command UI;
- SSE, WebSocket, direct MQTT, push notification, or background task behavior;
- barcode or QR scanning;
- CCTV, RTSP, ONVIF, stream playback, or vendor connectors;
- EAS configuration, signing credentials, store submission, or OTA policy;
- generated `android/` or `ios/` directories;
- backend, Prisma, PostgreSQL, Redis, MQTT, or deployment changes;
- Module 11 activation or production deployment approval.

## Next Gate

The secure mobile session boundary is completed and green remotely at `0cb1cef15dc824081929baa127faca21b570cd7e` / run `29824946401`. Its binding implementation record is `docs/module-10-mobile-secure-session-foundation.md`. The next approved checkpoint is the bounded login and authenticated-shell orchestration in `docs/module-10-mobile-login-ui-foundation.md`.

Native Android development-build proof remains required before Slice 10.11 implementation closure. It is not claimed by this workspace-foundation checkpoint.
