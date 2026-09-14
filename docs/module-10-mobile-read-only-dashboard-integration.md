# Module 10 Slice 10.11 Mobile Read-Only Dashboard Integration

## Decision Status

This bounded implementation checkpoint is active after explicit owner approval and exact-SHA remote-green evidence for Mobile Login UI Foundation commit `9880a3e098ab98cf217dd45e7f87ff67714ccce8` in GitHub Actions run `29831494195`. Release artifact `8495556056` was uploaded with SHA-256 `cacdae2ab794172efc4f650d1a14f50269c7d464437ef065d8b824e58854e2d1`.

The governing contracts remain `docs/module-10-mobile-foundation-dynamic-dashboard.md`, `docs/module-10-mobile-secure-session-foundation.md`, and `docs/module-10-mobile-login-ui-foundation.md`. This checkpoint connects only the existing authenticated mobile shell to the already-authorized read-only dashboard APIs.

## Dependency and Architecture Boundary

No dependency, lockfile, backend, Prisma, PostgreSQL, Redis, MQTT, CI-workflow, or deployment change is introduced. The implementation uses React and React Native primitives already present in `apps/user-mobile`.

The NestJS/Fastify backend remains authoritative for tenant ownership, membership, dashboard visibility, capability resolution, telemetry query bounds, stale classification, authorization, and token refresh. Mobile code does not duplicate those domain decisions and does not connect directly to MQTT, Redis, PostgreSQL, camera protocols, or vendor APIs.

## Read-Only API Sequence

After a secure authenticated session exists, the mobile client performs only this bounded sequence:

1. `GET /dashboards?limit=50`;
2. select the requested visible dashboard or the first visible dashboard;
3. concurrently read `GET /dashboards/:dashboardId` and `GET /dashboards/:dashboardId/resolution`;
4. verify dashboard ID, schema version, revision, widget identity, and widget kind consistency;
5. read `GET /dashboards/:dashboardId/widgets/:widgetId/data` only for widgets resolved as `READY`;
6. execute at most four widget-data requests concurrently.

`INVALID` and `UNSUPPORTED` widgets do not trigger telemetry requests. One non-authorization widget-data failure becomes a bounded widget error and does not discard other widgets. A `401` expires the local UI session state; a `403` remains a bounded tenant-authorized shell warning.

## Fail-Closed Response Boundary

Mobile parsers accept only bounded normalized fields. They reject malformed identifiers, enums, timestamps, revisions, counts, oversized lists, oversized presentation/query/data objects, inconsistent dashboard versions, and mismatched widget responses.

Raw backend messages, stack traces, tokens, credentials, MQTT topics, infrastructure payloads, and unbounded arbitrary objects are never rendered. The UI may display only a stable local reason code and a bounded request ID supplied by the existing session client.

## Accessible Read-Only Presentation

The authenticated shell now provides:

- dashboard selection from the authorized list;
- explicit loading, empty, offline, unauthorized, invalid-response, and retry states;
- mobile layout ordering based on the normalized MOBILE layout;
- read-only CARD, GAUGE, CHART, TABLE, STATUS, and bounded SWITCH presentation;
- an explicit disabled-control message for SWITCH widgets because command execution is not active;
- fail-closed MAP presentation until an approved mobile map dependency and coordinate contract exist;
- accessible headers, buttons, summaries, progress semantics, scalable text, and automatic light/dark appearance.

The application does not fabricate devices, telemetry, command success, connectivity, or sample data.

## Session and Refresh Boundary

All requests delegate to the existing `MobileSessionClient`, which preserves secure token storage, tenant headers, one serialized refresh, safe 401/403 handling, and local logout cleanup. Dashboard modules receive no token values.

If refresh cannot preserve an authenticated session, the application clears dashboard state and returns to the Indonesian-first login screen with a bounded session-expired notice.

## Validation Boundary

This checkpoint uses the STANDARD risk profile because dependencies, lockfile, backend runtime, database, CI workflow, and security primitives do not change.

The local completion gate runs:

1. changed-source Prettier check;
2. Module Execution Kit source check and self-test;
3. Expo public-configuration validation;
4. mobile TypeScript validation;
5. focused dashboard-client, dashboard-controller, auth-controller, and secure-session tests;
6. repository non-mutating lint;
7. Module 10 suites;
8. lifecycle validation and simulation through Module 30;
9. exact changed-path and payload-hash audit;
10. a local commit with no automatic push.

