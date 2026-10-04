# PROJECT HANDOFF — ENTERPRISE WAVE 13

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->

## ACTIVE HANDOFF — GITHUB WAVE 4 TLS PROTOCOL-PROBE PORTABILITY

Master roadmap: `docs/ENTERPRISE-WAVE-ROADMAP.md`. Waves 1–12 are software-scope CLOSED/GREEN; Wave 13 is IN PROGRESS. Missing physical ESP32/camera hardware is not a software blocker. Mandatory automated certification uses source-bound `SIMULATED_HARDWARE_LIVE_SERVICE`; physical/site/HIL remains separately labelled field validation.

GitHub run `100697590638` on commit `15bf8263294075911633eeccbd19de12c807c1a1` proves the prior Full Jest contract repair: **278/278 suites and 2412/2412 tests PASS**, with coverage rerun equally green. Rescue live-service reached Wave 4 after real runtime/UAT setup; `uat:docs` is **24/24 PASS**, `uat:login` is **9/9 PASS**, and TLS is **11/12 PASS**. The only failure is `TLS 1.3 is negotiable — unknown` even though the same nginx instance passes config, no-warning, listener, HTTP/2 ALPN, proxy, redirect, metrics-denial, HSTS, and TLS1.0-refusal checks.

The repair fixes the verifier rather than weakening TLS policy: OpenSSL negotiation parsing now uses stdout+stderr+exit status, recognizes multiple legitimate OpenSSL summary formats, requires exit-0 explicit TLSv1.3 evidence for TLS1.3 PASS, and refuses to call TLS1.0 blocked if a TLSv1 handshake was actually negotiated. A dependency-free `tls:protocol:self-test` is mandatory locally and in core CI.

## Resume rule

Follow `docs/SESSION-HANDOFF-PROTOCOL.md`: verify real HEAD/status and continue from the FIRST FAILING GATE rather than auditing from zero. For this candidate run `npm run tls:protocol:self-test`, then `npm run wave3:prepush:check`. Only after full green: review complete diff once, commit once, push once, then read GitHub heavy UAT. Do not reopen already-green Full Jest/RBAC/ESP32/UAT-account work without new evidence.

--- HISTORICAL WAVE 3 HANDOFF BELOW ---

### Wave 3 objective

Close ESP32/OTA automated evidence as one large wave before one GitHub push:

1. Build the SDK as a real ESP-IDF 5.5.5 component for ESP32 and ESP32-C3.
2. Boot the linked ESP32 firmware under Espressif QEMU/repository-native boot runner.
3. Carry the exact built firmware `.bin` into the rescue live-service job.
4. Run a device digital twin through real rescue API/PostgreSQL/EMQX for provisioning, heartbeat, MQTT telemetry, disconnect/reconnect, command/ACK, and duplicate QoS-1 suppression.
5. Exercise OTA over trusted HTTPS using that exact built artifact: matching SHA-256 success, wrong-digest rejection, interrupted-stream rejection, pending-verify rollback, and live-reconnect confirmation.
6. Optionally run Wokwi when `WOKWI_CLI_TOKEN` exists. Missing Wokwi credentials are `NOT_RUN_EXTERNAL_TOKEN`, never a fabricated PASS.

### Firmware contract

- SDK contract version: `2.1.0`.
- OTA requires HTTPS with an explicit platform CA.
- OTA writes only to the inactive partition.
- SHA-256 is streamed across the complete artifact and compared in constant time before `esp_ota_set_boot_partition`.
- Partial failures abort the OTA handle.
- A newly booted image remains rollback-pending until a live MQTT reconnect calls `esp_ota_mark_app_valid_cancel_rollback()`.
- Physical board/HIL evidence remains separate final-certification evidence. Automated simulation must never be relabeled physical.

### Evidence hierarchy

- local pre-push: STATIC/CONTRACT + targeted simulation self-tests only;
- GitHub firmware job: INTEGRATION/TOOLCHAIN + SIMULATED-HARDWARE through ESP-IDF/QEMU;
- GitHub rescue job: LIVE-SERVICE + SIMULATED-HARDWARE against real rescue services;
- optional Wokwi: SIMULATED-HARDWARE/EXTERNAL;
- physical board/HIL: deferred to Wave 13 final certification.

### Exit rule

Wave 3 remains ACTIVE until the local `wave3:prepush:check` passes, one Wave 3 push is made, and GitHub is fully green across core regression, mandatory firmware/QEMU simulation, rescue live-service simulation, real EMQX, and full acceptance. Any red run remains Wave 3 and is corrected by root-cause class. Wave 4 must not open early.

Pre-package candidate is reconstructed from the complete sealed Wave 2 V9 baseline and seals at **1050 source paths / 1051 manifest entries** after the 37-file Wave 3 overlay. The applicator must regenerate that seal from the operator checkout after overlay; it must never copy a chat-snapshot manifest over the real repository.

---

# PROJECT HANDOFF — WAVE 1 V13

## Active continuation — 2026-09-15

Do not audit from zero. Continue from the GitHub V12 evidence in `logs_94594644195.zip`.

Authoritative latest facts:
- core GitHub `test` is GREEN: 180/180 suites and 1187/1187 tests;
- `rescue-live-emqx` reaches Docker + EMQX 5.9.2 on rescue endpoint `mqtt://127.0.0.1:18884`;
- V12 fixed the negative-ACL connection-lifecycle class: publisher non-command subscribe/publish now PASS with explicit denial evidence;
- valid device auth, wrong-secret denial, device command subscribe, publisher command delivery, telemetry publish, and telemetry webhook idempotency all PASS;
- first new failure is `POST /dashboards` HTTP 400 `DASHBOARD_WIDGET_RESOLUTION_INVALID`: the live smoke created a `GAUGE` widget bound to the existing `power:boolean` capability;
- production remains **NOT APPROVED** until physical ESP32/Wi-Fi reconnect/physical MQTT/OTA evidence is complete.

