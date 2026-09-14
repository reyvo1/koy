# Module 10 Slice 10.11 Mobile Login UI Foundation

## Decision Status

This bounded implementation checkpoint is completed and green remotely at exact commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8` in GitHub Actions run `29831494195`. Release artifact `8495556056` was uploaded with SHA-256 `cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1`.

The governing contracts remain `docs/module-10-mobile-foundation-dynamic-dashboard.md` and `docs/module-10-mobile-secure-session-foundation.md`. This checkpoint connects only an Indonesian-first login experience, secure-session restoration, an authenticated tenant shell, and logout orchestration to the existing session client.

## Dependency and Architecture Boundary

No dependency, lockfile, backend, Prisma, PostgreSQL, Redis, MQTT, CI-workflow, or deployment change is introduced. The implementation uses React and React Native primitives already present in `apps/user-mobile`.

No router, session-context package, state manager, form library, localization framework, analytics SDK, notification SDK, camera package, chart package, generated `android/` or `ios/` project, or EAS configuration is added.

The backend remains authoritative for credential validation, tenant membership, authorization, refresh rejection, and logout semantics.

## Startup and Session-Restoration Boundary

`App.tsx` starts in a bounded booting state and asks `MobileSessionClient` only for the non-sensitive session summary. A valid secure session opens the authenticated shell with the tenant selector. An absent session opens the login form.

Secure-storage failures remain fail-closed. The UI does not fall back to AsyncStorage, plain files, public Expo configuration, or fabricated authenticated state. The blocking state provides an explicit retry without exposing token values or native error payloads.

## Indonesian-First Login Boundary

The visible login form accepts only:

- tenant ID;
- email;
- password.

The form:

- uses accessible labels and semantic controls;
- disables duplicate submission while authentication is pending;
- clears password component state immediately when submit begins;
- delegates input bounds, origin validation, response parsing, and secure persistence to the already-proven `MobileSessionClient`;
- maps invalid credentials, rate limiting, offline API state, invalid input, and secure-storage failure to bounded Indonesian messages;
- may display only a bounded request ID and never raw backend payloads, credentials, access tokens, or refresh tokens.

No automatic retry is performed for credential rejection or rate limiting.

## Authenticated Shell and Logout Boundary

At this completed checkpoint the authenticated shell displayed only secure-session status, the active tenant selector, an explicit logout action, and a statement that dashboard data was not connected yet. The separately approved read-only dashboard integration may now compose around that shell without changing the login form, credential handling, secure-session storage, or logout semantics.

Logout delegates to the existing session client. Backend unavailability does not prevent mandatory local secure cleanup. If local secure cleanup itself fails, the application enters the blocking state rather than claiming the session ended.

## Accessibility and Localization Boundary

Indonesian remains the default user-facing language and a typed English copy set remains available without a new localization dependency. The UI supports automatic light/dark appearance, scalable text, keyboard-adjusted scrolling, explicit busy/disabled accessibility state, semantic headers, alerts, and buttons, and does not rely on color alone for state meaning.

## Validation Boundary

This checkpoint uses the STANDARD risk profile because dependencies, lockfile, backend runtime, database, CI workflow, and security primitives do not change.

The local completion gate runs:

1. Expo public-configuration validation;
2. mobile TypeScript validation;
3. focused secure-session, auth-controller, and contract tests;
4. repository non-mutating lint;
5. Module 10 suites;
6. lifecycle validation and simulation through Module 30;
7. exact changed-path and file-hash audit;
8. a local commit with no automatic push.

It intentionally does not run `npm ci`, Prisma generation, or full Jest because the installed dependency graph and backend/shared runtime are unchanged. GitHub Actions remains the full remote-green gate after explicit push approval.

## Explicit Exclusions

This checkpoint does not implement or approve:

- profile or dashboard API consumption;
- dashboard selection, resolution, telemetry query, or widget rendering;
- routing framework or deep-link orchestration;
- command publication, actuator controls, or optimistic command UI;
- SSE, WebSocket, direct MQTT, push notification, or background tasks;
- barcode or QR scanning;
- CCTV, RTSP, ONVIF, playback, or vendor connectors;
- registration, forgot-password, reset-password, or tenant switching;
- EAS distribution, signing, store submission, or OTA policy;
- Module 11 activation or production deployment approval.

## Next Gate

Those conditions are now satisfied. The bounded read-only dashboard checkpoint is active under `docs/module-10-mobile-read-only-dashboard-integration.md`. Commands, realtime delivery, barcode, CCTV, Module 11, and production deployment remain separately gated.
