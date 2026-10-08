# Product operational completion — 2026-10-07

Owner scope: close the gaps found in the backend/frontend/menu/button audit against the Development Kit. Physical equipment must not block software work. **Owner subsequently explicitly requested push in this same session; package only after required local gates pass.** This is one post-green product-hardening batch, not a new numbered wave/module.

Baseline: commit `4907ea5822e07188394ebee3c72e860e79a793cc`, `main`, verified GitHub Actions run `37449896281` succeeded on that exact source. The implementation was committed as `68454f460d9eeee8a9750ec03daafa6570c5d5a6` and pushed to verified `origin/main` without force. Exact-source GitHub Actions run `37643985961` completed/failure at the Wave 5 SDK load. Core CI, both native ESP-IDF/QEMU jobs, PostgreSQL integration (16 suites / 72 tests), live EMQX, simulated ESP32/OTA and Wave 4 passed; that first candidate was **not fully certified**. The native-Node root repair is now committed/pushed as `3b80897bb154f6fb80ea375a9e39b698e9c87159`; run `37712838417` passed core CI and both native targets, but live acceptance was blocked before starting by GitHub account billing/spending limits. Waves 1–13 remain closed; production deployment remains **NOT READY FOR PRODUCTION DEPLOYMENT** pending environment-specific approval.

## Delivered behavior

| Gap | Current implementation and boundary |
| --- | --- |
| Native confirmation dialogs | Shared styled modal with focus containment, initial cancel focus, Escape/cancel, busy lock and visible failure messages; integration deletion and capability deprecation consume it. |
| Browser inventory | Admin sweep derives every canonical route from navigation: 23 tenant + 23 super routes; configurable base URL and Chrome binary; bounded startup and cleanup. Route sweep is a visual/error inventory, not proof of every action. A separate focused action harness exercises actual React components. |
| Typed end-user commands | Admin, User Web and mobile share boolean/integer/number/string/enum/object parsing. Range, integer safety, precision, enum membership, JSON object and input size are checked. Backend capability validation and device CONTROL remain authoritative; state still waits for ACK/telemetry. |
| End-user scenes/schedules | Device detail in User Web and native mobile exposes scene creation, enable/disable, run, history and confirmed delete, plus cron/countdown schedule creation, enable/disable, history and delete. User Web supports repeat choices; mobile offers once. New scene authoring uses one current-device primitive action; existing authorized multi-device scenes can be listed/run. Backend requires CONTROL over all action devices and refuses deletion while a schedule references the scene. Object commands remain direct commands because the scene domain accepts primitives. |
| Camera live view | Admin CCTV and User Web camera detail use the same player. Authenticated VIEW-guarded SDP signaling stays on the product origin. Only server-owned tenant camera references resolve RTSP sources; no credential or RTSP URL is returned to browser clients. go2rtc receives **PATCH** in-memory registration, never credential-persisting PUT. Stream-removal refusal requires an explicit 404 absence check before success. Native mobile camera transport is not added; current camera live-view surface is web. |
| Camera failure/lifecycle | Bounded SDP/network input, 10 sessions per tenant / 100 globally, client stop/unmount cleanup, 15-minute client session timeout, bounded server alias cleanup with retry, no overlapping expiry scans. In-process signaling sessions require sticky API routing; this is not a distributed lease or server-enforced termination of already-connected go2rtc consumers. ONVIF discovery has a total 3-second cap and reports socket failure separately from a quiet segment. |
| Coordinates/maps | Latest persisted coordinates are shown in admin/user device detail, NOC and opted-in dashboard MAP widgets in admin/User Web/mobile. `coordinateSource: DEVICE_LOCATION_V1` + READ/DEVICE_STATUS explicitly activates MAP semantics; legacy/unapproved bindings still fail closed. Map renders coordinates and a grid with zoom/selection; no external tile service, street basemap or inferred location. Tenant-admin device detail also records operator-entered coordinates through the CONTROL-guarded API, explicitly labelled as operator input rather than physical GPS evidence. Zero coordinates are valid. Missing, stale and failed reads remain distinct. NOC deduplicates latest locations in SQL before its 200-device cap. |
| Automatic maintenance | Durable recurrence plans create real maintenance windows. Worker must be explicitly enabled after migration. Each occurrence revalidates active tenant ADMIN/PLATFORM_ADMIN membership and non-revoked device, atomically claims due time and opens a window. A partial database unique index also prevents concurrent manual/automatic OPEN windows. Membership deletion nulls the plan actor; worker disables it instead of executing without authority. Failure of one plan does not stop later plans. Existing open windows cause the next due date to advance without duplicates or backlog flooding. Plans can be disabled; history is retained. |
| Integration operations | Tenant UI/BFF supports connect-check, device sync, safe history and disable for MQTT_BRIDGE and HOME_ASSISTANT. Status means the last acknowledged authenticated operation, not continuous health. MQTT subscribes/PUBACKs before success and verifies integration tenant/provider before network I/O; HA checks authenticated REST responses and returned entity identity before recording a mapping. HA sync exports device status as a sensor; it does not import/control arbitrary provider devices. Disabled integrations refuse sync until reconnect. Credentials stay server-side. Alexa/Google Home remain registry-only provider-owned authorization scope; no external certification is invented. |
| Device technical identity | Authenticated heartbeat accepts optional bounded `firmwareVersion`/`protocol` reports; legacy heartbeats preserve old metadata. The ESP-IDF SDK reports protocol plus the running application partition version, omitting invalid/unavailable versions and never substituting SDK or pending-OTA metadata. Detail exposes DEVICE_REPORTED provenance and last report time; missing reports remain unavailable. Rollout metadata is still not installation/physical evidence. |

