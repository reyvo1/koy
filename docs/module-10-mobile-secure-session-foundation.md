# Module 10 Slice 10.11 Mobile Secure Session Foundation

## Decision Status

This bounded implementation checkpoint is completed and green remotely at exact commit `0cb1cef15dc824081929baa127faca21b570cd7e` in GitHub Actions run `29824946401`. Release artifact `8492983648` was uploaded with SHA-256 `e1a0a3e8891298d4923d88af6606ab16f50ed87b72656ec15ba6ae3ef9c1773e`.

The governing contract remains `docs/module-10-mobile-foundation-dynamic-dashboard.md`. This checkpoint implements only the secure mobile session and authenticated API-client foundation permitted by that contract. At this checkpoint the visible `App.tsx` shell remained disconnected; the separately approved login UI checkpoint consumes the proven session summary without exposing token values.

## Dependency Boundary

The mobile workspace adds only the Expo SDK 57-compatible `expo-secure-store` dependency at `~57.0.1`. The Expo config plugin enables the package for generated Android and iOS development builds while preserving the single shared TypeScript workspace.

No AsyncStorage, router, state manager, analytics SDK, notification SDK, camera package, chart package, or generated `android/` or `ios/` project is introduced.

## Atomic Secure-Storage Boundary

Sensitive mobile session material is stored under one versioned SecureStore key. Access token, refresh token, and tenant selector are serialized as one bounded record so replacement uses one native key-value operation rather than independent token writes.

The adapter:

- fails closed when platform secure storage is unavailable;
- validates every record before persistence and after retrieval;
- clears malformed or partial persisted session material;
- attempts scoped cleanup when replacement fails;
- never stores credentials in AsyncStorage, public Expo configuration, plain files, logs, source code, or separate uncoordinated keys.

The tenant ID remains a selector only. The backend remains authoritative for membership and authorization.

## Authentication and API-Origin Boundary

`MobileSessionClient` accepts only relative API paths resolved against the existing validated `EXPO_PUBLIC_API_BASE_URL` origin. Absolute, protocol-relative, fragmented, or backslash-based targets are rejected before fetch.

Login:

- validates bounded email, password, and tenant-selector inputs;
- submits only to `POST /auth/login`;
- validates bounded `accessToken` and `refreshToken` strings;
- persists the complete session record only after the response is valid;
- exposes only an authenticated summary and tenant selector to callers, not token values.

Authenticated requests:

- override caller-supplied `Authorization` and `X-Tenant-Id` headers with the trusted secure-session values;
- send those headers only to the configured IoT Platform API origin;
- preserve backend `401` and `403` decisions as authoritative;
- normalize only bounded status, code, message, and request ID fields without logging raw payloads or credentials.

## Serialized Refresh and Logout Boundary

After an authenticated request receives backend `401`, the client permits one shared in-flight refresh through `POST /auth/refresh`. Concurrent requests await the same refresh promise. Successful refresh validates and replaces both tokens as one secure record before one request retry.

The client:

- clears local secure material when refresh is rejected;
- clears local secure material when a successful refresh response is malformed;
- preserves the current session when the refresh endpoint is unreachable, allowing an explicit offline state rather than treating network failure as token rejection;
- clears local secure material after a second backend `401` following successful refresh;
- does not refresh on backend `403`.

Logout attempts authenticated `POST /auth/logout` whenever a refresh token exists and always clears local secure material even when the backend is unreachable.

## Validation Boundary

Focused unit tests prove:

- one-record SecureStore persistence and malformed-record cleanup;
- unavailable-storage fail-closed behavior;
- login origin, normalization, and token validation;
- trusted authorization-header replacement;
- cross-origin path rejection;
- one serialized refresh for concurrent `401` responses;
- atomic token replacement;
- refresh rejection cleanup, malformed-refresh cleanup, and network-failure preservation;
- second-`401` cleanup after successful refresh;
- authoritative `403` handling;
- offline logout cleanup.

The completion gate performs one dependency bootstrap because the lockfile changes, checks Expo compatibility immediately afterward, validates mobile configuration and TypeScript, runs focused session tests before broader lint and one full Jest pass, validates module lifecycle, and simulates the lifecycle through Module 30.

## Explicit Exclusions

This checkpoint does not implement or approve:

- login form, navigation, session context provider, or authenticated screen orchestration;
- profile or dashboard API consumption from `App.tsx`;
- dashboard list, resolution, telemetry query, or widget rendering;
- command publication, actuator controls, or optimistic command UI;
- SSE, WebSocket, direct MQTT, push notification, or background tasks;
- barcode or QR scanning;
- CCTV, RTSP, ONVIF, stream playback, or vendor connectors;
- EAS configuration, signing credentials, store submission, or OTA policy;
- backend, Prisma, PostgreSQL, Redis, MQTT, or deployment changes;
- Module 11 activation or production deployment approval.

## Next Gate

The Indonesian-first login checkpoint is completed and remote-green. The separately approved bounded read-only dashboard checkpoint is active under `docs/module-10-mobile-read-only-dashboard-integration.md`; commands, realtime delivery, barcode, CCTV, Module 11, and production deployment remain gated.
