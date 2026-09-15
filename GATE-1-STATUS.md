# Gate naming clarification — 2026-09-15

This file is historical Rescue Gate 1 evidence and must not be confused with the enterprise Wave 1–13 master roadmap. The active roadmap is `docs/ENTERPRISE-WAVE-ROADMAP.md`. Wave 1 software/CI and Wave 2 Core Runtime Closure are CLOSED GREEN; Wave 3 ESP32 + OTA Automated Simulation is ACTIVE. Production approval still requires later physical/HIL and final certification waves.

---

# GATE 1 STATUS — RR29

Status: **REVALIDATION REQUIRED ON OPERATOR PC**

## Live RR28 proof

- Local recovery: PASS.
- Runtime status: `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`.
- Dedicated rescue MQTT endpoint: `mqtt://127.0.0.1:18884`.
- Infra protocol probe: READY / 0 blockers.
- Full protocol probe: READY / 0 blockers.
- `rescue:gate1`: LIVE PASS and PASS receipt generated.
- `rescue:gate1:validate`: failed only with `ReferenceError: currentState is not defined`.

## RR29 change

The validator's `currentState` variable is now outer-scoped so it remains available when building `RESCUE_MQTT_HOST_PORT` / `RESCUE_MQTT_BROKER_URL` for the live recheck. A dependency-free end-to-end validator regression test locks both scope and endpoint propagation. No runtime/business logic is changed.

Because RR29 changes sealed source, obtain a fresh source-bound local runtime/Gate 1 PASS once before entering Gate 2. Production remains **NOT APPROVED**.

## Wave 2 V6 note
V5 advanced through Prisma validate/generate and into targeted Jest compilation. V6 closes the two compile-time contract drifts exposed there (retry metric event union and notification numeric lease parameter). This does not alter Gate 1 physical-production evidence requirements.

## Wave 2 V7 note
The first Wave 2 GitHub heavy run passed the full unit/E2E layers and most PostgreSQL integration suites, then exposed a real automation retry transition-shape violation plus a Notification integration DTO adapter mismatch. V7 fixes those two Wave 2 integration contracts without altering historical Rescue Gate 1 physical-production evidence requirements.

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



## Wave 2 V9 root-cause correction (2026-09-15)
- GitHub V8: unit 185/185 and E2E 4/4 passed; DB integration 14/15 suites passed.
- Remaining 3 Notification tests all failed as `WEBHOOK_UNREACHABLE`; the old transport flattened the underlying TLS/socket cause.
- Root correction: one shared `NotificationHttpsClient` for Webhook + Email Relay, explicit scoped CA trust for tests, absolute timeout, TLS/network/timeout classification, no global TLS bypass.
- Container QA: actual HTTPS success with fixture CA PASS; untrusted cert -> TLS/DEPTH_ZERO_SELF_SIGNED_CERT PASS; timeout -> ETIMEDOUT PASS; refused socket -> NETWORK/ECONNREFUSED PASS; changed TypeScript transpile PASS; Wave 2 invariant PASS.
- Wave 2 remains ACTIVE pending Windows local 14-suite gate and GitHub heavy acceptance.


## Wave 3 automated-simulation note
Wave 3 adds mandatory ESP-IDF 5.5.5 compile, QEMU boot, and a live-service ESP32 digital twin bound to the exact built firmware artifact. OTA simulation verifies artifact bytes/SHA-256 and exercises reject/interruption/rollback/confirm paths. These are SIMULATED-HARDWARE/LIVE-SERVICE evidence only; historical Rescue Gate 1 physical-production requirements remain unchanged.


## Wave 3 V2 build-chain status — ACTIVE

- Wave 1/2 inherited core baseline remained GREEN in the first Wave 3 run.
- First Wave 3 heavy failure: ESP-IDF component graph (`REQUIRES iot_sdk`) before C compilation.
- V2 root-cause batch closes the native class: component discovery, explicit IDF API ownership, dual-target 4MB OTA build contract, secure MQTT CA, Wi-Fi-backed secret entropy, real ESP image-magic validation, and truthful simulated-vs-HIL NVS security evidence.
- ESP32 and ESP32-C3 now build and boot target-specific QEMU as a parallel matrix; firmware starts in parallel with core CI and cheap build-graph guards run before toolchain install.
- No ESP-IDF/QEMU PASS is claimed from local/chat QA. GitHub remains authoritative for compile/emulation/live-service evidence.