It intentionally does not run `npm ci`, Prisma generation, or full Jest locally because the installed dependency graph and backend/shared runtime are unchanged. A cheap Expo-binary preflight must run before mutation. GitHub Actions remains the full remote-green gate after explicit push approval.

## Explicit Exclusions

This checkpoint does not implement or approve:

- dashboard create, replace, delete, layout editing, or widget editing;
- profile, membership, tenant, device, or capability mutation;
- command publication, actuator controls, optimistic command UI, or write bindings;
- SSE, WebSocket, direct MQTT, push notification, or background tasks;
- offline telemetry persistence or synchronization;
- barcode or QR scanning;
- CCTV, RTSP, ONVIF, playback, mapping SDKs, or vendor connectors;
- routing frameworks, deep links, generated native projects, EAS distribution, signing, store submission, or OTA policy;
- Module 11 activation or production deployment approval.

## Next Gate

No later checkpoint is activated by this document. The next scope must be selected from current repository documentation only after this exact implementation commit is green remotely and the owner explicitly approves the bounded next step. Module 11 and production deployment remain inactive.

<!-- M10S11-ANDROID-NATIVE-PROOF-PREPARATION:START -->

## Android Native Development-Build Proof Preparation

The repository now records the owner-approved Android application ID
com.reyvo.iotplatform and the Expo SDK 57-compatible expo-system-ui dependency
~57.0.1.

This checkpoint prepares, but does not claim, native Android development-build
success. The next gate remains one bounded development build and launch proof
on the single authorized physical Android device.

No dashboard mutation, command, realtime, notification, barcode/QR,
CCTV/RTSP/ONVIF, Slice 10.12, Module 11, or production deployment scope is
activated.
<!-- M10S11-ANDROID-NATIVE-PROOF-PREPARATION:END -->

<!-- M10S11-CI-CONTRACT-RECONCILIATION:START -->

## CI Contract Reconciliation

The Android native-proof preparation added the approved
expo-system-ui dependency at ~57.0.1. The existing mobile workspace
foundation contract still asserted the earlier exact dependency object, so the
remote full Jest run correctly failed one deterministic contract test.

This checkpoint reconciles that existing foundation contract with the approved
dependency set. It does not add or upgrade dependencies, alter runtime behavior,
change architecture, perform a native build, activate Slice 10.12, activate
Module 11, or approve production deployment. Remote-green validation remains
pending after this local correction.
<!-- M10S11-CI-CONTRACT-RECONCILIATION:END -->

<!-- M10S11-ANDROID-NATIVE-DEVELOPMENT-BUILD-PROOF:START -->

## Android Native Development-Build Proof

An Android debug development build previously compiled successfully and was resumed for installation from
remote-green source commit 24e8b2f31dfb6c88c186f40aa681d25ed4329c15 on the authorized physical device
2312DRA50G (3a8ebb16). The package com.reyvo.iotplatform launched through
Metro over USB, remained alive, and was verified as the foreground activity.
Screenshot and application logcat evidence were captured. This closes only the
native proof gate for Slice 10.11. Slice 10.12, Module 11, and production
deployment remain inactive or unapproved.
<!-- M10S11-ANDROID-NATIVE-DEVELOPMENT-BUILD-PROOF:END -->

<!-- M10S12-LIFECYCLE-CONTRACT-PREREQUISITE:START -->

## Slice 10.12 Lifecycle Contract Prerequisite

The owner explicitly approved Module 10 Slice 10.12 after revert commit
`ad00d4ebcbb42daa5ed781991fa4d77a3d8c82e0` restored the repository tree to
the proven Slice 10.11 remote-green content. GitHub Actions run `30357014696`
confirmed 105/105 Jest suites and 741/741 tests.

Before selecting Slice 10.12 as the mutable active lifecycle checkpoint, the
historical Module 10 contract tests are hardened so they verify their own
immutable checkpoint documents instead of freezing the current active slice or
current lifecycle evidence. Generated Android and iOS proof directories are
validated against the tracked repository boundary because those native project
directories are intentionally ignored and may remain in a local worktree.

This prerequisite changes contract tests and documentation only. It does not
select Slice 10.12 in lifecycle metadata, change application runtime, add or
upgrade dependencies, change Prisma, PostgreSQL, Redis, MQTT, or native project
contents, activate Module 11, approve production deployment, or push a commit.
Slice 10.12 lifecycle selection remains the next bounded step after this
prerequisite commit is confirmed remote-green.
<!-- M10S12-LIFECYCLE-CONTRACT-PREREQUISITE:END -->