V13 fixes the full live-dashboard fixture semantic-contract class without changing application behavior:
- the boolean `power` capability remains boolean/readable/writable/reportable;
- the live dashboard evidence widget is `CARD` + `READ` + `LATEST`, which is compatible with a boolean capability and still exercises the canonical widget-data query path;
- the broker-smoke self-test now fails closed if the power capability or dashboard binding drifts, and explicitly rejects a regression back to `GAUGE` for the boolean capability;
- the GitHub CI self-test requires that dashboard semantic guard to remain present.

Local validation performed for V13:
- Node syntax checks for changed smoke/self-test scripts: PASS;
- broker-smoke self-test: PASS, including all V12 MQTT denial regressions plus dashboard semantic compatibility;
- GitHub CI self-test: PASS;
- negative regression mutation (`CARD` -> `GAUGE`) is rejected by the self-test: PASS;
- no local Docker/build/DB/Redis/real EMQX/full acceptance was run.

Next action:
1. Apply V13 to the clean complete V12 repository.
2. Let the package run the canonical lightweight pre-push gate.
3. Commit once and push once.
4. GitHub remains authoritative for Docker/build/DB/Redis/EMQX/full acceptance.
5. If GitHub is red again, collect the first failure and related failures in that same class before creating another Wave 1 batch.

Do not reopen the old foreign Windows Mosquitto diagnosis on port `1883`; the rescue endpoint remains `18884`.

---

# PROJECT HANDOFF — RR29

## Active baseline

- Phase: `RESCUE-02B-RUNTIME-READINESS-29 / GATE-1 VALIDATOR SCOPE REPAIR`
- Input baseline: RR28
- Production: **NOT APPROVED**
- RR28 live local runtime: **FULL READY on dedicated rescue MQTT endpoint `mqtt://127.0.0.1:18884`**
- RR28 Gate 1 runner: **LIVE PASS**
- RR28 Gate 1 validator: **BLOCKED only by `ReferenceError: currentState is not defined`**

## Proven root cause

RR28 successfully fixed the foreign-Mosquitto host-port collision. The live operator run proved local recovery reached full protocol readiness, persisted the dedicated rescue endpoint `18884`, and `rescue:gate1` produced a PASS receipt. The remaining failure is a JavaScript block-scope defect introduced in the RR28 Gate 1 validator: `currentState` was declared with `const` inside one local-topology block and referenced by the following block while constructing the dedicated MQTT revalidation environment.

This is a validator-only defect. Do **not** reopen Mosquitto/EMQX authentication, backend auth, database, Web/Mobile, or Gate 2 business logic unless new evidence explicitly points there.

## RR29 fix

- `validate-rescue-gate1-receipt.mjs` declares `currentState` in outer scope and assigns it inside the local-topology state-loading block.
- Dedicated MQTT endpoint binding remains unchanged and still comes from source-bound local runtime state.
- New `rescue:gate1-validator:self-test` executes the validator end-to-end on a synthetic local PASS receipt and fails if the scope bug returns or if `mqtt://127.0.0.1:18884` is not propagated into the live runtime recheck.
- No runtime topology, broker configuration, auth backend, database schema, UI, or product logic changes.

## Operator continuation

Overlay RR29 while preserving `.env`, `node_modules`, and named volumes. Because sealed source changes, rebind local runtime/Gate 1 once:

```powershell
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
npm run baseline:manifest:verify
npm run rescue:validate
npm run rescue:bootstrap:doctor
npm run rescue:runtime:self-test
npm run rescue:gate1-validator:self-test
npm run rescue:local:recover
npm run rescue:local:status
npm run rescue:gate1
npm run rescue:gate1:validate
```

Expected MQTT endpoint remains `mqtt://127.0.0.1:18884` unless a custom free `RESCUE_MQTT_HOST_PORT` is intentionally configured. After Gate 1 validator PASS, run full acceptance once. If it returns `AUTOMATED_TEST_SUITE_PASS`, initialize a new RR29 evidence file from that exact report and continue live broker evidence.

---

# RR26 continuation — Database integration MEMBER device-access fixture

Active target: `IoT-Platform-rescue-02b-runtime-readiness-26-20260913.zip`. Do not return to RR09–RR25 diagnosis unless a new error explicitly points there.

Live RR25 facts:
- Gate 1: source-bound LIVE PASS and `rescue:gate1:validate` PASS.
- Web/mobile validation: PASS.
- Unit/contract tests: PASS (180/180 suites; 1,185/1,185 tests).
- Database integration: 13/14 suites PASS, 55/57 tests PASS.
- Sole blocker: two dashboard widget query integration expectations returned `INVALID` because the fixture omitted current MEMBER device-access identity/ownership wiring.

RR26 fixes only that integration fixture and regression guard. Production fail-closed dashboard authorization remains unchanged. The fixture now uses `DeviceAccessService`, persists/passes `userId`, and makes the test user the device owner.

After overlaying RR26 while preserving `.env`, `node_modules`, and named rescue volumes, rebind Gate 1 once. If the machine/runtime is healthy, normal `rescue:local:down` + `rescue:local:up` is sufficient; if recovering from another interruption/BSOD, use `rescue:local:recover` instead. Then run `rescue:gate1`, `rescue:gate1:validate`, `rescue:dashboard-integration:self-test`, and full acceptance.

Do not claim Database integration PASS until the live suite proves it. If Database integration passes and MQTT integration fails, continue only from that MQTT failure.

---

# RR25 continuation — crash recovery + Windows-safe unit regression self-test

Active target: `IoT-Platform-rescue-02b-runtime-readiness-25-20260913.zip`. Do not return to RR09–RR24 diagnosis unless a new error explicitly points there.

Latest live facts from RR24 operator run:
- exact tree/manifest and Rescue validation PASS;
- Windows host suffered a BSOD/interruption during the local runtime sequence;
- subsequent runtime probe showed PostgreSQL `55432`, Redis `6379`, EMQX Dashboard `18083`, and API `3000` offline while MQTT `1883` still accepted a connection;
- Gate 1 correctly refused a non-ready/transient tracked runtime state;
- `rescue:unit-regressions:self-test` independently failed before testing because repository-root resolution produced `C:\C:\Users...`;
- do not infer database corruption from this evidence.