Settings Profile & Session and `/mobile-preview` retain their documented scope. API-only machine/health/device protocol endpoints do not gain artificial menus. `/cctv`, `/noc` and `/technician` remain QUARANTINE until a new source-bound full acceptance authorizes promotion; banners now describe the implemented capabilities truthfully.

## Operator configuration

Apply migration `20261007090000_product_operational_completion` before enabling `MAINTENANCE_SCHEDULER_ENABLED=true`. It is expand-only: no table/data/column removal; existing FKs remain while tenant-composite provenance is strengthened. It refuses orphan/cross-tenant location/maintenance rows and duplicate OPEN windows instead of silently repairing data. Review and repair any legacy violation explicitly before deployment.

Set `IOT_RUNTIME_CONNECTIONS_FILE` to an operator-managed JSON file, mode 0600, outside source control. Each entry is uniquely addressed by tenant + reference + kind. Runtime refuses missing, ambiguous, malformed, too-large or publicly readable files. Example **structure only**, replace placeholders on the operator host:

```json
[
  { "tenantId": "tenant-uuid", "reference": "camera://device-uuid", "kind": "CAMERA", "config": { "rtspUrl": "rtsp://operator-user:operator-password@camera-host/stream" } },
  { "tenantId": "tenant-uuid", "reference": "secret://bridge-reference", "kind": "MQTT_BRIDGE", "config": { "brokerUrl": "mqtts://operator-broker:8883", "topicPrefix": "tenant/tenant-uuid/bridge", "username": "operator-user", "password": "operator-password" } },
  { "tenantId": "tenant-uuid", "reference": "secret://ha-reference", "kind": "HOME_ASSISTANT", "config": { "baseUrl": "https://operator-home-assistant", "token": "operator-token" } }
]
```

Never place this file in the web app or return it from an API. `runtime-connections.json` is ignored; private filenames should remain outside the repository. For Docker, the optional `ops/media/runtime-connections.compose.example.yml` overlay mounts it read-only into the API; set `IOT_RUNTIME_CONNECTIONS_HOST_FILE` to its absolute operator path. No production configuration was created, changed or deployed in this session.

Media API and RTSP listeners must stay internal; expose only the intended WebRTC transport using environment-approved networking/TLS/ICE candidates. Use sticky routing for playback offer/stop while the server session map is process-local. Provider URL and credentials are operator inputs, never request-body configuration. Production MQTT requires mqtts; HA requires HTTPS (nonproduction loopback HTTP is accepted for fixtures).

