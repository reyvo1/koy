# Module 10 Slice 10.7 User Web Dynamic Dashboard

## Decision Status

Slice 10.7 is completed. The dashboard runtime was committed at `86b75fe`; the single-flight session-refresh correction was committed at `b0c5b8e`; GitHub Actions run `29692620905` confirmed the runtime checkpoint green; and documentation completion checkpoint `717ea9f` was confirmed green in GitHub Actions run `29694607680`.

This slice turns the User Web shell into a responsive, authenticated, tenant-authorized, read-only dynamic dashboard. It consumes the existing dashboard, widget-resolution, and per-widget telemetry endpoints through a same-origin Next.js server boundary. It does not publish commands, add realtime transport, modify backend authorization, create Admin Web or mobile features, implement CCTV or barcode runtime, activate Module 11, or approve production deployment.

## Authentication and Session Boundary

The browser submits login credentials only to the User Web route handler. The route handler calls the existing backend `POST /auth/login` contract and stores access, refresh, and selected-tenant values in `HttpOnly`, `SameSite=Lax` cookies. Tokens are never returned to client JavaScript and are not stored in local storage or session storage.

The server-only API adapter:

- uses `IOT_API_BASE_URL` and permits plain HTTP only for loopback development hosts;
- sends bearer authorization and `X-Tenant-Id` only from the server boundary;
- rotates the refresh token through the existing backend refresh contract;
- serializes concurrent unauthorized responses through one in-flight refresh and retries with the latest access token, preventing self-triggered refresh-token reuse;
- clears cookies when the session is unauthorized;
- keeps browser clients disconnected from MQTT and infrastructure credentials.

## Dashboard Read Model

The same-origin `GET /api/dashboard` route loads:

1. the authenticated user profile;
2. at most fifty readable personal or tenant-shared dashboard summaries;
3. the selected dashboard aggregate;
4. its server-authoritative widget resolution;
5. per-widget data with concurrency bounded to four requests.

A failed widget is converted into a safe widget error and does not make another widget or the entire dashboard unusable. Cross-tenant selectors remain non-authoritative because every backend call still passes through JWT and trusted tenant-context guards.

## Rendering Boundary

No normalized room domain exists in the backend, so this slice does not invent client-only room authorization. The responsive renderer uses persisted dashboard layouts and device-capability bindings and supports:

- CARD values;
- GAUGE values with normalized bounds and units;
- CHART history or aggregation samples without adding a chart dependency;
- TABLE binding summaries;
- STATUS values;
- loading, empty, stale, unauthorized, offline, invalid, unsupported, and error states.

SWITCH remains visibly read-only because command execution is deferred. MAP remains fail-closed because coordinate semantics are not approved. The User Web does not expose commands, MQTT, RTSP, ONVIF, camera credentials, vendor secrets, or raw infrastructure details.

The default user-facing language is Indonesian while component structure remains ready for a later bounded localization package.

## Validation Evidence

The slice is validated through:

- User Web and design-system TypeScript checks;
- User Web production build;
- focused contract coverage for server-only session handling, single-flight refresh-token rotation under concurrent unauthorized responses, tenant headers, bounded widget fan-out, all widget kinds, state isolation, accessibility, localization readiness, and deferred boundaries;
- lifecycle validation and simulation;
- GitHub Actions run `29692620905` on runtime commit `b0c5b8e` and run `29694607680` on documentation completion checkpoint `717ea9f`, including 83 Jest suites / 618 tests, E2E smoke, PostgreSQL integration, MQTT workflow and TLS publisher integration, recovery, coverage, release verification, and production startup smoke;
- existing green backend, database, MQTT, recovery, release, and production-startup evidence where the related risk surface is unchanged.

## Deferred Work

At the Slice 10.7 completion checkpoint, Slice 10.8 Admin Web Operational Dashboard was selected as a documentation and contract activation checkpoint. That historical activation state was superseded by the remote-green backend operational-summary foundation at `53ec5c1` / GitHub Actions run `29716215821`, the remote-green Slice 10.9 proposal at `658f020` / run `29725053250`, the remote-green Module Execution Kit v1.0.3 checkpoint at `935c30e` / run `29741100028`, and the remote-green Slice 10.10 Admin Web UI at `f4195f8` / run `29766694450`.

Still deferred:

- command publication and acknowledgement rendering;
- SSE or WebSocket delivery;
- Admin Web write operations and operational resource drill-down;
- mobile workspace;
- CCTV, ONVIF, RTSP, media sessions, and barcode onboarding;
- Module 11;
- production deployment approval.