RR25 changes only rescue tooling/docs: portable Windows root resolution, `rescue:local:recover`, crash-recovery regression coverage, and clearer Gate 1 recovery guidance. Named data volumes are preserved by recovery.

Next live sequence:
```powershell
npm run baseline:manifest:verify
npm run rescue:validate
npm run rescue:bootstrap:doctor
npm run rescue:unit-regressions:self-test
npm run rescue:local:recover
npm run rescue:gate1
npm run rescue:gate1:validate
npm run rescue:acceptance -- --env=.env --full
```

Do not run `rescue:local:down -- --volumes` for this recovery. If full acceptance reaches Unit/contract tests again, continue from the complete `FAILURE SUMMARY`; if it passes Unit/contract tests, continue forward to DB/MQTT integration and `AUTOMATED_TEST_SUITE_PASS`.

# IoT Platform — Project Handoff RR24

## Active baseline

- Baseline: `IoT-Platform-rescue-02b-runtime-readiness-24-20260913.zip`
- Input baseline: RR23 SHA-256 `b8090b75bedc2c2ad9a77aa3f91191a8777b973450779575aaaeb277341ce6c1`
- Phase: `RESCUE-02B-RUNTIME-READINESS-24 / FINAL UNIT CONTRACT ABSTRACTION + SCHEDULER CLAIM TOKEN / GATE 2 RECOVERY`
- RR23 Gate 1: **LIVE PASS and validated**
- RR23 backend production build: **LIVE PASS**
- RR23 Web/mobile validation: **LIVE PASS**
- RR23 Unit/contract tests: **BLOCKED — only 3 failed suites / 8 failed tests; 177 suites and 1,177 tests PASS**
- RR24 Gate 1: **REVALIDATION REQUIRED because sealed source changed**
- Production: **NOT APPROVED**

## Continuity rule

Do not audit from zero. Do not return to RR09-RR23 fixes unless a new error explicitly points there. Continue only from the newest Gate 2 boundary.

## Latest live evidence

The RR23 operator run proved the full chain through backend production build and Web/mobile validation. RR23's complete failure summary reduced the remaining Jest blocker to exactly:

- `src/device/command.controller.spec.ts` — 4 failures;
- `src/telemetry/telemetry.controller.spec.ts` — 3 failures;
- `src/scheduler/schedule-due-run.service.spec.ts` — 1 failure.

Root Jest state: **3 failed / 177 passed suites; 8 failed / 1,177 passed tests; 1,185 total tests**.

## RR24 diagnosis and fixes

The two controller suites were not exposing controller behavior failures. Their legacy `@nestjs/testing` modules were compiling class-level guards that had been correctly added later (`DeviceAccessGuard`). These unit tests only assert service delegation, while guard behavior already has dedicated tests. RR24 therefore moves these tests to their correct unit boundary: instantiate the controller directly with its mocked service. This removes unrelated guard-container DI from delegation tests without touching production route authorization.

The scheduler failure was a stale expectation. Production source already uses `claimedAt` as a lease/ownership token both when claiming and when settling. This is safety-critical because a stale worker must not overwrite a newer claimant. RR24 updates the failed-scene test to require the same `claimedAt: databaseNow` predicate rather than weakening the implementation.

RR24 adds `scripts/self-test-unit-runtime-regressions.mjs` and `npm run rescue:unit-regressions:self-test`; Rescue validation statically verifies the controller test abstraction and scheduler ownership-token expectation.

## Local regression evidence before sealing

- controller/scheduler unit regression self-test: **3/3 PASS**;
- TypeScript syntax transpile of all three changed specs: **PASS**;
- unit-type boundary self-test: **PASS**;
- failure-summary self-test: **PASS**;
- acceptance self-test: **PASS**;
- baseline manifest self-test: **PASS**;
- lifecycle validation: **PASS**;
- runtime protocol self-test: **PASS**;
- EMQX webhook self-test: **PASS**;
- local-runtime self-test: **PASS**;
- production-approval receipt self-test: **PASS**;
- Rescue validator: **256/256 PASS before final sealing**.

The sandbox cannot honestly claim the dependency-resolved full Jest suite PASS because the sealed baseline excludes `node_modules`. The authoritative proof remains the next operator `rescue:acceptance -- --env=.env --full`.

## Continue exactly here on the operator PC

Overlay RR24 over RR23 while preserving `.env`, `node_modules`, and named rescue volumes.

```powershell
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
npm run baseline:manifest:verify
npm run rescue:validate
npm run rescue:bootstrap:doctor
npm run rescue:local:down
npm run rescue:local:up
npm run rescue:gate1
npm run rescue:gate1:validate
```

After Gate 1 validates:

```powershell
npm run rescue:unit-regressions:self-test
npm run rescue:unit-types:self-test
npm run rescue:failure-summary:self-test
npm run rescue:acceptance:self-test
npm run rescue:acceptance -- --env=.env --full
```

## Next target

Obtain `AUTOMATED_TEST_SUITE_PASS`. If full acceptance reaches Database integration or MQTT integration and fails there, continue only from that new live failure. After automated acceptance passes, initialize RESCUE-02B evidence from that exact report; live broker publish/idempotency/ACK/negative-path evidence and physical ESP32 evidence remain mandatory before production approval.

## Historical Project Handoff RR23

## Active baseline