The in-memory go2rtc registration and raw SDP exchange match the [upstream streams API](https://github.com/AlexxIT/go2rtc/blob/master/internal/streams/api.go) and [WebRTC API](https://github.com/AlexxIT/go2rtc/blob/master/internal/webrtc/server.go); this session also exercised the installed image with real decoded synthetic frames.

## Dependency hardening

The final local security gate discovered the newly published shell-quote advisory in the existing mobile dependency chain (`react-native -> react-devtools-core -> shell-quote`). The lockfile now resolves 1.12.0, above the [upstream patched minimum 1.11.0](https://github.com/ljharb/shell-quote/security/advisories/GHSA-pqg4-j6r4-53mv). A local assertion verifies that the advisory's comment-followed-by-newline input is rejected, without executing a shell. The production audit policy remains unchanged: no critical exceptions are accepted.

The first combined prepush stopped at this finding. Automatic approval review subsequently rejected a standalone audit retry because it sends the dependency inventory to npm; the owner then explicitly authorized continuing and pushing. The patched production audit passed with zero critical findings; no audit policy was relaxed.

## Validation and evidence

Final local QA: **55/55 targeted suites / 558/558 tests**, **291/291 full Jest suites / 2584/2584 tests in one all-green run**, and **8/8 real PostgreSQL operational integration tests**. Backend/SDK/all web/mobile typechecks, lint, staged source secret scan, zero-critical production audit, required structural/schema and ESP32 native API/build/QEMU-runner contract checks passed. Admin and User Web compiled successfully with Next's supported webpack production compiler. Local default Turbopack hit a sandbox worker port-bind restriction; CI retains the default build and must pass it. The complete local prepush was resumed at the failing gate after root repairs, not claimed as one initially uninterrupted green command.

The full-Jest repair retained safety: the new bounded internal maintenance queue exemption requires the tenant/ACTIVE/admin membership revalidation call; a real foreign-tenant actor test proves refusal. Map contracts require unsupported/error/empty guards before rendering, preserve stale-coordinate-only semantics, and verify explicit backend opt-in. ONVIF now starts its total timer before bind and clamps the maximum; mobile JSON transport tests preserve all six value types and forbid transport on invalid input. No auth/RBAC/TLS/rate-limit/UAT/secret-policy assertion was removed or downgraded. Permanent tests include new behavior suites under `src`, PostgreSQL integration `test/integration/product-operational.integration-spec.ts`, and the focused Chrome harness `scripts/test-product-browser.mjs` with actual product components from `test/scripts/product-browser-entry.tsx`.

- PostgreSQL evidence uses the real committed migrations in a disposable database/schema, not Prisma validate/generate. It covers simultaneous claims/manual requests, actor deletion, database tenant provenance, SQL location deduplication and report persistence.
- Browser evidence is **BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT**: real React controls and real go2rtc/FFmpeg/Chrome-decoded frames; scene/command HTTP responses and camera device lookup are explicit fixtures. It does not claim the production auth/MQTT/full UAT path or PHYSICAL/HIL.
- Full automated `SIMULATED_HARDWARE_LIVE_SERVICE` acceptance for the changed sealed source remains pending runner access for the live acceptance job in run `37712838417` (or exact-source acceptance of a receipt-only successor). GitHub account billing/spending limits stopped this job before any step ran; partial core/native PASS does not replace full acceptance. External provider/site observations remain separately labelled.

To repeat the focused browser test against an already-owned synthetic fixture:

```sh
PRODUCT_TEST_MEDIA_URL=http://127.0.0.1:15984 \
PRODUCT_TEST_RTSP_URL=rtsp://127.0.0.1:8554/simulator \
npm run product:browser:test
```

The session fixture runs go2rtc with inline config, an FFmpeg test pattern, private localhost ports and no production volume. The browser harness fails on missing controls, unsafe action results, missing decoded video, or uncaught runtime errors. It cleans its browser profile/server and playback sessions. Temporary containers are stopped after validation. CI runs the same harness through `ops/scripts/test-product-browser-ci.sh`, with the exact tested media-image digest, bounded readiness and a trap that removes only its own isolated fixture. The normal production web-build command is unchanged; local Turbopack sandbox port binding is validated separately by the supported webpack compiler before CI executes the default build.

## Next action

Resolve the owner-owned GitHub Billing & plans blocker, then run the failed live acceptance against the verified source. The implementation and SDK repair are already pushed. Preserve all gates and record only executed evidence; quarantine promotion and production deployment retain separate scope/evidence decisions. On resume verify HEAD/status and the current handoff before acting.

## Native Node SDK CI repair — 2026-10-08

Run `37643985961` stopped at `Wave 5 public API webhook and SDK live regression`: Node's ESM/type-stripping loader could not resolve the extensionless `./capability-value` re-export. Bundler/compiler checks alone did not exercise this consumer. The SDK now exports `./capability-value.ts` explicitly; its no-emit TypeScript project allows source extensions. The regression invokes native Node against the actual SDK entrypoint, tests valid/range-refused/object parser results, and exercises the public client with an explicit fixture fetch. The live SDK probe and all auth/API/UAT gates remain unchanged and mandatory.

Repair QA: SDK typecheck and native-Node regression PASS (1 suite / 10 tests). Full new-source GitHub acceptance remains mandatory.

## Exact-source CI result — 2026-10-08

Commit `3b80897bb154f6fb80ea375a9e39b698e9c87159`, [Actions run 37712838417](https://github.com/reyvo1/iot-platform/actions/runs/37712838417): core CI and both ESP32/ESP32-C3 ESP-IDF/QEMU jobs succeeded. Full Jest and coverage each passed 291 suites / 2585 tests; E2E passed 4 tests; real PostgreSQL integration passed 16 suites / 72 tests; focused product-browser/synthetic-camera, MQTT, security and build gates succeeded. Production dependency audit reported 0 critical, 25 high, 10 moderate; no exception was added.

The live acceptance job (`113104432598`) failed allocation with no runner and no steps. GitHub annotation states that recent account payments failed or the spending limit needs to be increased. This is an external account blocker, not a physical equipment dependency or an observed application failure. Software implementation is delivered, but **FULL AUTOMATED ACCEPTANCE REMAINS PENDING**. Owner must resolve Billing & plans; do not bypass the mandatory live gate. No deploy, force push or existing-runtime restart occurred.
