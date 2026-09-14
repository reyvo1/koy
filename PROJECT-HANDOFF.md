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
- ESP32 contract assertions follow the current canonical SHA-256/encrypted-NVS wording.

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