- Baseline: `IoT-Platform-rescue-02b-runtime-readiness-23-20260913.zip`
- Input baseline: RR22 SHA-256 `dd4b224f5492d996ababe18b3e1045b1ab300d41a11e43a1e896f68aae9ae61c`
- Phase: `RESCUE-02B-RUNTIME-READINESS-23 / CONTRACT DRIFT + STRUCTURED LOGGING + COMPLETE FAILURE INDEX / GATE 2 RECOVERY`
- RR22 Gate 1: **LIVE PASS and validated**
- RR22 backend production build: **LIVE PASS**
- RR22 Web/mobile validation: **LIVE PASS**
- RR22 Unit/contract tests: **BLOCKED — 18 failed suites / 25 failed tests**
- RR23 Gate 1: **REVALIDATION REQUIRED because sealed source changed**
- Production: **NOT APPROVED**

## Continuity rule

Do not audit from zero. Do not return to RR09-RR22 fixes unless a new error explicitly points there. Continue from the newest Gate 2 Unit/contract boundary only.

## Latest live evidence

RR22 operator execution proved exact source/manifest validation, Rescue 251/251, protocol-ready local runtime, source-bound Gate 1 PASS, Gate 1 live validation, unit-type boundary PASS, acceptance-self-test PASS, backend production build PASS, and complete Web/mobile validation PASS. The next blocker is the real root Jest suite: 18 suites failed, 162 passed; 25 tests failed, 1160 passed.

The old acceptance runner printed only the last 3,000 characters of the failing subprocess. That exposed only the tail failure (`module-09-telemetry-history-query`) and hid the earlier failure index even though the JSON report contained full stdout/stderr. RR23 fixes this diagnostic blind spot.

## RR23 diagnosis and fixes

A dependency-free contract harness over the root contract suite reproduced sixteen concrete stale assertions across fourteen contract files. These were not sixteen product regressions; they were old source-string contracts that had not followed later canonical hardening. RR23 updates them to assert the current stronger semantics:

- telemetry latest/history/aggregation require `DeviceAccessGuard` and `VIEW`;
- Super device directory uses `/api/super/platform-devices`;
- shared dashboard administration includes both `ADMIN` and `PLATFORM_ADMIN`;
- `SpaceModule` includes `AccessibleSpaceController`/service;
- command URL requires `encodeURIComponent(targetId)`;
- Mobile Alerts is backend-backed by the accessible analytics contract instead of the old “disabled” placeholder;
- legacy Notifications redirects to canonical `/tenant/temuan`, whose content is analytics findings and explicitly not notification-delivery history;
- Mobile login tests no longer misclassify user-facing `ACK/telemetry` prose as a `/telemetry` API call;
- dashboard module contract includes `DeviceModule`;
- automation telemetry contract follows `isAutomationRuntimeEnabled()` rather than requiring an inline env comparison;
- Mobile dashboard contract follows permission-aware controls instead of the superseded read-only placeholder wording;
- ESP32 contract assertions follow the then-current SHA-256/NVS wording; Wave 3 now explicitly separates simulated NVS persistence from production/HIL encrypted-storage evidence.

One genuine source defect was also found by the structured-logging contract: automation persistence used a ternary expression in the `event` field. RR23 emits explicit literal `automation.persistence.activated` / `automation.persistence.deactivated` events without changing execution behavior.

RR23 adds `scripts/rescue-failure-summary.mjs` plus a self-test. `run-rescue-acceptance.mjs` now prints a bounded high-signal `FAILURE SUMMARY` with every failing Jest suite/test header, TypeScript diagnostic, and final Jest counts before the existing tail. Full raw stdout/stderr remains in the JSON report.

## Local regression evidence before sealing

- root contract harness: **405/405 PASS**;
- structured-logging contract scan: **PASS** after the literal event repair;
- `rescue:unit-types:self-test`: **PASS**;
- `rescue:failure-summary:self-test`: **PASS**;
- `rescue:acceptance:self-test`: **PASS**;
- runtime protocol self-test: **PASS**;
- EMQX webhook self-test: **PASS**;
- local-runtime self-test: **PASS**;
- production-approval receipt self-test: **PASS**;
- baseline manifest self-test: **PASS**;
- lifecycle validation: **PASS**;
- Rescue validator: **254/254 PASS** before final sealing.

The sandbox cannot honestly claim the dependency-resolved 1,185-test Jest suite PASS because the baseline ZIP intentionally excludes `node_modules`. The next operator full acceptance is the authoritative proof. RR23 is specifically designed so that if any failures remain, all suite/test names are visible in one run instead of being hidden behind a 3,000-character tail.

## Continue exactly here on the operator PC

Overlay RR23 over RR22 while preserving `.env`, `node_modules`, and named rescue volumes.

```powershell
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
npm run baseline:manifest:verify
npm run rescue:validate
npm run rescue:bootstrap:doctor
npm run rescue:local:down
npm run rescue:local:up
npm run rescue:gate1
npm run rescue:gate1:validate
```

After Gate 1 validates:

```powershell
npm run rescue:unit-types:self-test
npm run rescue:failure-summary:self-test
npm run rescue:acceptance:self-test
npm run rescue:acceptance -- --env=.env --full
```

## Next target

Obtain `AUTOMATED_TEST_SUITE_PASS`. If Unit/contract tests still fail, do not patch from the last tail line only. Use the complete RR23 `FAILURE SUMMARY` and fix the entire remaining failure set together. After automated acceptance passes, initialize RESCUE-02B evidence from that exact report. Live broker publish/idempotency/ACK/negative-path evidence, physical ESP32 evidence, OTA, release approval, and production approval remain pending until proven.


## RR27 continuation — broker auth security blocker

Active baseline after sealing: RR27. Do not reuse RR26 evidence as RR27 acceptance evidence. The RR26 live diagnostic proved: backend wrong-secret response=deny; global `password_based:http` authenticator enabled; `tcp:default enable_authn=true`; nevertheless EMQX 5.8.0 accepted the wrong MQTT secret. RR27 pins EMQX 5.9.2 and makes a wrong-secret rejection probe mandatory in full runtime readiness/Gate 1. Next operator gate: overlay RR27 preserving `.env`, `node_modules`, and named volumes; run local recovery/up, Gate 1, then full automated acceptance. Only after all are PASS initialize a new RR27 evidence file and resume live broker Phase A.

---

## RR30 GitHub CI continuation

Heavy build/integration validation is restored to the existing GitHub Actions path instead of being repeatedly executed on the Windows/WSL developer host. The original `test` job remains intact. A new `rescue-live-emqx` job runs after core CI on `ubuntu-latest`, generates an ephemeral rescue `.env`, brings up the source-controlled `docker-compose.rescue.yml` with Docker Compose, performs a targeted PostgreSQL integration stability gate, executes a real EMQX broker smoke (device/publisher auth, wrong-secret denial, ACLs, telemetry webhook/idempotency, command/ACK correlation, cross-device denial, revocation, wrong-webhook-secret denial), revalidates Gate 1, then runs exactly one full automated acceptance. Reports and Compose logs are uploaded even on failure; runner volumes are removed only at final CI teardown.

The dedicated rescue host MQTT endpoint remains `127.0.0.1:18884`. The old host `127.0.0.1:1883` Mosquitto diagnosis is closed and must not be reopened without new evidence against `18884`. Physical ESP32/OTA proof remains a separate non-GitHub-hosted hardware gate.

## GitHub Base #1 first-run root cause — permanent Wave 1 remediation

The first GitHub-hosted core job stopped at `security:audit:production` because the old `@fastify/middie` critical finding acceptance expired. This is not a PostgreSQL, Redis, EMQX, Docker, or application-runtime failure. Wave 1 does not extend the expired exception. The permanent remediation upgrades the NestJS/Fastify boundary to NestJS 11.2.3 / Fastify 5.10.0, retires the accepted critical finding, adds a lockfile guard that rejects `@fastify/middie` below 9.3.3, and runs that guard before `npm audit` in GitHub CI.

The dependency lock must be regenerated by `npm install` when this in-wave migration is applied. After that, local backend build/contracts and GitHub heavy CI are authoritative. This remains Wave 1 and is not a new RR checkpoint.

---

## WAVE 1 SECURITY CONTINUATION — NEXT.JS
GitHub/local security validation exposed `next` as the remaining critical production dependency after the permanent NestJS/Fastify remediation.

Permanent remediation:
- `apps/admin-web`: Next.js 16.2.10 -> 16.3.5
- `apps/user-web`: Next.js 16.2.10 -> 16.3.5
- new fail-closed `security:web-stack:verify`
- GitHub verifies the Next.js boundary before production dependency audit
- no critical risk acceptance is introduced

This remains part of the same Wave 1. Do not create a micro-RR checkpoint only for this failure.

---

## WAVE 1 FASTIFY V5 SOURCE-COMPATIBILITY CONTINUATION
After the permanent NestJS/Fastify and Next.js security upgrades, backend compilation exposed one removed Fastify v4 API in `src/metrics/metrics.interceptor.ts`: `request.routerPath`.

Permanent remediation:
- route template lookup now uses only `request.routeOptions?.url`;
- unmatched routes remain bounded to the `unmatched` metric label;
- repository-wide Fastify v5 compatibility guard rejects removed v4 request/reply APIs from executable source;
- CI runs the compatibility guard before backend build;
- unit/observability contracts reject legacy `routerPath` fallback.

No dependency rollback and no security exception is introduced.
This remains part of the same Wave 1.

---

## WAVE 1 WEB FRAMEWORK CONTRACT SYNCHRONIZATION
After backend/web builds passed on the permanent framework security upgrades, the contract suite exposed one stale historical expectation: the active web workspace foundation contract still pinned Next.js 16.2.10 while both applications were intentionally upgraded to the security-approved 16.3.5 line.

Permanent remediation:
- active web workspace foundation contract now pins Next.js 16.3.5;
- active foundation documentation now records Next.js 16.3.5;
- a fail-closed contract/documentation sync guard prevents package/contract/doc drift;
- historical and negative-test references to 16.2.10 remain only where they intentionally prove the vulnerable line is rejected.

No business logic is changed.
This remains part of the same Wave 1.

---

## WAVE 1 BASELINE HYGIENE CONTINUATION
After all 513 contract assertions passed, `rescue:validate` correctly failed because the successful backend build had left generated `dist/` output in the working tree.

Permanent remediation:
- `baseline:hygiene:clean` removes only deterministic generated build outputs (`dist`, both Next.js `.next` trees, and workspace TypeScript incremental metadata);
- `baseline:hygiene:self-test` proves generated outputs are removed while source files are preserved;
- `rescue:validate` remains non-mutating and fail-closed;
- local sealing order is now: build/test -> hygiene clean -> manifest generate/verify -> rescue validate;
- GitHub self-tests the hygiene cleaner without weakening source validation.

No business logic, database schema, MQTT behavior, or UI behavior changes.
This remains part of the same Wave 1.

---

## WAVE 1 GITHUB LINT CONTINUATION
The latest GitHub run passed dependency bootstrap and framework security gates, then stopped at `Non-mutating lint` on exactly two source-level lint violations:
- unused callback parameter `path` in the mobile alerts test;
- unused React `useMemo` import in User Web device detail.

Permanent remediation:
- unused mobile callback parameter is explicitly `_path`, matching the repository lint policy;
- unused `useMemo` import is removed;
- `wave1:prepush:check` is now the canonical lightweight local gate before every GitHub push;
- the pre-push gate mirrors cheap GitHub checks: framework security, production audit, non-mutating lint, Fastify v5 compatibility, web contract sync, hygiene, manifest, Rescue validator, and GitHub CI self-test;
- Docker/build/integration/full acceptance remain GitHub-heavy gates.

This remains part of the same Wave 1. No business logic is changed.

---

## WAVE 1 GITHUB WINDOWS-LAUNCHER EOL CONTINUATION
The latest GitHub Linux run reached the full Jest suite and passed 1185/1186 assertions. The only failure was the Windows operator-launcher contract because GitHub checkout materialized `.cmd` files with LF endings while the launcher contract intentionally requires CRLF + `npm.cmd`.

Permanent remediation:
- `.gitattributes` now enforces `*.cmd text eol=crlf`;
- `.gitattributes` also enforces `*.bat text eol=crlf` for future Windows launchers;
- the operator contract explicitly verifies the Git attribute policy;
- Rescue validation requires the policy so Linux checkout cannot silently regress the Windows launcher byte contract.

No launcher behavior, business logic, database schema, MQTT behavior, or UI behavior changes.
This remains part of the same Wave 1.

---

## WAVE 1 GITHUB SOURCE-SEALING CONTINUATION — REPORT ROUTE IGNORE SCOPE
Core GitHub `test` is green. `rescue-live-emqx` did not reach Docker/EMQX yet: it failed during sealed-source verification because GitHub checkout did not contain the two canonical Super Admin report routes.

Root cause:
- `.gitignore` used broad `reports/`;
- Git therefore ignored any nested directory named `reports`, including:
  - `apps/admin-web/app/super/reports/page.tsx`
  - `apps/admin-web/app/api/super/reports/tenant-summary/route.ts`
- the files existed locally, so local manifest generation saw them;
- they were never committed to GitHub, so the Linux checkout correctly reported them as stale manifest entries.

Permanent remediation:
- runtime evidence ignore is now anchored to top-level `/reports/`;
- nested application report routes are explicitly required to remain Git-visible;
- `gitignore:source-scope:self-test` proves top-level runtime evidence stays ignored while both application routes are not ignored;
- the canonical Wave 1 pre-push check now includes this source-scope guard.

This is NOT an EMQX authentication failure. The live EMQX job has not yet reached broker startup in this run.

---

## WAVE 1 CROSS-PLATFORM BASELINE-MANIFEST CONTINUATION
Core GitHub `test` is green. After the report-route ignore scope fix, `rescue-live-emqx` advanced but still stopped before Docker/EMQX at sealed-source verification.

Root cause:
- the baseline manifest hashed raw checkout bytes;
- Windows could seal CRLF text while GitHub Linux checks out the same Git text as LF;
- `.editorconfig` exposed this first;
- this is checkout-byte drift, not application-content drift and not an EMQX authentication failure.

Permanent remediation:
- ordinary UTF-8 text is hashed in canonical LF form;
- `.cmd`/`.bat` launchers are hashed in canonical CRLF form;
- binary files keep exact raw-byte hashes;
- baseline manifest self-test proves LF/CRLF portability and still rejects real source changes;
- local pre-push and `rescue-live-emqx` run this portability proof before source sealing.

The manifest must be regenerated once after applying V10 and committed.

---

## WAVE 1 LARGE-BATCH CI HARDENING — LIVE EMQX SMOKE
The latest GitHub run finally reached real Docker/EMQX. The following live checks passed before the job timed out:
- live EMQX 5.9.2 detected;
- runtime login and tenant isolation;
- device registration/pairing/capability/heartbeat/rotation;
- valid device MQTT credential allowed;
- wrong device secret denied;
- device command subscription allowed;
- API publisher command publish allowed and received by the device.

The job then hit the outer 8-minute timeout immediately after the publisher-command PASS marker. This is NOT evidence of an EMQX authentication defect. The smoke harness had unbounded MQTT subscribe/publish callbacks for later negative ACL checks, so one broker/client callback could stall the whole job without naming the exact operation.

Large-batch permanent remediation:
- every MQTT subscribe and publish in the live smoke is bounded (default 8 seconds);
- a timeout is never treated as ACL-denial evidence;
- negative publisher/cross-device/wrong-device-ACK paths propagate timeout as a concrete CI failure;
- all connected MQTT clients are tracked and closed in final cleanup even when the smoke fails mid-run;
- major broker-smoke phases emit CHECK markers before risky operations;
- dependency-free self-tests simulate normal, denied, error, and hanging MQTT callbacks;
- GitHub runs the smoke self-test immediately before real EMQX smoke;
- the canonical local pre-push gate includes this harness self-test.

Work policy reaffirmed: ordinary CI failures are accumulated into coherent hardening batches rather than one micro-checkpoint per line.

---

## WAVE 1 V12 HANDOFF — EXPLICIT NEGATIVE ACL EVIDENCE

The GitHub run after V11 kept core `test` green and reached real EMQX 5.9.2. The live smoke passed valid device auth, wrong-secret denial, device command subscribe, and publisher command delivery, then failed at `publisher-non-command-denied` because the forbidden telemetry publish callback timed out.

Do not diagnose this as broken EMQX auth. The precise class is negative ACL connection reuse under `authorization.deny_action=disconnect`: a forbidden subscription can disconnect its client, and V11 then attempted another QoS-1 operation on that same disconnected client.

V12 fixes the complete class in one batch. All forbidden subscription/publish checks use fresh one-shot MQTT clients; explicit SUBACK/PUBACK denial, explicit authorization error, or MQTT v5 `DISCONNECT 0x87` is required; close-only/network ambiguity/timeout cannot count as denial; and forbidden side effects are checked independently. The batch covers publisher non-command operations, cross-device tenant isolation, and wrong-device ACK binding while preserving the primary positive device/publisher connections.

Work policy remains unchanged: local = targeted/lightweight only; one commit/push; GitHub = Docker/build/DB/Redis/EMQX/full acceptance. If GitHub is red again, collect the first failure and related failures in the same class before making another large Wave 1 batch. Rescue MQTT remains `127.0.0.1:18884`; do not reopen the old foreign `1883` broker issue. Production is still NOT APPROVED until physical ESP32/Wi-Fi reconnect/MQTT/OTA evidence is complete.

- Wave 2 sealing infrastructure is cross-platform deterministic: repository-tree ordering uses code-point order instead of host-default locale collation; mixed-case ordering is regression-tested.


---

## Wave 2 V5 recovery — Prisma schema tooling env

V4 reached `wave2:prisma:check` after all earlier local gates passed, then failed with Prisma P1012 because `DATABASE_URL` was absent from the operator PowerShell environment. This is not a schema/runtime defect. V5 replaces the direct Prisma command with an environment-safe wrapper that preserves CI/runtime `DATABASE_URL` and uses a loopback port-1 schema-only fallback only when the variable is absent. The wrapper self-test is part of `wave2:prepush:check`. GitHub still supplies real PostgreSQL and remains the only Wave 2 INTEGRATION database evidence. V5 must regenerate the target seal to 1033/1034. Do not push until V5 finishes the full local gate.


### V5 package QA
- Prisma schema-wrapper dependency-free self-test: PASS (fallback, explicit URL preservation, blank handling, validate→generate ordering).
- Wave 2 core runtime invariant self-test: PASS.
- baseline manifest regression: PASS.
- GitHub CI contract self-test: PASS.
- V5 applicator synthetic recovery: PASS from a sealed 1031/1032 V4 structural state through 12-file overlay, 1033/1034 regenerated seal, synthetic lightweight-gate invocation, and final verify.
- Real operator Prisma/Jest and GitHub PostgreSQL/HTTPS/Redis/EMQX/full acceptance remain pending and must not be inferred from the synthetic applicator test.

---

## Wave 2 recovery V6 — TypeScript contract closure

V5 reached real targeted Jest compilation after all inherited Wave 1 checks and Prisma schema/generate passed. The first failure class is now source-contract drift, not tooling: `CommandService.retryPublish` emits three legitimate retry metric events missing from `CommandMetricEvent`, and `NotificationService.claimDueBatch` inferred a literal `60000` default parameter type that rejects the runtime-configured numeric lease timeout. V6 fixes both contracts together, adds metrics regression coverage to the Wave 2 targeted suite, and leaves runtime semantics unchanged. No push has occurred; Wave 2 closes only after V6 local PASS plus one fully green GitHub Wave 2 heavy/live run.

### V6 QA status
Dependency-free Wave 2/baseline/CI/Prisma self-tests PASS, retry metric type contract PASS, changed TypeScript syntax/transpile PASS, and the V6 applicator has passed synthetic V5 recovery end-to-end with the authoritative seal count remaining `1033/1034`. Operator targeted Jest must still run for real before the one Wave 2 push.

---

## Wave 2 V7 — first GitHub heavy-integration correction

The first Wave 2 GitHub heavy run after V6 proved broad regression stability before stopping in the PostgreSQL integration stage: `185/185` unit suites (`1219/1219` tests) passed, the application E2E smoke passed `4/4`, and `13/15` database integration suites passed. `rescue-live-emqx` did not run because it is sequenced after the core job.

Two related Wave 2 integration defects were exposed and are fixed together in V7:

1. **Automation retry DB transition shape.** A FAILED automation action legitimately carries the terminal `commandId`, but the PostgreSQL transition constraint requires `commandId IS NULL` while the action is back in `DISPATCHING`. The retry claim now clears that terminal link and refreshes `dispatchStartedAt` from the PostgreSQL clock. The dispatcher then reattaches the same durable DeviceCommand after `retryPublish()` resolves through the unchanged automation idempotency key/correlation identity. This preserves retry identity while satisfying the real database state machine.
2. **Notification integration adapter contract.** `ClaimedNotificationDelivery` is a lease DTO with field `id`, while `NotificationTransportInput` intentionally requires `notificationId`. Production worker code already performs this mapping. The integration evidence now uses the same explicit adapter instead of passing the claim DTO directly to the transport. No production transport contract is weakened.

V7 adds source guards for both contracts and keeps the authoritative Wave 2 seal count at `1033/1034` (modified files only; no new source path). Wave 2 remains ACTIVE until the recovery is locally validated and a corrective GitHub run passes PostgreSQL/HTTPS integration, then real EMQX/full acceptance.


### V7 package QA
- GitHub failure-class analysis: unit layer `185/185` suites and `1219/1219` tests PASS; application E2E `4/4` PASS; PostgreSQL integration `13/15` suites PASS before the two Wave 2 blockers.
- Wave 2 core runtime invariant self-test: PASS after adding DB-shape and transport-adapter guards.
- Baseline manifest regression: PASS.
- GitHub CI contract self-test: PASS.
- Prisma schema-wrapper self-test: PASS.
- TypeScript transpile checks: PASS for automation retry service/spec and Notification integration evidence.
- V7 applicator synthetic recovery: PASS from a clean committed/sealed V6 `1033/1034` state through 10-file overlay, V7 regressions, regenerated `1033/1034` seal, synthetic lightweight-gate invocation, and final verify.
- PostgreSQL/HTTPS integration and real EMQX/full acceptance remain GitHub evidence and are not claimed from the chat container.

## Wave 2 V8 — GitHub Notification HTTPS evidence-harness portability

The V7 corrective GitHub heavy run closed the automation retry database constraint defect: unit/regression remained `185/185` suites (`1219/1219` tests), application E2E remained `4/4`, and PostgreSQL integration advanced to `14/15` suites (`58/61` tests). The only failing suite is now `test/integration/notification-runtime.integration-spec.ts`.

All three Notification runtime evidence cases fail before the HTTPS receiver starts because `import path from 'node:path'` is compiled by the repository's Jest/CommonJS path without a synthetic default export, leaving the imported binding undefined at `path.join(...)`. Teardown then reports a secondary `server.close` failure because setup never assigned `server`.

V8 fixes the evidence harness class without changing Notification business logic: use the CommonJS-safe named `join` import, model the HTTPS server as optional until setup completes, guard server/tenant cleanup, and always disconnect both Prisma clients in `finally`. The Wave 2 invariant test rejects the fragile default `node:path` import and requires guarded setup/teardown. The authoritative seal count remains `1033/1034`; no source path is added. Wave 2 remains ACTIVE until GitHub proves all 15 PostgreSQL/HTTPS integration suites, then runs `rescue-live-emqx` and the full acceptance chain.
### V8 package QA
- GitHub V7 evidence: unit/regression `185/185` suites (`1219/1219` tests) PASS; application E2E `4/4` PASS; PostgreSQL/HTTPS integration `14/15` suites with `58/61` tests PASS. Automation retry DB-state failure is closed.
- Root-cause reproduction: TypeScript transpile in CommonJS mode with `esModuleInterop=false` confirms the old default `node:path` import would require `.default.join`, while V8 named `join` compiles to the CommonJS-safe binding.
- V8 integration evidence source transpile: PASS.
- V8 self-test script syntax: PASS.
- V8 applicator synthetic recovery/sequencing: PASS from clean V7 `1033/1034` markers through 8-file overlay, unchanged `1033/1034` seal checks, synthetic lightweight-gate invocation, and final verify.
- Real PostgreSQL/HTTPS integration, `rescue-live-emqx`, and full acceptance remain GitHub evidence; no runtime PASS is inferred from the chat container.



## Active Wave 2 recovery: V9
Do not reopen V4-V8 symptom fixes individually. GitHub V8 narrowed the remaining failure to outbound Notification HTTPS evidence, but the old network layer erased its cause as `WEBHOOK_UNREACHABLE`. V9 replaces the shared outbound HTTPS foundation for both Webhook and Email Relay. Production TLS verification stays enabled; integration uses an explicit fixture CA and never a global TLS bypass. Wave 3 is blocked until V9 GitHub heavy acceptance is fully green.

V9 pre-handoff QA: shared HTTPS real-network checks + authoritative 1035/1036 seal + synthetic V8→V9 applicator all PASS; GitHub heavy evidence pending.


## Wave 3 V2 root-cause correction

Do not reopen Wave 1/2. The first Wave 3 heavy run reached the real ESP-IDF
toolchain and failed at component resolution before compilation (`main` required
nonexistent `iot_sdk`). V2 repairs the complete firmware build chain instead of
that single line: true component discovery, explicit IDF 5.5 API ownership,
4MB dual-OTA flash contract, secure MQTT CA verification, Wi-Fi-backed entropy
before long-lived secret generation, ESP image-magic validation, and a truthful
NVS security evidence boundary. ESP32 and ESP32-C3 now build and boot QEMU in a
parallel matrix, and cheap build-graph guards run before toolchain installation.
`rescue-live-emqx` still waits for core plus the full firmware matrix and consumes
the exact ESP32 build artifact. Wave 3 is not closed until both native targets,
QEMU, built-artifact OTA simulation, real EMQX and full acceptance are green.

### V2 package QA — native build-chain root correction
- dependency-free Wave 3 OTA/dedupe/rollback simulator: PASS
- ESP-IDF build-graph self-test: PASS
- Wave 3 source/evidence self-test: PASS
- GitHub CI contract self-test: PASS
- baseline manifest portability self-test: PASS
- workflow YAML + package JSON + pytest Python syntax: PASS
- Module 30 changed TypeScript contract transpile: PASS
- authoritative candidate seal: `1051/1052` PASS
- synthetic applicator from clean pushed V1 `1050/1051`: PASS through 23-file overlay, target-generated `1051/1052`, synthetic lightweight gate invocation, and final manifest verify
- real ESP-IDF 5.5.5 compilation/QEMU is intentionally NOT claimed locally because this container has no ESP-IDF toolchain/network; GitHub remains the native-build authority

## Wave 3 V3 — ESP-IDF 5.5 API compatibility root correction

The V2 heavy run proved the build graph fix by compiling the SDK on both ESP32 and ESP32-C3. Both targets failed identically at MQTT event registration because the SDK used API names that do not exist in ESP-IDF 5.5. V3 switches to the public ESP-MQTT contract `esp_mqtt_client_register_event(..., MQTT_EVENT_ANY, ...)` and adds a cheap API-surface guard before ESP-IDF installation. The guard also verifies owner header/component-dependency pairs for HTTP, OTA, RNG, netif, Wi-Fi, NVS and mbedTLS so this class is checked as a whole rather than one symbol per GitHub run. Do not reopen backend/DB/EMQX business logic: V2 core evidence remained green.

### Wave 3 V3 package QA
- Cheap API/build/source/simulation/CI guards PASS.
- V3 adds one source path and seals at `1052/1053`.
- Synthetic recovery from clean pushed V2 `1051/1052` through 12-file overlay, reseal, gate invocation and final verify PASS.
- Real dual-target compile/QEMU remains GitHub evidence; no native PASS is fabricated locally.


## Wave 3 V4 handoff
Current correction class: ESP-IDF/QEMU CI toolchain lifecycle. V3 build graph and ESP-IDF 5.5 API surface are closed. Both chip targets built, then `. "$IDF_PATH/export.sh"` re-activation failed because the action-managed tool registry was re-read inconsistently. V4 uses one environment owner (`espressif/install-esp-idf-action@v1`), the action venv for QEMU/pytest installation, and explicit QEMU PATH export without reactivation. Do not reopen backend/Wave 2 issues.


### Wave 3 V5 root-cause correction

The V4 heavy run closed compile and QEMU installation but exposed a tool-version boundary: pytest-embedded-qemu 2.9.2 invoked esptool v5-style `merge-bin` against the ESP-IDF 5.5.5 esptool 4.12.0 CLI, which accepts `merge_bin`. V5 removes that redundant compatibility layer from mandatory evidence. The project now generates its QEMU flash through `idf.py merge-bin` and runs the target-specific QEMU binary directly under a bounded repository-native boot harness. Do not reintroduce pytest-embedded into the mandatory QEMU gate without an explicit compatibility proof against the pinned ESP-IDF/esptool pair.

Wave 3 V5 deep-scan note: do not substitute the QEMU merged full-flash image for the OTA application artifact. The QEMU runner verifies matrix target identity and an exact 4 MiB merged image; live OTA simulation continues to consume `iot_sdk_wave3_test_app.bin` and verifies its ESP application-image magic/SHA-256 separately.
