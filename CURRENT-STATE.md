# CURRENT STATE — ENTERPRISE WAVE 3

## Authoritative active state — 2026-09-28

> **Reading rule for this file.** This is a prepend-style document: older `ENTERPRISE WAVE 2`,
> `Wave 1 V13` and `RR29` blocks are stacked below and were never retracted in place. Some of
> them still say "Wave 2 remains ACTIVE" — that is **superseded** by this block and by
> `docs/ENTERPRISE-WAVE-ROADMAP.md`. Do not treat a status line from a lower block as current.

- Wave 1 Rescue/CI/EMQX hardening: **CLOSED GREEN**.
- Wave 2 Core Runtime Closure: **CLOSED GREEN** after V9 heavy GitHub acceptance.
- Wave 3 ESP32 + OTA Automated Simulation: **ACTIVE**.
- The V5 QEMU boot path is **GREEN on GitHub**. Run 34986815462 succeeded on all four
  jobs (14m58s), including `Boot esp32 linked SDK firmware in Espressif QEMU` and
  `Boot esp32c3 linked SDK firmware in Espressif QEMU`. Do not reopen the QEMU boot
  command, the ESP-IDF environment ownership (V4), the ESP-MQTT API surface (V3) or
  the esptool v4/v5 `merge_bin` drift (V5). These are closed root causes with green
  evidence.
- A V6 attempt to add four device arguments that ESP-IDF's native `idf.py qemu`
  frontend passes (eFuse backing store, `wdt_disable`, ESP32 `-m 4M`) was **reverted**.
  GitHub run 36376040283 proved the hypothesis wrong: ESP32 booted fine, but the
  ESP32-C3 target stopped emitting output at
  `W eFUse: calibration efuse version does not match, set default version to 0` and
  never reached `app_main`, so all three boot markers timed out. The V6 eFuse image
  sets byte `0x0c` at offset `0x26`, which changes calibration-eFuse state on ESP32-C3.
  Divergence from the upstream frontend is not evidence of a defect; the previous
  green run is. Full analysis in the `chat-session.md` entry for 2026-09-28.
- Retained from V6, because it was reproduced locally and is independent of QEMU:
  `scripts/manage-baseline-manifest.mjs` now excludes any directory named `build` at
  any depth from the sealed source set. ESP-IDF writes its entire output tree into
  `packages/esp32-sdk/test-app/build/`, so the operator's own
  `baseline:manifest:generate` would otherwise seal a 4 MiB binary and then fail on the
  next clean verify. Three regression assertions were added to
  `scripts/self-test-baseline-manifest.mjs`, including one that removes the exclusion
  and asserts the failure returns, so the rule is proven load-bearing.
- Candidate seal: 1054 source paths / 1055 manifest entries, matching V5's counts.
- Blocker for the next green run is **not** code: the GitHub account has exhausted its
  Actions artifact storage quota (`Failed to CreateArtifact: Artifact storage quota has
  been hit. Usage is recalculated every 6-12 hours.`). That fails the `test` job at
  `Upload production release artifact` and the ESP32 job at
  `Upload Wave 3 firmware artifact` even when every preceding step passes. It must not
  be misread as a Wave 3 defect.
- Evidence boundary: automated Wave 3 evidence is `SIMULATED-HARDWARE` /
  `LIVE-SERVICE`. Physical ESP32/HIL remains `PENDING PHYSICAL/EXTERNAL EVIDENCE`.
- Production: **NOT APPROVED**.
- Work policy: one large batch per wave, local targeted/lightweight only, then one
  GitHub push. Before pushing any change to a toolchain-integrated gate, check the
  previous run's actual conclusion with `gh run list`.

## Authoritative active state — 2026-09-15 (Wave 3 V5)

- Wave 1 Rescue/CI/EMQX hardening: **CLOSED GREEN**.
- Wave 2 Core Runtime Closure: **CLOSED GREEN** after V9 heavy GitHub acceptance.
- Wave 3 ESP32 + OTA Automated Simulation: **ACTIVE**.
- Active target: real ESP-IDF 5.5.5 compile, QEMU boot, live-service ESP32 digital twin against rescue PostgreSQL/API/EMQX, reconnect/telemetry/command/ACK/dedupe, and OTA SHA-256/reject/interruption/rollback simulation using the exact built firmware artifact.
- Evidence boundary: automated Wave 3 evidence is `SIMULATED-HARDWARE` / `LIVE-SERVICE`. Physical ESP32/HIL remains `PENDING PHYSICAL/EXTERNAL EVIDENCE` until final Wave 13 certification and is never inferred from simulation.
- Production: **NOT APPROVED**.
- Work policy: finish Wave 3 as one large batch, local targeted/lightweight only, then one GitHub push for mandatory ESP-IDF/QEMU/live-service/full regression evidence.

---

# IoT Platform — Current State — Enterprise Wave 2

## Wave 2 active baseline — 2026-09-15

- Master execution roadmap: `docs/ENTERPRISE-WAVE-ROADMAP.md`, Wave 1–13.
- Wave 1 Rescue/CI/EMQX hardening: **CLOSED / GitHub green on V13**.
- Wave 2 Core Runtime Closure: **ACTIVE, implementation complete; operator lightweight gate reached rescue validation and exposed a sealing-validator regression; V4 recovery hardens evidence semantics and runtime integration, not yet pushed**.
- One-wave-one-push policy is mandatory. Heavy Docker/build/PostgreSQL/Redis/EMQX/full acceptance remains GitHub-only.
- Rescue MQTT remains `127.0.0.1:18884`; the foreign Windows Mosquitto on 1883 is closed history and must not be reopened.
- Production remains **NOT APPROVED** until later physical ESP32/Wi-Fi reconnect/MQTT/OTA evidence and Wave 13 certification.

Wave 2 implementation scope:

1. Automation delayed retry worker behind `AUTOMATION_RUNTIME_ENABLED`, PostgreSQL-authoritative bounded candidate scan/claim, atomic rollback on claim races, retryable-error revalidation, and true republish of the same durable FAILED/TIMED_OUT command identity/correlation id.
2. Scheduler enable endpoint fail-closes while `SCHEDULER_RUNTIME_ENABLED=false`; disable remains available and boolean input is strict.
3. Notification runtime adds `DELIVERING` lease state, stale-lease recovery, multi-instance-safe claims, PostgreSQL-clock retry timing, transient-only retry policy, auth verification/reset email enqueue, and provider-neutral HTTPS email relay behind `NOTIFICATION_RUNTIME_ENABLED=false` by default.
4. Notification idempotency now rejects semantic collisions and outbound relay/webhook requests expose a stable notification idempotency identifier for downstream dedupe.
5. GitHub core and rescue jobs explicitly execute the Wave 2 runtime invariant self-test before heavy validation.

The detailed Wave 2 contract and validation gate are in `docs/wave-02-core-runtime-closure.md`.

Wave 2 source-level validation is green for the V4 batch: baseline manifest regression, Wave 2 invariant self-test, GitHub CI self-test, package/YAML checks and TypeScript syntax/transpile for the changed integration tests. The authoritative seal remains target-generated at 1027 source paths / 1028 manifest entries before V4 additions are resealed on the operator checkout. `apps/*/next-env.d.ts` and `*.tsbuildinfo` are generated artifacts; authored `.d.ts` remains sealed. V4 also adds PostgreSQL runtime integration for durable automation retry plus multi-client Notification lease/retry delivery through a real local HTTPS receiver. Evidence tiers are governed by `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md`; source validation alone cannot close Wave 2.

---

# IoT Platform — Current State — Wave 1 V13

> **SOURCE OF TRUTH FOR NEW WORK — 2026-09-15.** Historical RR sections below remain evidence only.

## Active status

Core GitHub `test` is GREEN (180/180 suites, 1187/1187 tests). The V12 `rescue-live-emqx` run reached real EMQX 5.9.2 and proved the V12 MQTT negative-ACL lifecycle hardening: `publisher-non-command-operations-denied` now PASSes, as do valid auth, wrong-secret denial, command subscribe/delivery, telemetry publish, and webhook idempotency.

The current first failure is no longer MQTT. `POST /dashboards` returned HTTP 400 `DASHBOARD_WIDGET_RESOLUTION_INVALID` because the live acceptance fixture declared a `GAUGE` while binding the already-proven `power` capability whose `dataType` is `boolean`. The production resolver is behaving correctly: GAUGE requires a numeric capability.

V13 fixes the acceptance fixture contract, not production resolver behavior. The boolean power telemetry evidence now uses a `CARD` widget with a `READ`/`LATEST` binding to the same capability. Self-tests lock the capability/widget/binding relationship and fail closed on any regression to boolean+GAUGE. No Prisma schema, dashboard business rule, MQTT auth rule, UI product behavior, or rescue endpoint changes.

Production remains NOT APPROVED pending physical ESP32/Wi-Fi reconnect/physical MQTT/OTA evidence. The foreign host broker on `1883` remains out of scope; rescue MQTT remains `127.0.0.1:18884`.

---

---

## RR30 — GitHub-hosted heavy validation restoration

Heavy build/integration validation is restored to the existing GitHub Actions path instead of being repeatedly executed on the Windows/WSL developer host. The original `test` job remains intact. A new `rescue-live-emqx` job runs after core CI on `ubuntu-latest`, generates an ephemeral rescue `.env`, brings up the source-controlled `docker-compose.rescue.yml` with Docker Compose, performs a targeted PostgreSQL integration stability gate, executes a real EMQX broker smoke (device/publisher auth, wrong-secret denial, ACLs, telemetry webhook/idempotency, command/ACK correlation, cross-device denial, revocation, wrong-webhook-secret denial), revalidates Gate 1, then runs exactly one full automated acceptance. Reports and Compose logs are uploaded even on failure; runner volumes are removed only at final CI teardown.

The dedicated rescue host MQTT endpoint remains `127.0.0.1:18884`. The old host `127.0.0.1:1883` Mosquitto diagnosis is closed and must not be reopened without new evidence against `18884`. Physical ESP32/OTA proof remains a separate non-GitHub-hosted hardware gate.
# IoT Platform — Current State

> **SOURCE OF TRUTH FOR NEW WORK — RR29, 2026-09-13.** Historical sections below remain evidence only.

## Current Phase

**RESCUE-02B-RUNTIME-READINESS-29 — GATE-1 VALIDATOR SCOPE REPAIR**

RR28 live execution proved the host-port isolation root fix: Mosquitto may remain on `127.0.0.1:1883`, rescue EMQX is reached on dedicated `mqtt://127.0.0.1:18884`, local runtime reached full protocol readiness with zero blockers, and the Gate 1 runner generated a PASS receipt. Gate 1 validation then crashed before performing its recheck because `currentState` was block-scoped in `validate-rescue-gate1-receipt.mjs` and referenced by the following local-topology block.

RR29 repairs only that validator scope and adds an end-to-end synthetic validator regression proving both the PASS receipt path and propagation of the source-bound dedicated rescue MQTT endpoint. No EMQX configuration, auth backend, database schema, Web/Mobile source, or Gate 2 business logic changes. Production is not approved; after RR29 source-bound Gate 1 validates, run full automated acceptance once and continue with new RR29 live evidence.

# RR26 — Dashboard widget integration authorization fixture alignment

RR26 continues directly from the RR25 live Gate 2 run. RR25 Gate 1 is source-bound LIVE PASS and validated. Full acceptance passed source validation, manifest verification, lifecycle, live runtime preflight, backend production build, complete Web/mobile validation, and **all Unit/contract tests**. The blocker moved forward to Database integration, where 13/14 suites and 55/57 tests passed; only `test/integration/dashboard-widget-query.integration-spec.ts` failed two expectations because the integration fixture predated centralized MEMBER device authorization.

Root cause is proven and narrow: production `DashboardService` now intentionally fails closed for MEMBER dashboard bindings unless both `context.userId` and `DeviceAccessService` are present. The stale integration fixture created a MEMBER and device but did not retain/pass the user identity, did not make that user the device owner, and instantiated `DashboardService` without `DeviceAccessService`. Production correctly filtered both bindings, producing `state: INVALID` with an empty binding list. RR26 fixes the fixture instead of weakening production security: it wires `DeviceAccessService`, records `userId`, assigns `device.ownerId = user.id`, and passes `userId` in both MEMBER query contexts. A source-controlled regression self-test locks this authorization setup while also asserting the production fail-closed branch remains intact.

RR25 crash recovery also proved fail-closed in the live run: `rescue:local:recover` rolled back when one API image build hit a transient `npm ci` failure, and the subsequent Gate 1 bring-up rebuilt successfully and reached a validated PASS. No PostgreSQL volume/schema corruption was demonstrated.

Because RR26 changes sealed source, obtain a fresh source-bound Gate 1 PASS once, then resume Gate 2 at full acceptance. The immediate target is to pass Database integration and continue to MQTT integration / `AUTOMATED_TEST_SUITE_PASS`.

---

# RR25 — Windows-safe self-test path + crash-safe local runtime recovery

RR25 continues directly from the RR24 live attempt. RR24 sealed-source validation was healthy (`995/995` repository tree, `996/996` manifest, Rescue `256/256`). The operator then experienced a Windows blue screen / interrupted local-runtime sequence. The resulting evidence showed two independent issues: `rescue:unit-regressions:self-test` built an invalid Windows path (`C:\C:\...`) because it used URL `.pathname`, while the live runtime was partial/offline (`PostgreSQL`, `Redis`, EMQX Dashboard, and API returned `ECONNREFUSED`) and Gate 1 correctly refused the transient tracked state. This is not treated as a PostgreSQL schema or product-code regression.

RR25 fixes both operational roots without changing product behavior, Prisma schema/migrations, RBAC, MQTT topics, or application APIs:
- `self-test-unit-runtime-regressions.mjs` resolves the repository root with `import.meta.dirname`, eliminating Windows drive-prefix duplication;
- new `npm run rescue:local:recover` is the canonical post-BSOD/interruption path. It never deletes named volumes, normalizes a possibly partial Compose stack with `down`, reruns complete `up`, and only succeeds after full protocol readiness;
- if the tracked runtime is already source-bound, environment-matched, and full-protocol READY, recovery exits without mutation;
- Gate 1 blocker messages now direct interrupted/crashed operators to `rescue:local:recover` rather than requiring manual state diagnosis;
- local-runtime synthetic regression explicitly simulates an `INFRA_STARTING` interruption and proves recovery returns to `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING` while preserving volumes.

Because RR25 changes sealed source, obtain a fresh source-bound Gate 1 PASS after recovery, then resume Gate 2 at the full acceptance run. The last proven pre-BSOD Gate 2 position remains RR23/RR24's unit-test cleanup path; RR24's final acceptance attempt did not reach unit tests because runtime connectivity was offline after the interruption.

# CURRENT STATE — RESCUE-02B RUNTIME READINESS 24

RR24 continues directly from the proven RR23 live Gate 2 run. RR23 Gate 1 is source-bound LIVE PASS and validated. Full acceptance passed Rescue source validation, exact manifest verification, lifecycle validation, live runtime connectivity preflight, backend production build, complete Web/mobile validation, and reduced the root Jest blocker to only 3 failed suites / 8 failed tests out of 180 suites / 1,185 tests.

The complete RR23 failure index proved that the remaining failures are concentrated in three unit-test contracts, not in runtime infrastructure:

- `src/device/command.controller.spec.ts` — 4 tests failed before execution because the legacy Nest `TestingModule` attempted to resolve the controller's newer `DeviceAccessGuard` dependency graph. These tests only verify method delegation and should not compile the authorization container. Production `DeviceAccessGuard` remains unchanged and independently tested.
- `src/telemetry/telemetry.controller.spec.ts` — 3 tests failed for the same reason: a delegation unit test still bootstrapped the full Nest guard container after telemetry routes were hardened with `DeviceAccessGuard`.
- `src/scheduler/schedule-due-run.service.spec.ts` — 1 assertion was stale. The implementation correctly settles a claimed run with the exact `claimedAt` ownership token to prevent a stale worker from overwriting a newer claimant, but the test still expected only `{ id, status }`.

RR24 fixes the tests at their correct abstraction boundary: controller delegation specs directly instantiate their controllers with mocked services while production authorization decorators remain intact; the scheduler expectation now requires the `claimedAt` lease token. A dependency-free `rescue:unit-regressions:self-test` plus Rescue guardrails lock these invariants. No API, database, MQTT, EMQX, RBAC, scheduler runtime behavior, or product UI semantics are changed.

Because RR24 changes sealed source, the RR23 Gate 1 receipt cannot be reused. Rebind Gate 1 once on RR24, then resume Gate 2 directly at full acceptance.

## Historical state — RESCUE-02B RUNTIME READINESS 22

RR22 continues directly from the proven RR21 live Gate 2 run. RR21 Gate 1 is source-bound LIVE PASS and validated. Full acceptance passed Rescue source validation, exact manifest verification, lifecycle validation, live runtime connectivity preflight, backend production build, and complete Web/mobile validation. The newest blocker moved to root `Unit/contract tests`; independently, the synthetic acceptance self-test failed on Windows before execution because its temporary source copy traversed a nested `.next` symlink forest.

Root-cause analysis found two infrastructure/test-boundary defects rather than 19 independent product failures. Root Jest used ts-jest with the unconstrained repository `tsconfig.json`; `tsc --showConfig` therefore included both Admin Web and User Web `next-env.d.ts` files. Their Next.js ambient declarations augmented `NodeJS.ProcessEnv` and made `NODE_ENV` mandatory, which invalidated backend tests that intentionally pass partial environment maps. Separately, the acceptance self-test filter ignored `.next` only at repository top-level, so a real `apps/admin-web/.next/node_modules/...` symlink was copied into `%TEMP%` and Windows returned `EPERM`.

RR22 fixes both boundaries structurally:

- root Jest roots are explicit: backend `src`, root `test`, and canonical Mobile unit-test source only;
- ts-jest uses dedicated `tsconfig.jest.json`, excluding Admin/User Web and pinning globals to `node` + `jest`;
- automation runtime policy accepts a framework-neutral readonly environment record instead of ambient `NodeJS.ProcessEnv`;
- acceptance self-test excludes generated `.next`, `node_modules`, `dist`, `coverage`, and `.git` directory segments at any depth, while preserving legitimate nested product routes such as `app/super/reports`;
- a new `rescue:unit-types:self-test` plus Rescue validator checks prevent both regressions.

Local proof before sealing: old root TS program included 630 files including both Next `next-env.d.ts`; RR22 Jest program includes 375 files with zero Admin/User Web or Next env declarations; a synthetic mandatory-`NODE_ENV` ProcessEnv augmentation compiles the automation policy/spec successfully; acceptance self-test passes with nested generated-tree exclusion; Rescue validation is 251/251 PASS before seal.

Because RR22 changes sealed source, RR21 Gate 1 cannot be reused as an RR22 receipt. Rebind Gate 1 once, then resume Gate 2 directly at the unit-test boundary.

RR20 continues directly from the proven RR19 live run. RR19 Gate 1 produced a source-bound PASS receipt and `rescue:gate1:validate` permitted Gate 2. Full acceptance again passed Rescue source validation, exact manifest verification, lifecycle validation, the live runtime prerequisite/connectivity probe, and backend production build. Admin Web and User Web no longer block the web/mobile validation stage; the newest failure moved to `@iot-platform/user-mobile` typecheck.

A source-isolated strict Mobile probe removed Expo/React dependency noise and exposed three real local contract defects:

- `mobile-dashboard-screen.tsx` required an `onSendCommand` prop in `DashboardSelector` even though that local component neither receives nor uses it.
- `mobile-dashboard-widget.tsx` required the same unused prop in `GaugeValue`, making the valid call site fail strict JSX prop checking.
- `mobile-device-detail-panel.tsx` narrowed `detail` to non-null for rendering but then captured `detail.device.id` inside nested async `send()`, where TypeScript does not preserve that narrowing.

RR20 removes the two stale prop requirements and captures `const deviceId = detail.device.id` immediately after the non-null guard, using that stable value inside the async command callback. Three Rescue guardrails prevent all three regressions. No API, database, MQTT, EMQX, RBAC, runtime topology, or product behavior changes.

Because RR20 changes sealed source, the RR19 Gate 1 receipt becomes stale for RR20 and must be rebound once through the normal local-runtime/Gate 1 sequence before Gate 2 resumes.

## RR20 pre-seal evidence

- isolated Mobile strict source probe after patch: **PASS / 0 local contract errors** once dependency/contextual-typing noise is excluded;
- three prior Mobile contract failures reproduced before patch and absent after patch;
- Rescue validator target count increases by three guardrails;
- manifest/runtime/broker contracts otherwise unchanged.

# IoT Platform — Current State

> **SOURCE OF TRUTH FOR NEW WORK** — updated 2026-09-13.
> Historical Module/Slice documents remain evidence only. They must not decide the current work phase when they conflict with this file.

## Current Phase

**RESCUE-02B-RUNTIME-READINESS-22 — UNIT-TEST TYPE BOUNDARY / GATE 2 RECOVERY**

The historical 30-module roadmap remains closed as development evidence, but the product is **not approved for production deployment**. Feature expansion stays paused until the real core flow passes runtime integration.

RR21 Gate 1 is a proven LIVE PASS and Gate 2 has advanced through backend build plus all Web/mobile validation. The current blocker is the root unit/contract test boundary, where Next Web ambient declarations leaked into ts-jest and changed backend `ProcessEnv` typing; the synthetic acceptance self-test also exposed a separate Windows nested `.next` copy bug. RR22 isolates the Jest compiler/execution scope, decouples automation policy tests from ambient framework declaration merging, and excludes nested generated trees from the self-test copy. Because sealed source changed, RR22 must obtain its own source-bound Gate 1 PASS before Gate 2 resumes. ESP32, OTA, release approval, and production approval remain pending.



## RESCUE-02B Runtime Readiness 12 Applied — EMQX Rule Round-Trip Compatibility

RR12 continues directly from RR11 using evidence from the real Windows/Podman run. The one-network topology is proven: PostgreSQL/Redis/EMQX protocol readiness passed, the rescue API image built, Prisma migrations ran, the API started inside Compose, the MQTT publisher connected to EMQX, API liveness passed, and EMQX HTTP authentication configuration completed. The remaining failure moved beyond networking into the source-controlled webhook helper's post-mutation rule verification.

- `configure-emqx-webhooks.mjs` no longer requires byte-for-byte equality of SQL returned by EMQX. EMQX's rule API exposes parsed rule fields (`enable`, `from`, `sql`, `actions`, `action_details`), and brokers may normalize SQL formatting/case when serializing it back.
- Managed SQL is now canonicalized for whitespace/punctuation and SQL keyword case before comparison. Payload field paths, aliases, quoted topic strings, and operators remain part of the comparison; semantic drift still fails closed.
- The verifier separately requires `enable=true`, the expected source topic when EMQX returns `from`, and the exact managed bridge action through `actions` or equivalent `action_details`.
- Failure diagnostics now distinguish disabled rule, SQL semantic drift, source-topic drift, and action drift instead of one opaque round-trip error.
- The dependency-free EMQX fixture now emulates broker-normalized SQL/action details and proves that formatting-only normalization passes while a changed source topic still fails closed.
- No API endpoint, MQTT topic, webhook secret, permission, product feature, or database schema changed.
- Gate 1 remains **PENDING** until the operator reruns RR12 live and both final Gate commands PASS.

### RR12 source evidence

- Rescue validator: **236/236 PASS**.
- EMQX webhook self-test: **PASS**, including normalized round-trip positive path and wrong-source negative path.
- Official EMQX rule API contract used by this fix exposes `enable`, `from`, `sql`, `actions`, and `action_details`; bridge actions are represented as strings such as `webhook:<name>`.
- Canonical tree/manifest are regenerated and verified at seal time.
- Live Gate 1/RESCUE-02B/ESP32/OTA/production approval remain pending until real runtime evidence passes.

## RESCUE-02B Runtime Readiness 11 Applied — One-Network Local Runtime Topology

RR11 continues from the cumulative live Gate 1 fixes applied on top of RR10. It is a topology correction, not a product feature change. The real Windows/Podman execution proved dependency bootstrap `READY`, PostgreSQL/Redis/EMQX infra protocol readiness PASS, backend build PASS after compiler fixes, committed Prisma migration PASS, API liveness PASS, and EMQX HTTP authentication configuration PASS. The next failure was isolated to EMQX webhook bridge probing: `Connection refused` when the broker tried to call a Windows-host API through `host.docker.internal` / `host.containers.internal`, even with Podman user-mode networking enabled.

RR11 removes that host/VM boundary completely:

- PostgreSQL, Redis, EMQX, and API are now all Compose services on the same default network.
- Added `ops/docker/Dockerfile.rescue-api` using Node 22 + npm 10.9.8. It installs exact-lock dependencies, builds the backend, then the container entrypoint applies `prisma migrate deploy` before `node dist/main.js`.
- The API service receives internal dependency URLs: PostgreSQL `postgres:5432`, Redis `redis:6379`, MQTT `emqx:1883`. Host-published ports remain available for protocol probes and later integration tests.
- Local EMQX authentication/webhook configuration is forced to the internal callback origin `http://api:3000`; stale `.env` values pointing at host boundaries cannot override the local orchestrator.
- `rescue:local:up` now stages infra first, then explicitly builds and starts the API Compose service. It no longer performs a Windows-host backend build, Windows-host Prisma migration, or tracked host API process for local-compose mode.
- Failure rollback brings down the complete Compose stack. `--keep-on-failure` retains the complete stack for operator debugging. Named volumes remain preserved unless `--volumes` is explicit.
- `.dockerignore` prevents `.env`, `node_modules`, `dist`, `reports`, and other generated/runtime material from entering the API build context.
- Runtime docs and EMQX examples now use the internal `api` service address.
- Gate 1 remains **PENDING** until this exact topology is rerun live and both `rescue:gate1` and `rescue:gate1:validate` PASS. RR11 does not infer a live PASS from synthetic tests.

### RR11 source evidence

- Rescue validator: **235/235 PASS**.
- Lifecycle validator: **PASS**.
- TypeScript/TSX syntax parser: **627/627 PASS**.
- JS/MJS/CJS syntax: **56/56 PASS**.
- JSON: **26/26 PASS**.
- YAML: **3/3 PASS**.
- EMQX webhook, protocol probe, local runtime topology/rollback, acceptance orchestrator, and production approval self-tests: **PASS**.
- Canonical tree/manifest are regenerated and verified at seal time.
- Live Gate 1/RESCUE-02B/ESP32/OTA/production approval remain pending until real runtime evidence passes.

## RESCUE-02B Runtime Readiness 10 Applied — Dependency-Resolved Build Hotfix

RR10 continues directly from RR09 after the first real Windows/Podman Gate 1 execution reached dependency `READY` and **infra protocol readiness PASS**, then exposed dependency-resolved TypeScript declaration/build failures that parser-only validation could not see. No product feature, Prisma migration, or permission model was changed.

- `DeviceAccessService.resolveMany()` now constructs explicitly typed `[string, DeviceAccessDecision]` entries so OWNER / CONTROL_SHARE / VIEW_SHARE / NONE remain the intended union during declaration build instead of collapsing to the first tuple variant.
- `ScheduleDueRunService.recoverStaleClaims()` explicitly types `claimTimeoutMs: number`; `SCHEDULER_RUN_LIMITS.defaultClaimTimeoutMs` remains the runtime default but no longer narrows the public parameter to the literal `300000`.
- `WorkspaceDevice` is exported from `AccessibleSpaceService`, allowing Nest/TypeScript declaration emission for the public controller method without TS4053.
- Rescue source collection now ignores generated dependency/build trees and symlinks, and normalizes Windows path separators when enforcing the single Admin design-system root import.
- Guardrails bind all four portability/build contracts.
- Live Gate 1 status remains **PENDING** until the operator reruns `rescue:local:up`, `rescue:gate1`, and `rescue:gate1:validate` successfully. Infra readiness observed before the build failure is not promoted to a Gate 1 PASS.

### RR10 source evidence

- Rescue validator: **230/230 PASS**.
- Lifecycle validation and canonical manifest verification are required again after overlay because the sealed source fingerprint changes.
- No runtime/production PASS is claimed by this checkpoint.

## RESCUE-02B Runtime Readiness 09 Applied — Gate 1 Machine Closure

RR09 continues directly from sealed RR08 and adds no product feature, dependency, or Prisma migration. It makes the previously verbal **Gate 1 — Dependency & Core Runtime Bring-up** a machine-enforced boundary.

- `rescue:gate1` source-validates the sealed tree, runs the dependency doctor, optionally attempts exact-lock `npm ci`, then requires either the local orchestrator or approved external topology to pass the full protocol-aware runtime preflight.
- A PASS report is source-fingerprinted to `package-lock.json`, `BASELINE-MANIFEST.sha256`, and `repository-tree.txt`. Dependency/network/service blockers produce explicit `GATE1_BLOCKED_*` reports and cannot be relabeled PASS by the runner.
- `rescue:gate1:validate` is the Gate 2 entry barrier. It rejects stale/non-PASS receipts, rechecks the source fingerprint, reruns dependency doctor with network intentionally irrelevant after install, and reruns the live full protocol preflight.
- For local topology, Gate 2 entry additionally requires the tracked `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING` runtime state.
- Runtime reports remain under ignored top-level `reports/` and are never sealed as source evidence.
- In this execution environment, Gate 1 remains objectively blocked: npm registry DNS/HTTPS is unavailable, no Docker/Podman or PostgreSQL/Redis/EMQX runtime binaries are available, and no live project runtime exists. **Gate 1 PASS is not claimed.**
- The actual `rescue:gate1 -- --env=.env --topology=local --attempt-install` run terminated `GATE1_BLOCKED_DEPENDENCY` (exit 2) after source/manifest/lifecycle PASS; bootstrap status was `DEPENDENCY_NETWORK_BLOCKED` with `registry.npmjs.org EAI_AGAIN`. No partial `node_modules` residue remains.

### RR09 source/static evidence

- Rescue validator: **226/226 PASS**.
- Lifecycle validator: **PASS**.
- TypeScript/TSX syntax: **629/629 PASS**.
- JS/MJS/CJS syntax: **56/56 PASS**.
- JSON: **26/26 PASS**.
- YAML: **3/3 PASS**.
- Typed capability smoke: **9/9 PASS**.
- Runtime protocol, EMQX webhook, local-runtime rollback, acceptance-orchestrator, and production-approval receipt self-tests: **PASS**.
- Gate 2 entry validator negative-path: **PASS** — a `GATE1_BLOCKED_DEPENDENCY` receipt is rejected.
- Canonical tree/manifest counts are regenerated at seal time and must be verified from the sealed artifact.
- Actual Gate 1 machine attempt remains **BLOCKED**, not PASS.

### Next execution sequence

1. In a runtime-capable environment, run `npm run rescue:gate1 -- --env=.env --topology=local --attempt-install` (or approved `--topology=external`).
2. Require a `status=PASS` Gate 1 report.
3. Immediately run `npm run rescue:gate1:validate -- --file=<that report>` while the runtime is still live.
4. Only after that validator passes may Gate 2 begin.

## RESCUE-02B Runtime Readiness 08 Applied — Source-Validated EMQX Webhook Automation

This checkpoint continues directly from sealed RR07. It adds no product feature, dependency, or Prisma migration. The prior manual telemetry/ACK broker-wiring boundary is now automated only when the **live EMQX broker** proves the required REST/OpenAPI contract. Runtime/hardware acceptance remains pending.

- Added `scripts/configure-emqx-webhooks.mjs` and package command `rescue:emqx:webhooks:configure`.
- The helper logs in to the live EMQX Dashboard API, requires a live OpenAPI surface exposing bridge/probe/rule operations, and runs `bridges_probe` before any mutation. Unsupported API/probe contracts fail closed with zero managed webhook mutation.
- It idempotently manages `iot_telemetry_webhook` + `iot_telemetry_ingest` and `iot_command_ack_webhook` + `iot_command_ack_ingest`, preserving the existing API contracts `/mqtt/webhook/telemetry` and `/mqtt/ack`.
- The telemetry rule extracts `payload.eventId` and `payload.payload`; the ACK rule forwards the canonical ACK payload. Both requests carry the configured webhook secret.
- `rescue:local:up` now performs EMQX auth configuration followed by source-validated telemetry/ACK webhook configuration before full protocol readiness. Its terminal state is `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`.
- Added `rescue:emqx:webhooks:self-test`; synthetic fixtures prove live-OpenAPI-before-mutation, no-mutation probe rejection, idempotent upsert, and rollback when webhook configuration fails. Synthetic fixtures are not runtime evidence.
- Live telemetry delivery, exactly-once/idempotency evidence, ACK correlation, wrong-secret rejection, tenant/device ACL isolation, physical ESP32 flow, OTA, and production approval remain mandatory separate gates.

### RR08 source/static evidence

- Rescue validator: **222/222 PASS**.
- Lifecycle validator: **PASS**.
- TypeScript/TSX syntax: **629/629 PASS**.
- JS/MJS/CJS syntax: **54/54 PASS**.
- JSON: **26/26 PASS**.
- YAML: **3/3 PASS**.
- EMQX webhook self-test: **PASS**.
- Local runtime, protocol probe, acceptance orchestrator, and production approval receipt self-tests: **PASS**.
- Runtime acceptance remains **PENDING/BLOCKED** in this environment; no live broker/hardware PASS is claimed.
- Canonical repository tree: **984/984 PASS**; baseline manifest: **985/985 PASS** after final regeneration.
- Bootstrap doctor remains **`DEPENDENCY_NETWORK_BLOCKED`**; protocol-aware full preflight remains **BLOCKED with 10 blockers / schema v2**.


## RESCUE-02B Runtime Readiness 07 Applied — Fail-Closed Local Runtime Orchestration

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-06`. It adds no product feature, dependency, or Prisma migration. It converts the documented local rescue bring-up sequence into a deterministic operator path while keeping telemetry/ACK webhook wiring and all live/hardware acceptance gates explicitly separate.

### Staged protocol probes and local lifecycle

- `scripts/check-rescue-runtime.mjs` now supports `--probe-scope=infra` and `--probe-scope=full`. Plain `--probe` remains equivalent to `full`; the default acceptance semantics are not weakened.
- `infra` proves only PostgreSQL wire response, Redis `PING/PONG`, and authenticated EMQX Dashboard login. It intentionally does not test MQTT publisher authentication or API readiness before the API/EMQX auth sequence exists.
- Added dependency-free `scripts/manage-rescue-local-runtime.mjs` with `rescue:local:plan`, `rescue:local:up`, `rescue:local:status`, and `rescue:local:down`.
- `rescue:local:up` validates source/manifest/lifecycle/runtime prerequisites, requires Docker/Podman Compose and a real non-placeholder env, starts PostgreSQL/Redis/EMQX, waits for infra probes, runs backend build + committed Prisma migrations, starts a tracked host API process, waits for `/health/live`, configures EMQX HTTP authentication/fail-closed authorization, then waits for full PostgreSQL/Redis/MQTT/EMQX/API readiness.
- Failed bring-up rolls back the tracked API and compose stack by default. `--keep-on-failure` is explicit operator debugging only.
- `rescue:local:down` preserves named data volumes by default; destructive local volume removal requires explicit `--volumes`. If compose tooling is unavailable during teardown, the state file is retained and shutdown is not falsely reported as confirmed.
- Runtime state/log files live under ignored `reports/local-runtime/`; none are source evidence.

### Webhook boundary remains truthful

- The local orchestrator deliberately stops at `CORE_RUNTIME_READY_WEBHOOKS_PENDING`. It does not fabricate or infer telemetry/command-ACK webhook rules.
- Telemetry/ACK broker wiring remains exactly the contract in `ops/emqx/README.md` and must be followed by the live negative/ACL/webhook evidence gate.
- Approved external/managed service topologies remain supported through the topology-neutral full probe and do not use the local compose orchestrator.

### Regression evidence in this environment

- Runtime probe self-test now proves staged `infra` scope omits MQTT/API checks, full scope accepts all five valid protocol fixtures, and invalid/raw fixtures are rejected.
- Added `rescue:local:self-test`. A dependency-free temporary fixture uses fake Docker/npm/Prisma plus a fake API to prove ordered `compose up -> build -> migrate -> API -> EMQX auth -> full readiness -> down`, tracked API PID shutdown, named-volume preservation, and automatic rollback when EMQX configuration fails. The fixture is deleted and is **not** live runtime evidence.
- Final RR07 source validation: Rescue **218/218 PASS**; lifecycle **PASS**; TypeScript/TSX syntax **629/629 PASS**; JS/MJS/CJS **52/52 PASS**; JSON **26/26 PASS**; YAML **3/3 PASS**; typed-capability smoke **9/9 PASS**.
- Runtime probe staged/full self-test **PASS**, local runtime orchestrator self-test **PASS**, acceptance orchestrator self-test **PASS**, and production approval receipt self-test **PASS**.
- Canonical repository tree target: **982/982 PASS**; baseline manifest target: **983/983 PASS** after final regeneration.
- Bootstrap doctor remains **`DEPENDENCY_NETWORK_BLOCKED`** (`registry.npmjs.org` DNS `EAI_AGAIN`). Example-env full protocol preflight remains **BLOCKED with 10 blockers**. No live PostgreSQL/Redis/EMQX/API, physical ESP32, OTA, or production approval PASS is claimed.

### Next execution sequence

1. Verify sealed RR07 and complete exact-lock dependency bootstrap (`rescue:bootstrap:doctor => READY`).
2. For the local topology, initialize `.env`, review `rescue:local:plan`, then run `rescue:local:up`; for approved external services, follow the topology-neutral manual path.
3. Wire telemetry and ACK webhooks exactly from `ops/emqx/README.md`; require the live negative/ACL/webhook evidence gate.
4. Run genuine `rescue:acceptance -- --env=.env --full`, then immutable live runtime/broker/physical ESP32 evidence.
5. Complete production OTA artifact-byte/device-observed SHA proof, build/verify release, run `release:approve`, and install only an approval-receipt-valid artifact.


## RESCUE-02B Runtime Readiness 06 Applied — Production Approval Receipt Enforcement

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-05`. It adds no product feature, dependency, or Prisma migration. It closes a deployment-safety gap: RR05 separated `release:verify` from `release:approve`, but the VPS installer still accepted an integrity-valid artifact even when production approval had never been completed.

### Approved release receipt is now install-enforced

- `release:approve` still re-validates current-source RESCUE-02B evidence, production OTA byte/device digest proof, exact release integrity, and source fingerprint. On success it now writes `production-approval.json` inside the release directory.
- The receipt binds the exact `release-manifest.json` SHA-256, the sealed source fingerprint, the RESCUE-02B evidence SHA-256/timestamp, and the physical OTA artifact/device-observed SHA-256 pair.
- `release:verify --require-approved` fails closed when the receipt is absent, malformed, stale/tampered against the release manifest, source-mismatched, or carries invalid OTA digest evidence.
- Base `release:verify` remains an integrity-only check. The only allowed sidecar outside the base manifest is the named approval receipt; every other extra file remains rejected.
- `ops/scripts/install-release.sh` now invokes the packaged verifier with `--require-approved` **before** `npm ci`, Prisma migration deployment, release symlink activation, or systemd restart. An unapproved artifact can no longer enter the install sequence merely because its payload hashes are valid.

### Repeatable approval-receipt regression evidence

- Added dependency-free `npm run release:approval:self-test` / `scripts/self-test-production-approval-receipt.mjs`.
- It proves an absent receipt is rejected, a manifest-bound receipt is accepted, a tampered receipt is rejected, and untracked files remain rejected after approval.
- A real release-builder fixture was also exercised in this session: integrity-only release verification passed, `--require-approved` rejected the unapproved artifact, and a synthetic receipt allowed only the verifier path. The fixture and synthetic receipt were deleted and are explicitly not production approval evidence.

### Current environment boundary

- Fresh RR06 source validation before seal: Rescue **213/213 PASS**, lifecycle **PASS**, TypeScript/TSX syntax **629/629 PASS**, JS/MJS/CJS **50/50 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**.
- Runtime probe self-test **PASS/PASS**, acceptance orchestrator self-test **PASS/PASS**, and production approval receipt self-test **PASS/PASS/PASS/PASS** (missing receipt rejected; valid accepted; tampered rejected; untracked file rejected).
- Canonical repository tree **980/980 PASS** and baseline manifest **981/981 PASS** after final regeneration.
- npm registry DNS still returns `EAI_AGAIN`; dependency bootstrap remains **`DEPENDENCY_NETWORK_BLOCKED`** in this environment.
- Protocol-aware preflight against the source-controlled example environment remains **BLOCKED with 10 blockers** (dependency install, four placeholder secrets, and five unavailable service/readiness boundaries). Docker/Podman is not counted as a blocker unless local-compose mode explicitly requires it.
- Live PostgreSQL/Redis/EMQX/API services and physical ESP32/OTA evidence remain unavailable; no genuine runtime or production approval PASS is claimed.
- Runtime acceptance semantics from RR05/RR04 remain unchanged: a real full-suite report, immutable live evidence, physical ESP32 proof, and OTA byte verification are still mandatory before `release:approve` can create a legitimate receipt.

### Next execution sequence

1. Verify sealed RR06 and complete dependency bootstrap (`rescue:bootstrap:doctor => READY`).
2. Bring up/migrate PostgreSQL, Redis, EMQX and API; configure broker auth/authz/webhooks; require protocol-aware preflight `READY`.
3. Run genuine `rescue:acceptance -- --env=.env --full`, then immutable live broker/runtime/physical ESP32 evidence.
4. Complete production OTA artifact-byte/device-observed SHA proof.
5. Build/verify the release, run `release:approve`, then require `release:verify --require-approved` before deployment. The VPS installer enforces that last condition itself.

## RESCUE-02B Runtime Readiness 05 Applied — Local Bootstrap + Full-Suite Orchestrator Wiring

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-04`. It adds no product feature and no Prisma migration. It fixes two runtime-readiness defects that would otherwise block a genuine `--full` acceptance run even after dependencies/services became available, and it removes avoidable manual-secret setup from the local rescue path.

### Local rescue environment bootstrap is deterministic and secret-safe

- Added dependency-free `scripts/init-rescue-local-env.mjs` / `npm run rescue:env:init`. It copies the rescue env template, generates strong random local-only PostgreSQL/MQTT/webhook/JWT/metrics/EMQX credentials, never prints those values, writes restrictive permissions where supported, and refuses overwrite unless `--force` is explicit.
- The generated PostgreSQL password is applied consistently to `POSTGRES_PASSWORD`, `DATABASE_URL`, and `TEST_DATABASE_URL`; generated secrets remain outside source because `.env` is gitignored.
- The local template no longer points `TEST_DATABASE_URL` at nonexistent `iot_test`. Both local URLs target the compose-created `iot` database, while the integration harness continues to create/drop only a run-owned `test_*` schema. Production/database-test safety rules remain unchanged.
- Temp-file self-test evidence: placeholder assignments `0`, `DATABASE_URL == TEST_DATABASE_URL`, POSIX mode `0600`, overwrite without `--force` rejected, and the generated env removes all secret/env blockers from runtime preflight. In this environment the remaining generated-env blockers are dependency installation plus the five unavailable service/readiness protocols; this is diagnostics only, not runtime PASS.

### `--full` acceptance now invokes test runners in test mode

- `scripts/run-rescue-acceptance.mjs` now preserves the selected operator environment for backend/web builds, but forces `NODE_ENV=test` for unit/contract, database integration, and MQTT integration subprocesses.
- Explicit destructive/integration opt-ins such as `DATABASE_INTEGRATION_TESTS_ALLOWED=true` and `MQTT_INTEGRATION_TESTS_ALLOWED=true` are still inherited from the selected environment. No safety guard was weakened.
- Added dependency-free `npm run rescue:acceptance:self-test`. It copies the source into a temporary tree, regenerates that fixture manifest, starts protocol-valid synthetic PostgreSQL/Redis/MQTT/EMQX/API fixtures, supplies only fake critical dependency boundaries and a fake npm recorder, then verifies the acceptance orchestrator reaches every full-suite slot with the intended `NODE_ENV` split. The fixture is destroyed afterward and is explicitly not RESCUE-02B runtime evidence.

### Current environment boundary

- Fresh RR05 source validation before seal: Rescue **209/209 PASS**, lifecycle **PASS**, TypeScript/TSX syntax **629/629 PASS**, JS/MJS/CJS **49/49 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**.
- Runtime probe self-test **PASS/PASS** (valid protocol fixtures accepted; invalid/raw fixtures rejected). Acceptance orchestrator self-test **PASS/PASS** (all synthetic full-suite slots reached; test/integration `NODE_ENV=test` routing verified). Local env initializer self-test **PASS** (active placeholders `0`, DB URLs equal, overwrite refusal PASS, generated-env secret blockers `0`).
- Canonical repository tree **979/979 PASS** and baseline manifest **980/980 PASS** after final regeneration.
- Real dependency bootstrap remains blocked by npm registry DNS/network (`DEPENDENCY_NETWORK_BLOCKED`); no dependency-resolved build/Jest/integration result is claimed.
- Protocol-aware preflight against the source-controlled example environment remains **BLOCKED with 10 blockers**. A generated local env removes the four placeholder-secret blockers but still cannot create missing dependencies or services.
- Real PostgreSQL/Redis/EMQX/API services and physical ESP32/OTA evidence remain unavailable here. Production deployment remains **NOT APPROVED**.

### Next execution sequence

1. Verify the sealed RR05 SHA and use `npm run rescue:env:init` for the local rescue topology, or prepare an approved external/managed env.
2. Complete the exact-lock dependency install and require `rescue:bootstrap:doctor => READY`.
3. Bring up/migrate PostgreSQL, Redis, EMQX, and API; configure broker auth/authz/webhooks.
4. Require protocol-aware `rescue:runtime:check -- --probe => READY`.
5. Run the genuine dependency-resolved `rescue:acceptance -- --env=.env --full`; synthetic self-tests do not count.
6. Complete immutable live runtime/broker/ESP32 evidence, OTA byte/device digest proof, then `release:approve`.

## RESCUE-02B Runtime Readiness 04 Applied — Topology-Neutral Protocol-Aware Preflight

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-03`. It adds no product feature and no Prisma migration. It corrects two acceptance semantics that could otherwise produce false blockers or false readiness: container tooling is no longer mandatory for externally hosted runtime services, and raw TCP reachability is no longer treated as service health.

### Runtime acceptance is topology-neutral

- `scripts/check-rescue-runtime.mjs` now treats Docker/Podman as informational by default. The same acceptance gate can run against local compose, host-native, or approved external/managed PostgreSQL/Redis/EMQX services.
- Operators using `docker-compose.rescue.yml` can explicitly add `--require-container-runtime`; only that local-compose mode makes Docker/Podman a blocking prerequisite.
- Installed dependency readiness now requires the same complete boundary used by the bootstrap doctor: npm hidden lock plus critical tool packages (`typescript`, `jest`, `prisma`, `@nestjs/cli`, `next`, `expo`). A partial `node_modules` can no longer pass merely because `.package-lock.json` exists.

### `--probe` now proves protocols/readiness, not open ports

- PostgreSQL must answer the wire-protocol SSL negotiation request.
- Redis must answer `PING` with `PONG`; URL credentials are used when present.
- MQTT must accept an authenticated MQTT 3.1.1 `CONNECT` using configured `MQTT_USERNAME` / `MQTT_PASSWORD`.
- EMQX Dashboard credentials must authenticate through `/api/v5/login` and return a bearer token.
- API must return HTTP 200 with `status=ready` from `API_PROBE_URL` (default `/health/ready`); its dependency statuses are included in the safe probe detail.
- Structured preflight schema is now version 2 and records whether container runtime was explicitly required.

### Probe regression evidence

- Added dependency-free `npm run rescue:runtime:self-test`. Temporary valid PostgreSQL/Redis/MQTT/EMQX/API fixtures were accepted.
- Deliberately invalid/raw listeners on the same five boundaries were all rejected; `HTTP 200` alone is not accepted for EMQX or API readiness.
- These fixtures are checker regression evidence only and are not live RESCUE-02B runtime evidence.

### Current environment boundary

- Final source evidence for RR04: Rescue **206/206 PASS**, lifecycle **PASS**, TypeScript/TSX syntax **629/629 PASS**, JS/MJS/CJS **47/47 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**, runtime-probe self-test **PASS/PASS** (valid fixtures accepted; invalid fixtures rejected).
- Canonical repository tree: **977/977 PASS**; baseline manifest: **978/978 PASS** after regeneration with nested application `reports` routes included. Portable source hygiene: top-level dependency/build/runtime artifact paths **0**, non-example `.env` **0**, symlink **0**.
- `npm ci` remains blocked by registry DNS/cache availability from RR03; bootstrap doctor reports **`DEPENDENCY_NETWORK_BLOCKED`** and no dependency-resolved build/Jest/integration result is claimed.
- With container tooling correctly non-blocking by default, the current example-environment probe reports **10 blockers**: dependencies absent, four placeholder secrets, and five unavailable/invalid protocol-readiness probes (PostgreSQL, Redis, MQTT auth, EMQX login, API readiness).
- PostgreSQL/Redis/EMQX/API are not running here; physical ESP32 and OTA evidence are also unavailable. Production deployment remains **NOT APPROVED**.

### Next execution sequence

1. Move this exact sealed baseline to an environment where `npm ci` can complete and require `rescue:bootstrap:doctor => READY`.
2. Use either local compose (`--require-container-runtime`) or approved external/managed services; both must pass the same protocol-aware preflight.
3. Run `rescue:acceptance -- --env=.env --full`, then immutable live broker/runtime evidence.
4. Complete physical ESP32 evidence, OTA artifact-byte/device digest proof, and only then `release:approve`.

## RESCUE-02B Runtime Readiness 03 Applied — Dependency Bootstrap Diagnostics + Structured Preflight

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-02`. It adds no product feature and no Prisma migration. It hardens the operator/runtime boundary that became observable only after a real dependency install attempt in this environment.

### Dependency bootstrap is now classified instead of guessed

- A fresh online `npm ci --ignore-scripts` attempt reached npm registry fetches but the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). The partial install was not accepted as evidence.
- An explicit offline retry failed `ENOTCACHED` because the local npm cache was incomplete; `postcss-8.5.26.tgz` was one confirmed missing artifact. Partial `node_modules` was removed.
- Added dependency-free `scripts/diagnose-rescue-bootstrap.mjs` / `npm run rescue:bootstrap:doctor`. It validates Node/npm major compatibility, package/lock readability, hidden npm install lock + critical tool packages, partial-install state, and—only while dependencies are missing—npm registry DNS/HTTPS reachability.
- The doctor classifies `TOOLCHAIN_OR_LOCK_INVALID`, `PARTIAL_INSTALL`, `DEPENDENCY_NETWORK_BLOCKED`, `INSTALL_REQUIRED_REGISTRY_REACHABLE`, or `READY`. Once dependencies are installed, registry reachability is intentionally skipped so internet access is not turned into a runtime prerequisite.
- Doctor self-tests outside the source tree proved `PARTIAL_INSTALL`, synthetic installed `READY`, and this environment's real `DEPENDENCY_NETWORK_BLOCKED` path. Those fixtures are diagnostics only, not runtime evidence.

### Runtime preflight is machine-readable

- `scripts/check-rescue-runtime.mjs` keeps the existing human table by default and now supports `--json`. Structured output includes `ready`, `blockerCount`, `blockers[]`, and every prerequisite row.
- `scripts/run-rescue-acceptance.mjs` consumes that JSON and embeds it as `runtimePreflight` in the acceptance report, eliminating log scraping for blocker classification.
- The runtime checker still fails closed. This environment continues to report the same **11 blockers**: no Docker/Podman, dependencies absent, four placeholder secrets, and unavailable PostgreSQL/Redis/MQTT/EMQX/API TCP endpoints.

### Current evidence boundary

- Final source/static evidence for RR03: Rescue **200/200 PASS**, lifecycle **PASS**, TypeScript/TSX syntax **629/629 PASS**, JS/MJS/CJS **46/46 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**, repository tree **976/976 PASS**, baseline manifest **977/977 PASS**.
- No dependency-resolved build/Jest/Next/integration test is claimed because dependency bootstrap is blocked by registry DNS/cache availability in this execution environment.
- No live EMQX vertical flow, physical ESP32 runtime, OTA hardware proof, or production approval is claimed.
- Production deployment remains **NOT APPROVED**.

### Next execution sequence

1. Move this exact sealed baseline to an environment with working npm registry/proxy/cache and run the exact lockfile install documented in the runtime runbook.
2. Require `npm run rescue:bootstrap:doctor` to report `READY`.
3. Bring up PostgreSQL/Redis/EMQX/API with real local secrets and run `rescue:acceptance -- --env=.env --full`.
4. Complete immutable live broker/runtime/physical ESP32 evidence, then the separate OTA and `release:approve` gates.


## RESCUE-02B Runtime Readiness 02 Applied — Immutable Evidence + Release Approval Separation

This checkpoint continues directly from sealed `RESCUE-02B-RUNTIME-READINESS-01`. It adds no product feature and no Prisma migration. It hardens the acceptance/release boundary discovered during runtime-readiness self-tests.

### Live evidence is artifact-bound

- RESCUE-02B evidence schema is now **version 2**. Every required live/broker/physical check marked `PASS` must point to a real evidence artifact with `artifactPath`, SHA-256, and a concrete note; free-text-only PASS evidence is rejected.
- Added dependency-free `scripts/attach-rescue-02b-evidence.mjs` / `npm run rescue:evidence:attach` to hash a redacted log/transcript/screenshot/serial capture and bind it to one known checklist row.
- `rescue:evidence:init` now verifies all required automated full-suite steps and the current source fingerprint before it creates a PENDING evidence template.
- `rescue:evidence:validate` now verifies required automated step records, section ordering relative to the automated report, evidence artifact existence/hash, and existing source/identity/secret guardrails.

### Release integrity is not production approval

- `scripts/build-production-release.mjs` now embeds the sealed-source fingerprint in `release-manifest.json`.
- `scripts/verify-production-release.mjs` now rejects symlinks/unsupported filesystem entries, unsafe/duplicate manifest paths, and any packaged file not covered by the manifest. This gate proves **artifact integrity only**.
- Added `scripts/verify-production-approval.mjs` / `npm run release:approve`. It re-validates RESCUE-02B evidence against the current source, requires production OTA status `PASS`, verifies release integrity, and requires the release source fingerprint to match the same sealed baseline.
- OTA `PASS` is no longer accepted as bare text: it must identify the physical device and timestamp, point to the exact firmware artifact bytes, match the local artifact SHA-256, and match the device-observed SHA-256. `DEFERRED` remains valid for RESCUE-02B but is always blocked by production approval.

### Baseline manifest coverage is now canonicalized

- Final ZIP verification exposed that the prior manual tree-generation command excluded every path segment named `reports`, which unintentionally omitted the legitimate Super Admin report page/API from baseline hashing.
- Added dependency-free `scripts/manage-baseline-manifest.mjs` with `baseline:manifest:generate` and `baseline:manifest:verify` so only top-level runtime `reports/`/`artifacts/` are excluded while real application report routes remain covered.
- `run-rescue-acceptance.mjs` now runs **Baseline manifest verifier** before lifecycle/runtime execution, and evidence initialization/validation requires that successful automated step too.
- This is a seal-integrity correction, not a product feature or runtime PASS.

### Dependency-free negative-path evidence from this session

- Clean release fixture: **PASS**.
- Injected untracked file: **correctly rejected**.
- Injected symlink: **correctly rejected**.
- Automated report missing `MQTT integration`: **correctly rejected by evidence initializer**.
- Evidence artifact mutated after hash binding: **correctly rejected by evidence validator**.
- Valid source-bound synthetic self-test evidence with OTA `DEFERRED`: RESCUE-02B schema validation can pass, while **production approval correctly remains BLOCKED**. Synthetic fixtures were outside the source tree and are not runtime evidence.
- Current runtime preflight remains **RUNTIME_PRECHECK_BLOCKED / exit 2 with 11 blockers**; no dependency-resolved/runtime/hardware PASS is claimed.
- Fresh static/source checks before final manifest: Rescue **196/196 PASS**, lifecycle **PASS**, TypeScript/TSX parser **629/629 PASS**, JS/MJS/CJS **45/45 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**.
- Final baseline manifest target for this checkpoint: **976/976 PASS** after regeneration; source hygiene excludes generated `reports/`, build/dependency directories, secret `.env`, logs, and caches.

### Next execution sequence

1. In the real runtime environment, obtain a genuine `AUTOMATED_TEST_SUITE_PASS` report from this exact sealed baseline.
2. Initialize schema-v2 evidence and attach redacted immutable artifacts for every live runtime, broker, and physical ESP32 check.
3. Validate RESCUE-02B evidence.
4. Implement/prove the still-deferred artifact-byte OTA path on physical hardware before setting OTA to PASS.
5. Build/verify the production release and run `release:approve`; only that separate green gate can support a production-approval decision.

## RESCUE-02B Runtime Readiness 01 Applied — Auditable Evidence Gate

This checkpoint continues directly from sealed FOUNDATION-ALIGNMENT-04. It adds no product feature and no Prisma migration. Its purpose is to make the pending runtime gate repeatable, source-bound, and fail-closed.

### Automated evidence is source-fingerprinted

- `scripts/run-rescue-acceptance.mjs` now records SHA-256 fingerprints for `package-lock.json`, `BASELINE-MANIFEST.sha256`, and `repository-tree.txt` in every acceptance report.
- A future manual/live evidence record therefore cannot reuse a green automated report from a different sealed source tree without the validator rejecting it.
- `--full` still stops at `AUTOMATED_TEST_SUITE_PASS`; that status is explicitly **not** the final RESCUE-02B PASS.

### Final RESCUE-02B evidence contract

- Added dependency-free `scripts/init-rescue-02b-evidence.mjs` and `npm run rescue:evidence:init`.
- The initializer only accepts a `mode=full` / `AUTOMATED_TEST_SUITE_PASS` report and creates a PENDING evidence record for the remaining runtime gates.
- Added dependency-free `scripts/validate-rescue-02b-evidence.mjs` and `npm run rescue:evidence:validate`.
- The validator requires concrete PASS evidence for three independent sections: live runtime vertical flow, EMQX auth/ACL/webhook negative flow, and physical ESP32 core flow.
- Bare PASS labels, missing timestamps, unidentified board/ESP-IDF version, missing required checks, stale source fingerprints, and secret-bearing object keys all fail closed.
- Source-controlled checklist/schema guidance lives under `ops/acceptance/`; generated operator evidence under `reports/` is ignored by source packaging by default.

### OTA boundary remains truthful

- Physical pairing/telemetry/command/ACK/reconnect/heartbeat remains required for RESCUE-02B hardware acceptance.
- Artifact-byte SHA-256 OTA verification remains production-only and may stay `DEFERRED` in RESCUE-02B evidence with an explicit reason. `DEFERRED` is never interpreted as OTA PASS.

### Current environment evidence

- `node scripts/run-rescue-acceptance.mjs --env=ops/env/rescue-local.env.example` still exits **2 / RUNTIME_PRECHECK_BLOCKED** with **11 blockers**: no container runtime, no installed dependencies, four placeholder secrets, and PostgreSQL/Redis/MQTT/EMQX/API TCP endpoints unavailable.
- The generated PENDING evidence template was explicitly validated and correctly rejected; no manual PASS can be inferred from template existence.
- Fresh source/static validation before seal: Rescue **184/184 PASS**, lifecycle **PASS**, TypeScript/TSX parser **629/629 PASS**, JS/MJS/CJS syntax **42/42 PASS**, JSON **26/26 PASS**, YAML **3/3 PASS**, typed-capability smoke **9/9 PASS**.
- Baseline manifest: **973/973 PASS** after final regeneration; portable hygiene remains clean (generated dependency/build directories 0, non-example `.env` 0, runtime log/cache 0).
- Dependency-resolved backend/web/mobile build/Jest/integration tests remain unclaimed because project dependencies are not installed in this environment.
- Production deployment remains **NOT APPROVED**.

### Next runtime execution sequence

1. In a capable runtime environment, verify this sealed baseline SHA and install dependencies with a complete `npm ci`.
2. Bring up PostgreSQL, Redis, EMQX, API, and configure EMQX auth/authz/webhooks exactly from the runbook.
3. Run `npm run rescue:acceptance -- --env=.env --full` until the source-bound automated report is green.
4. Initialize evidence from that exact report with `npm run rescue:evidence:init`.
5. Execute and record the live runtime flow, all EMQX positive/negative ACL/webhook checks, and the physical ESP32 core-flow checklist.
6. Run `npm run rescue:evidence:validate`. Only a green validator may be called **RESCUE-02B EVIDENCE PASS**; it is still not RESCUE-04 production approval.

## Foundation Alignment 04 Applied — Super Admin Platform Observability

This checkpoint continues directly from sealed FOUNDATION-ALIGNMENT-03 and deepens the remaining Enterprise Super Admin blueprint only where the existing schema/runtime contracts can support truthful platform-wide read evidence. It adds no Prisma migration and does not open unsafe cross-tenant command dispatch.

### Device Groups + Credentials

- Added platform-admin-only `GET /admin/platform-device-groups` and canonical `/super/device-groups`. The surface is read-only; groups remain tenant-owned and mutations stay on the tenant-scoped Device Group contract.
- Added platform-admin-only `GET /admin/platform-device-credentials` and `/super/credentials`. The backend selects only credential metadata (`id`, created/updated timestamps) plus device/tenant identity. `passwordHash`, pairing token, and secret material are never returned.

### Capability Registry depth

- Existing `/admin/platform-capabilities` now exposes persisted `schemaVersion`, `unit`, `constraints`, and created/updated timestamps in addition to key/type/access flags.
- Super Capability Registry groups observed per-device definitions and surfaces version/drift evidence. It explicitly does **not** claim a separate global template/version lifecycle because no authoritative template entity exists in the current schema.

### Telemetry Explorer + export

- Added platform-admin-only `GET /admin/platform-telemetry/explorer`. A real device is mandatory; optional capability keys are validated against that device before telemetry evidence is returned. Results are bounded.
- Super Telemetry Center retains the existing numeric aggregate and now also exposes bounded raw telemetry evidence plus CSV generated from the exact rows returned by the backend. No tenant-scoped fallback is used.

### Command queue / ACK monitor

- Added platform-admin-only `GET /admin/platform-commands` and promoted `/super/commands` to a read-only Command Monitor.
- The contract returns persisted queue/ACK/terminal history and explicitly states `sendCommandEnabled=false`. No cross-tenant command dispatch endpoint or UI control was added.

### Platform Reports

- Added `GET /admin/platform-reports/tenant-summary`: bounded server-generated per-tenant operational rows combining current inventory with bounded lookback evidence from commands, telemetry, credential presence, and WARNING/CRITICAL analytics findings.
- `/super/reports` now exports CSV from those same returned rows instead of static/demo report content.

### MQTT boundary stays fail-closed

- MQTT Center still shows canonical topic/auth/ACL contracts and backend readiness only. No live broker sessions/connections/topic runtime state is fabricated because no verified EMQX management read contract is available in this source/runtime environment.
- Added accepted ADR `docs/phoenix/adr/ADR-008-platform-observability-read-models.md`.

### Validation at this checkpoint

- Rescue guardrail validator: **180/180 PASS**.
- Lifecycle metadata validator: **PASS**.
- TypeScript/TSX parser: **629/629 PASS**.
- JS/MJS/CJS syntax: **40/40 PASS**.
- JSON parse: **25/25 PASS**.
- YAML parse: **3/3 PASS**.
- Direct typed-capability utility smoke: **9/9 PASS**.
- Baseline manifest: **969/969 PASS** after final regeneration.
- Portable source hygiene: **PASS** — node_modules/dist/.next/coverage = 0, non-example `.env` = 0, runtime log/cache artifacts = 0.
- Strict runtime preflight against `ops/env/rescue-local.env.example`: **BLOCKED / exit 1 with 11 blockers under `--probe`**. This remains environment evidence, not runtime PASS.
- Dependency-resolved TypeScript/Jest/Next builds remain unclaimed while project dependencies are unavailable.

### Next bounded Foundation Alignment sequence

1. Keep live MQTT broker operations/session/topic inventory closed until a verified EMQX management read contract and runtime credentials/evidence exist.
2. Keep a true global capability-template/version lifecycle closed until an authoritative domain entity/contract exists; current `schemaVersion` evidence is per-device capability metadata only.
3. Evaluate any remaining enterprise gap only against existing design authorities and real backend evidence; do not reopen NOC/CCTV/Technician/unsafe cross-tenant writes merely for visual completeness.
4. Execute RESCUE-02B live runtime acceptance when dependencies and PostgreSQL/Redis/EMQX/API/broker/hardware prerequisites are available.

## Foundation Alignment 03 Applied — Device Technical Evidence + Mobile Detail/Alerts

This checkpoint continues directly from sealed FOUNDATION-ALIGNMENT-02. It completes the next bounded blueprint alignment without inventing missing per-device firmware/protocol state and without turning Module 16 findings into notification-delivery receipts.

### Device Detail technical evidence

- Added additive read-only `GET /devices/:deviceId/technical-history`, guarded by authenticated tenant context plus existing `DeviceAccessGuard` with VIEW access.
- The read model exposes only evidence that already exists: bounded OTA rollout targeting/result bookkeeping and bounded Module 16 analytics findings for the authorized device.
- `firmware.currentVersion` and `protocol.name` remain explicitly `UNAVAILABLE_BY_CONTRACT`; rollout firmware metadata is never promoted into a claim about the firmware currently installed on physical hardware.
- OTA rows explicitly keep `artifactBytesVerifiedByPlatform=false` and `physicalInstallProven=false`; persisted rollout completion is not physical acceptance evidence.
- Alert-delivery history remains unavailable by contract. Analytics findings are exposed separately and labelled as Module 16 evidence, not durable notification delivery.
- Added accepted ADR `docs/phoenix/adr/ADR-007-device-technical-evidence-and-user-analytics-alert-read-models.md`; no Prisma migration or write contract was introduced.

### User Web / Admin Device Detail alignment

- User Web Device Detail and Tenant/Admin Device Detail now separate three evidence surfaces: command history, OTA/update evidence, and Module 16 analytics findings.
- The old wording `Command & Alert History` was removed because command records and analytics findings are different contracts.
- Current firmware/protocol are shown as unavailable when the backend has no authoritative per-device source; the UI does not infer them from the latest rollout.

### Mobile Device Detail + Alerts

- Mobile device inventory now comes from canonical `/spaces/accessible`, carrying room context and owner/share `VIEW`/`CONTROL` instead of using an unscoped raw-device list.
- Mobile Device Detail is backend-backed for device metadata, capability catalog, latest telemetry, command history, technical update evidence, and Module 16 findings. Command affordances remain permission/capability driven; HTTP dispatch never fabricates physical state.
- End-user settings mutation remains fail-closed because no production-backed settings write contract was proven.
- Added additive read-only `GET /analytics/alerts/accessible`: it resolves accessible devices through the canonical owner/share policy first, then returns only bounded WARNING/CRITICAL Module 16 findings.
- Mobile Alerts now consumes that read model. It explicitly states that analytics findings are not notification-delivery history and that an empty bounded result is not a universal all-clear guarantee.

### Validation at this checkpoint

- Rescue guardrail validator: **172/172 PASS**.
- Lifecycle metadata validator: **PASS**.
- TypeScript/TSX parser: **616 files / 0 parse errors**.
- JS/MJS/CJS syntax: **40/40 PASS**.
- JSON parse: **25/25 PASS**.
- YAML parse: **3/3 PASS**.
- Direct typed-capability utility smoke: **9/9 PASS**.
- Strict runtime preflight against `ops/env/rescue-local.env.example`: **BLOCKED / exit 1 with 11 blockers under `--probe`**. This is environment evidence, **not runtime PASS**.
- Baseline manifest: **955/955 PASS** after final regeneration.
- Portable source hygiene: **PASS** — node_modules/dist/.next/coverage = 0, non-example `.env` = 0, runtime log/cache artifacts = 0.
- Dependency-resolved TypeScript build/Jest/Next build remain unclaimed while project dependencies are unavailable in this execution environment.

### Next bounded Foundation Alignment sequence

1. Evaluate remaining Super Admin enterprise blueprint depth one proven contract at a time: platform groups/credentials, deeper capability registry/versioning, telemetry explorer/export, command queue/ACK monitor/history, broker operations, and reports. Do not expose placeholder success.
2. Keep missing per-device firmware/protocol identity and notification-delivery history closed until authoritative sources exist.
3. Execute RESCUE-02B live runtime acceptance when dependencies and PostgreSQL/Redis/EMQX/API/broker/hardware prerequisites are available.

NOC map, CCTV streaming, Technician workflows, unsafe cross-tenant command surfaces, advanced AI, and provider-specific integrations remain quarantined/deferred.

## Foundation Alignment 01+02 Applied — Verified Gaps #1 through #5

This checkpoint continues directly from the sealed FOUNDATION-ALIGNMENT-01 baseline (which itself descends from verified R8); it does not reopen the historical roadmap or waive runtime acceptance. The five verified active-menu/foundation mismatches from the 2026-09-13 checkpoint are now aligned in source/static scope.

### #1 Automation activation/runtime contract

- Automation rules still default to disabled and cannot be created already active.
- Added explicit owner-scoped `POST /automations/:automationId/activate` and `/deactivate` transitions protected by optimistic `expectedRevision`.
- Activation is fail-closed unless `AUTOMATION_RUNTIME_ENABLED=true`; deactivation remains available even while runtime is disabled so operators/users retain a safe rollback path.
- Activation reconstructs and revalidates the persisted rule against the current tenant devices/capabilities before enabling it. Revoked/missing devices, missing capability targets, non-reportable triggers, invalid condition capabilities, or non-writable actions cannot be activated.
- The telemetry runtime and HTTP activation surface now share one normalized automation-runtime policy helper; only explicit normalized `true` enables runtime behavior.
- `AUTOMATION_RUNTIME_ENABLED=false` is now explicit in the generic environment example; the Rescue runtime-acceptance template requires `true`; configuration validation, runtime checker, and runtime runbook all bind the same flag.
- Tenant Automation UI exposes truthful persisted/runtime state: rules can be created while runtime is off, but activation is disabled; already enabled rules are shown as `AKTIF · RUNTIME OFF` and can still be deactivated.

### #2 Tenant Command Center typed capability alignment

- Removed the hardcoded `relay.state` default, free-text capability key, and `NYALA/MATI` assumptions.
- The selected tenant device now loads its real capability catalog and exposes only capabilities marked writable.
- Command value entry reuses the same `CapabilityValueInput` and `parseCapabilityValue` semantics used by the R8 typed-capability foundation.
- Numeric-looking strings are no longer generically coerced with `Number(...)`; boolean/integer/number/string/enum/object values follow the declared capability type and constraints.
- Capability-catalog failure disables command submission rather than silently falling back to a guessed command.
- HTTP submission remains non-authoritative for physical state; the UI explicitly waits for ACK/telemetry as the source of truth.

### #3 Tenant analytics findings truthfulness

- Added canonical Tenant route `/tenant/temuan` labelled **Temuan Analitik**.
- The surface continues to read the real `/api/admin/analytics-findings` contract and explicitly states that it is not durable notification-delivery history.
- Legacy `/tenant/notifikasi` now only redirects to `/tenant/temuan` for bookmark compatibility; canonical navigation no longer calls analytics findings “Notifikasi”.
- Active route map/UAT/operator guidance were synchronized to the truthful surface at FA02. FA03 later adds a separate authorized Module 16 analytics-alert read model; this still does not create notification-delivery history.

### #4 Firmware/OTA claim alignment

- Super Firmware now labels stored SHA-256 as **digest metadata**, not as proof that artifact bytes were downloaded and verified.
- Rollout history is labelled as persisted rollout **state**, and `Selesai Tercatat` is not presented as physical device update proof.
- The UI explicitly states that hardware OTA acceptance remains pending until real artifact-byte digest verification and device/hardware evidence exist.
- No fake artifact-byte verifier was added because the current source contract exposes metadata/state rather than a proven artifact-byte verification path.

### #5 Room-centric User Web with owner/share access

- Added additive read-only `GET /spaces/accessible` guarded by authenticated tenant context. The service obtains devices through the existing owner/share visibility policy **before** ROOM placement is used for grouping.
- `canControl` is resolved separately through `DeviceAccessService`; VIEW shares do not inherit CONTROL from room placement. Empty rooms outside the authorized device set are not exposed.
- Added ADR `docs/phoenix/adr/ADR-006-user-room-centric-accessible-space-read-model.md` because the Architecture Freeze requires an explicit decision for additive API-contract changes. No Prisma schema or breaking `/spaces` admin-contract change was introduced.
- `/beranda`, `/ruangan`, and `/perangkat-saya` are now real backend-backed room/device surfaces instead of redirects to `/`. The previous dashboard remains available at `/dashboard`; root now redirects to `/beranda`.
- Added backend-backed User Web Device Detail for authorized device metadata, capabilities, latest telemetry, and command history. VIEW-only users receive no control affordance; writable BOOLEAN control is exposed only when `canControl=true`, and terminal ACK/telemetry remains authoritative. Non-boolean User Web controls remain fail-closed pending full typed UX rather than guessing values.
- No demo/static operational rows were reintroduced.

### Validation at this checkpoint

- Rescue guardrail validator: **167/167 PASS**.
- Lifecycle metadata validator: **PASS**.
- TypeScript/TSX parser: **607 files / 0 parse errors**.
- JS/MJS/CJS syntax: **40 files / 0 failures**.
- JSON parse: **25 files / 0 failures**.
- YAML parse: **3 files / 0 failures**.
- Direct typed-capability utility smoke: **9/9 PASS**.
- Strict runtime preflight against `ops/env/rescue-local.env.example`: **BLOCKED / exit 1 with 11 blockers under `--probe`**, including no Docker/Podman, no installed project dependencies, placeholder runtime secrets, and unavailable PostgreSQL/Redis/MQTT/EMQX/API TCP endpoints. This is expected environment evidence, **not runtime PASS**.
- Dependency-resolved TypeScript build/Jest/Next build were not claimed because this environment still has no installed project `node_modules`.

### Next bounded Foundation Alignment sequence

1. Evaluate Device Detail firmware/protocol/update/alert-history surfaces against real backend contracts. Hide/fail closed where contracts do not exist; do not fabricate per-device firmware/protocol state.
2. Complete Mobile Device Detail/history/settings and only enable Mobile Alerts where a real end-user backend contract exists.
3. Evaluate the remaining Super Admin enterprise blueprint depth (platform groups/credentials/capability-registry versioning/telemetry explorer-command monitor-broker ops-reports) one contract at a time without opening placeholders.
4. RESCUE-02B runtime acceptance remains a separate mandatory gate when PostgreSQL/Redis/EMQX/API, dependencies, broker auth/webhook, and physical ESP32 evidence are available.

NOC map, CCTV streaming, Technician workflows, unsafe cross-tenant command surfaces, advanced AI, and provider-specific integrations remain quarantined/deferred.

## Product Surfaces

The project has three canonical product surfaces:

1. **Platform / Super Admin** — `apps/admin-web/app/super/*`
2. **Tenant Admin** — `apps/admin-web/app/tenant/*`
3. **End User** — `apps/user-web` and the authenticated Expo entry in `apps/user-mobile/App.tsx`

Legacy root routes may remain only for bookmarks, historical contract tests, or compatibility. They must redirect or clearly identify themselves as compatibility/lab surfaces.

## Canonical Working Rules

- Do not create a new numbered Module/Slice as the next unit of work.
- Work from a real user flow, not historical roadmap wording.
- Do not show demo, mock, random, or synthetic operational data on active product surfaces.
- If a backend/runtime contract is missing, fail closed or hide/quarantine the feature.
- Do not rewrite healthy backend domains merely to simplify the UI.
- Preserve tenant isolation, authentication, MQTT, telemetry, automation, security, Prisma migrations, and existing safety boundaries.
- `dist/` is generated build output and must not be carried as a stale source-baseline artifact. Production `dist` must come from a fresh successful build.
- Every new ZIP baseline must update this file, `PROJECT-HANDOFF.md`, and `PASTE-KE-CHAT-BERIKUTNYA.txt` before packaging. The external paste/handoff generated after sealing must carry the final ZIP SHA-256.

## Rescue-01 Applied

- Canonical Super Admin, Tenant Admin, User Web, and User Mobile surfaces selected.
- Legacy `/dashboard`, `/devices`, `/perangkat`, and `/automation` forward to tenant canonical routes.
- Duplicate `OrgModule` registration removed.
- Active UI demo/synthetic operational data removed.
- Incomplete Device Groups, Super cross-tenant Command Center, and NOC removed from canonical navigation without deleting their source.
- `CURRENT-STATE.md`, Rescue workflow, route map, and baseline validator established.

## Rescue-02A Applied — Core Contract Repair

The static/source contracts for the core vertical flow were repaired before runtime integration:

### Provisioning and pairing

- Provisioning now emits a device-bound pairing code in the form `<deviceId>:<token>`.
- Device pairing fails closed when `MQTT_BROKER_URL` is missing.
- Pairing credential persistence uses safe upsert semantics.
- Pairing response returns trusted `deviceId`, `tenantId`, MQTT URI, and MQTT username.
- Tenant device detail can create capabilities required before telemetry/command use.

### Command and ACK

- Admin Web command payload now matches backend `{ payload, idempotencyKey }` contract.
- Command history derives capability names from real dynamic payload keys.
- Device command proxy supports both send and history.
- MQTT ACL contract is aligned to canonical topics:
  - publish `tenants/<tenantId>/devices/<deviceId>/telemetry`
  - subscribe `tenants/<tenantId>/devices/<deviceId>/commands`
  - publish `tenants/<tenantId>/devices/<deviceId>/commands/ack`
- Device ACK status supports `ACK` and explicit `FAILED`; invalid statuses are rejected.
- Explicit device failure is persisted as command `FAILED` rather than being treated as success.

### Scene, schedule, automation, notifications

- Capability proxy returns both `capabilities` and compatibility `items`, so Device Detail, Scene, and Automation consume the same real capability list.
- Automation accepts the backend's actual array device response.
- Scene enable/disable proxy now implements the PATCH used by the UI.
- Schedule creation verifies the target Scene belongs to the active tenant before persistence.
- Notification empty state no longer claims all devices are healthy merely because no analytics finding exists.

### ESP32 SDK

- Removed stale `/api/provision/claim` contract.
- SDK pairing now uses `POST /devices/<deviceId>/pair`.
- Canonical MQTT topics and telemetry `{eventId,payload}` envelope are used.
- Heartbeat uses the authenticated device HTTP endpoint.
- Stored credentials resume the provisioned Wi-Fi path after reboot.
- HTTP response data is captured during `esp_http_client_perform()` via event callbacks rather than read a second time afterward.
- Provisioning waits for Wi-Fi/IP before calling the pairing API.
- MQTT command input is bounded/copied before JSON parsing.
- OTA is **fail-closed/disabled** until real artifact SHA-256 verification is implemented and hardware-tested; the SDK no longer implies verification it does not perform.

### MQTT/webhook safety

- MQTT and telemetry webhook secrets now fail closed if the server secret or request header is missing.
- `docker-compose.yml` is explicitly documented as development transport only. It is **not** treated as proof that EMQX HTTP auth, ACL, telemetry webhook, or ACK webhook integration is configured.

### Build artifact hygiene

- The stale `dist/` copied from RESCUE-01 was removed. `start:prod` must only be used after a fresh `npm run build` regenerates it from the active source.

## Rescue-02B Preparation Applied — Broker/Runtime Gate

- Added `docker-compose.rescue.yml` for local integration infrastructure only: PostgreSQL 16, Redis 7, and EMQX 5.8. The existing compose file remains untouched.
- Added `ops/env/rescue-local.env.example` so local runtime values are separated from production examples.
- Added dependency-free `scripts/check-rescue-runtime.mjs` plus `npm run rescue:runtime:check` for prerequisite and optional TCP readiness checks.
- Added `scripts/configure-emqx-http-auth.mjs` plus `npm run rescue:emqx:configure` to configure EMQX 5.8 HTTP authentication and fail-closed authorization fallback after the broker/API are running.
- Added `ops/emqx/README.md` and an EMQX HTTP authenticator HOCON example describing the telemetry and ACK webhook contracts.
- Upgraded `POST /mqtt/auth` to return EMQX 5.8 embedded ACL rules for authenticated devices. Device ACL is bound to its exact tenant/device telemetry, ACK, and command topics.
- Added API publisher service-account authentication using `MQTT_USERNAME` / `MQTT_PASSWORD`; its ACL can publish command topics only and cannot behave as a device.
- Preserved `POST /mqtt/acl` as a compatibility/audit path; the canonical EMQX 5.8 path no longer requires a second HTTP authorizer call per publish/subscribe.
- MQTT webhook secret and broker publisher secret comparison use constant-time comparison where handled in the auth controller.
- Runtime auth input now rejects malformed/empty username/password with a deny result instead of falling into broker/device credential logic.

## Rescue-02B Preparation Revision 2 Applied — Contract/Workflow Hardening

- Fixed the EMQX bootstrap helper so `npm run rescue:emqx:configure` actually reads the selected `.env` file (or `--env=<path>`), matching the documented operator workflow.
- Local EMQX rescue compose now persists `/opt/emqx/data`, includes a broker healthcheck, and seeds the fresh Dashboard admin password from `EMQX_DASHBOARD_PASSWORD`.
- Telemetry webhook secret comparison now uses constant-time comparison, matching the MQTT auth/ACK webhook safety boundary.
- Mobile device-control compatibility client is aligned with the real backend contracts:
  - `/devices` direct array responses are accepted;
  - `lastHeartbeatAt` is used instead of the stale `lastSeenAt` field;
  - command send uses `{ payload, idempotencyKey }` and maps backend `correlationId`;
  - `/telemetry/latest` maps the actual telemetry row `{ payload, createdAt }` instead of expecting a synthetic `readings[]` envelope;
  - compatibility UI uses the authenticated `mobileSessionClient`, not raw relative `fetch(pathname)`.
- Removed the unused Admin Web automation-runtime card and proxy because they called nonexistent backend `/automation/runtime`; runtime activation remains an environment/runtime policy, not a fake UI toggle.

## Rescue-02B Preparation Revision 3 Applied — Acceptance/Idempotency Hardening

- Fixed Scene execution replay semantics: a repeated `requestId` now **never redispatches device commands**, including when the original execution is still `RESERVED`. This closes a concurrent duplicate-request window that could otherwise execute the same Scene twice.
- Added a regression test for the replayed-`RESERVED` case and bound the behavior into the Rescue guardrail validator.
- Runtime TCP probes now derive PostgreSQL, Redis, MQTT, and EMQX targets from the configured URLs instead of always probing `127.0.0.1`; this prevents misleading readiness results when services live on another host/port.
- Added `scripts/run-rescue-acceptance.mjs` and `npm run rescue:acceptance`:
  - always runs Rescue source validation and lifecycle validation first;
  - runs strict runtime/connectivity preflight and **stops blocked instead of fabricating success**;
  - writes a machine-readable JSON evidence report;
  - `--full` continues into backend build, web/mobile validation, unit/contract tests, database integration, and MQTT integration only after runtime preflight is green.
- Acceptance runner was exercised in this environment and correctly returned `RUNTIME_PRECHECK_BLOCKED`; even a future `AUTOMATED_TEST_SUITE_PASS` does not by itself prove live EMQX webhook/ACL vertical flow or physical hardware.

## Rescue-02B Preparation Revision 4 Applied — Delivery/Scheduler Reliability

- Fixed CRON materialization to use `cron@3` `nextDates(count)` instead of repeatedly calling the single-value `nextDate()`. The old loop could queue the same activation repeatedly and rely on `skipDuplicates`, preventing a real sequence of upcoming runs from being materialized.
- Scheduler skip accounting now increments from the rows actually changed by `updateMany`, so concurrent workers do not over-report `SKIPPED_MISSED`. Disabled/missing-target runs also transition with a PENDING guard.
- Command ACK handling is now safe for MQTT QoS-1/webhook replay:
  - identical terminal ACK/FAILED replays are accepted idempotently;
  - a valid device ACK may transition either `PENDING` or `SENT`, covering the narrow window where broker delivery succeeded before the durable `SENT` update;
  - a concurrent ACK race re-reads durable state and only accepts it when the terminal state matches; conflicting/late terminal states still fail closed.
- ESP32 SDK now keeps a bounded RAM command-id cache. Duplicate in-flight `commandId` deliveries are suppressed; after the application records ACK/FAILED, a duplicate command replays that result instead of invoking the actuator handler again. This cache is intentionally RAM-only and still requires physical reboot testing.
- Removed a duplicate pairing-token `memcpy` in the ESP32 source.
- Acceptance tooling now propagates the selected `--env=<file>` to full build/test subprocesses, and handles Windows `npm.cmd` execution explicitly so the documented command works on Windows/Linux instead of only on POSIX-like hosts.
- Rescue validator now binds these reliability invariants so future sessions cannot silently regress them.

## Rescue-02B Preparation Revision 5 Applied — Runtime Scheduler / Pairing / Delivery Safety

- Closed the command publish/ACK distributed-state race:
  - broker-confirmed publish no longer fabricates `FAILED` merely because persistence of `SENT` fails afterward;
  - `SENT` persistence is conditional on durable `PENDING`, so a fast terminal ACK/FAILED cannot regress back to `SENT`;
  - ACK is allowed to settle the narrow broker-delivered/durable-`PENDING` window and terminal replay remains idempotent.
- Generic device pairing now consumes the one-time provisioning token with an atomic conditional database claim before credential upsert. Concurrent pair requests cannot both rotate the credential.
- Camera pairing now uses the same atomic one-time-token consumption rule; CCTV remains quarantined as a product surface, but credential safety is no longer weaker than generic device pairing.
- Scheduler runtime is now a real opt-in worker behind `SCHEDULER_RUNTIME_ENABLED=true`; default source configuration remains disabled.
- Added `SCHEDULER_CLAIM_TIMEOUT_MS` (default 300000, accepted range 60000..3600000) and dependency-free runtime preflight validation for it.
- Scheduler stale `CLAIMED` rows can be recovered to `PENDING` after the lease timeout. `claimedAt` is also the ownership token used during settlement, so a worker that lost its lease cannot overwrite a newer owner.
- Scheduler completion/failure bookkeeping is conditional on the exact claim token; `claimed` accounting now records claims when they land instead of inferring them from terminal outcomes.
- `SKIP_TO_NEXT` now applies to the complete backlog and executes only the newest due activation, even when backlog exceeds the catch-up cap. `RUN_IMMEDIATELY` keeps only the newest bounded catch-up window and skips older overflow.
- COUNTDOWN materialization is active, ONCE/LIMITED materialization limits are enforced, and the Tenant Schedule UI exposes `INDEFINITE`, `LIMITED`, and `ONCE` instead of silently forcing infinite repetition.
- Schedule runtime runbook now documents activation, lease timeout, stale-claim recovery, and missed-run semantics.
- Rescue validator also had an initialization-order defect (`runtimeChecker` referenced before declaration) discovered during fresh R5 execution; the validator itself is repaired and now executes cleanly.

## Rescue-03 Static Consolidation R1 Applied — Admin Product Surface Cleanup

- Promoted `/tenant/grup-perangkat` from quarantine to a canonical real-data Tenant Admin feature:
  - create/list/delete groups through the existing `/device-groups` backend;
  - add/remove device membership from the active tenant device inventory;
  - no placeholder/demo group rows remain.
- Closed a tenant-isolation defect in Device Groups:
  - create validates every requested device belongs to the active tenant;
  - add-member validates both group and device belong to the active tenant;
  - mutating group operations require `device.update` through `RbacPermissionGuard`;
  - list queries filter member devices by the active tenant so historical poisoned rows from older builds cannot leak cross-tenant device metadata.
- Added Device Group tenant-isolation unit coverage for cross-tenant create/add attempts and poisoned-read filtering.
- Admin Web role flow is now explicit and fail-closed at the product shell:
  - login rejects `MEMBER` for Admin Web and best-effort revokes the just-issued backend session;
  - role hint cookie preserves `ADMIN`, `MEMBER`, and `PLATFORM_ADMIN` instead of flattening all non-platform users;
  - Tenant and compatibility shells permit only `ADMIN`/`PLATFORM_ADMIN` UX access;
  - Super Admin shell permits only `PLATFORM_ADMIN`;
  - backend authorization remains the real security boundary.
- Aligned RBAC policy with the existing AdminRoleGuard contract: `PLATFORM_ADMIN` is an administrative wildcard/superset just like `ADMIN` when operating an allowed tenant context.
- Canonical shell navigation now derives the active path from `usePathname()` and supports nested paths, reducing page-by-page active-menu drift.
- Legacy `/perangkat/[deviceId]` is now a pure redirect to `/tenant/perangkat/[deviceId]` instead of maintaining another device-detail UI generation.
- Centralized `design-system-v2.css` in the Admin Web root layout and removed repeated page-level imports.
- Removed proven-unreferenced Admin Web generations/components:
  - `admin-shell.tsx`;
  - `admin-dashboard-overview.tsx`;
  - `admin-dashboard-v3.tsx`;
  - `device-control-panel.tsx`;
  - `devices-table-v3.tsx`;
  - `devices-table.tsx`.
- Rescue guardrails now bind the new canonical Device Group behavior, role/shell contract, legacy redirect, global design-system import, RBAC parity, and dead-component removal.


## Rescue-03 Revision 3 Applied — End-User Device Authorization & Neutral UI

### Device VIEW/CONTROL boundary

- Added a centralized `DeviceAccessGuard` with explicit `VIEW` and `CONTROL` requirements for tenant-scoped HTTP device routes.
- Tenant `ADMIN` and `PLATFORM_ADMIN` remain administrative supersets only inside the active tenant context.
- Ordinary `MEMBER` access is now restricted to:
  - devices owned by the authenticated user; or
  - devices with an active, unexpired `DeviceShareGrant`.
- `CONTROL` actions require ownership or an active `CONTROL` grant; a VIEW-only grant cannot send commands.
- Command publish requires `CONTROL`; command history requires `VIEW`.
- Device detail/health, capability reads, telemetry latest/history/aggregate, and SSE realtime stream require `VIEW`.
- `/devices` no longer returns every tenant device to an ordinary MEMBER; it is filtered to owned/shared devices.
- Device create/revoke and capability mutation are protected by existing RBAC `device.update` permission instead of remaining open to every tenant member.
- Internal automation command dispatch still calls the domain service directly and is not broken by the HTTP end-user guard.

### User Web / Mobile product cleanup

- Active UI wording was made use-case neutral: removed `Rumah Saya`, home-specific structure text, hotel-only tenant placeholders, and `nama@rumah.id` assumptions.
- User Web and Mobile switch widgets remain fail-closed until CONTROL entitlement is explicitly surfaced to the client; they do not send speculative commands.
- The compatibility Mobile alert surface no longer claims `Tidak ada alert aktif` without a backend alert contract; it now states that alerts are not connected on that compatibility surface.
- User Web manifest wording no longer promises home-device control that the current read-only dashboard surface does not provide.

### Guardrails

- Rescue validator now binds the VIEW/CONTROL boundary, MEMBER device-list filtering, direct telemetry/SSE protection, RBAC device mutation protection, neutral branding, and fail-closed end-user control/alert behavior.

## Rescue-03 Revision 4 Applied — Shared Dashboard Authorization & End-User SWITCH Control

### Centralized device entitlement decisions

- Added `DeviceAccessService` as the reusable owner/share evaluator behind `DeviceAccessGuard`; VIEW/CONTROL policy no longer needs to be duplicated by Dashboard or HTTP controllers.
- Decisions remain tenant-scoped and fail closed: ADMIN/PLATFORM_ADMIN only receive access to devices that exist in the active tenant, while MEMBER decisions require ownership or an active, unexpired VIEW/CONTROL share.
- Device access evaluation is bounded to prevent unbounded dashboard/device batches.

### Shared dashboard isolation

- Dashboard create/replace now validates every MEMBER binding before persistence: READ/status bindings require VIEW, while WRITE/COMMAND bindings require CONTROL.
- Dashboard aggregate reads filter inaccessible device bindings so a TENANT_SHARED dashboard cannot leak hidden device identifiers to a MEMBER.
- Dashboard resolution and widget-data queries apply the same filter before the resolver/query path.
- VIEW-only shares may still read capability metadata, but `isWritable` is forced false unless the authenticated user has CONTROL.
- `PLATFORM_ADMIN` shared-dashboard semantics are now aligned consistently in service and repository policy.

### Canonical end-user SWITCH control

- User Web has a session-backed same-origin `/api/device-command` proxy using a dynamic capability key and server-enforced CONTROL permission.
- User Web SWITCH actions appear only for a READY boolean capability whose resolved access is writable.
- Mobile canonical dashboard uses the same entitlement rule and dynamic capability key; the old `switch.power` helper remains compatibility-only.
- Both clients send explicit boolean values and do **not** fabricate final actuator state after submit; UI states that the authoritative state must come from ACK/telemetry.
- Command idempotency keys are generated per request; User Web uses Node `randomUUID()`.

### Guardrails

- Rescue validator binds dashboard binding authorization, shared-dashboard filtering, VIEW-only write suppression, PLATFORM_ADMIN parity, and User Web/Mobile CONTROL-aware SWITCH behavior.

## Known Quarantined / Incomplete Areas

These files/routes may exist but are not part of the canonical product flow yet:

- `/technician` — compatibility tools; only diagnostics use live data.
- `/mobile-preview` — visual preview only; no simulated operational values are allowed.
- `/cctv` — onboarding exists, streaming remains incomplete.
- `/noc` — some live metrics exist; location map contract remains incomplete.
- `/super/commands` — cross-tenant command history/ACK backend query is not available.
- `/super/reports` — legacy/static report catalog; not in canonical navigation.

## Fresh Validation Reality

Fresh checks performed on the current FOUNDATION-ALIGNMENT-01 source tree:

- Rescue guardrail validator: **161/161 PASS**.
- Lifecycle metadata validator: **PASS**.
- TypeScript/TSX parser: **597 files / 0 parse errors**.
- JS/MJS/CJS syntax: **40 files / 0 failures**.
- JSON parse: **25 files / 0 failures**.
- YAML parse: **3 files / 0 failures**.
- Direct typed-capability smoke: **9/9 PASS**.
- Baseline manifest verification: **934/934 PASS**.
- Portable hygiene: **PASS** — no project `.env`, `node_modules`, generated `dist`, runtime log/cookie/cache.

Not claimed:

- Full dependency-resolved TypeScript typecheck.
- Nest/Admin Web/User Web production build.
- Jest/unit/contract/e2e suites.
- PostgreSQL/Redis/MQTT integration.
- EMQX external HTTP authentication/authorization/webhook wiring.
- ESP-IDF compile, flash, or physical ESP32 validation.
- OTA hardware success.
- Production readiness.

A fresh dependency install was attempted previously. Online `npm ci --ignore-scripts` did not complete in this execution environment, while an explicit offline retry failed with `ENOTCACHED` for `postcss-8.5.26.tgz`. Partial `node_modules` was removed. Docker/Podman is not available here. The dependency-free runtime preflight was re-run with `--strict --probe` against `ops/env/rescue-local.env.example` and correctly exited 1 with **11 blockers**: no container runtime, dependencies not installed, four placeholder secrets, and PostgreSQL/Redis/MQTT/EMQX Dashboard/API TCP endpoints unavailable. This is runtime-environment evidence, not runtime PASS. See `docs/RESCUE-02-RUNTIME-RUNBOOK.md`.

The historical module-runner source check still has the pre-existing Slice 11.12 closure invariant issue. Do not mutate runtime behavior merely to satisfy stale lifecycle wording.

## Next Gates

### Gate A — RESCUE-02B Runtime Integration / Vertical Acceptance (still mandatory and pending)

The repository is now prepared for this gate. Execute the real flow against fresh dependencies and services:

`login -> tenant context -> provision device -> pair -> capability -> heartbeat/online -> telemetry -> dashboard/realtime -> command -> MQTT delivery -> ACK/history -> scene -> schedule -> notification/report`

Minimum runtime gate:

1. Fresh `npm ci` / dependency install in a controlled environment.
2. Fresh Prisma generation and build; no reuse of old `dist/`.
3. PostgreSQL + Redis + API available.
4. EMQX configured for backend HTTP authentication/authorization and telemetry/ACK integration as documented in the runbook.
5. Enable scheduler runtime only for acceptance with `SCHEDULER_RUNTIME_ENABLED=true` and `SCHEDULER_CLAIM_TIMEOUT_MS=300000`.
6. Execute the vertical flow and record PASS/FAIL per step.
7. Compile/flash ESP32 SDK and verify pairing, telemetry, command, ACK, reconnect, and heartbeat on hardware.
8. Run the Wave 3 automated OTA path only after exact artifact SHA-256 verification; keep PHYSICAL OTA/HIL evidence pending until a real board proves the release-bound artifact during final certification.

Runtime-dependent RESCUE-03 work and production approval still require RESCUE-02B PASS. Low-risk static consolidation may continue under Gate B while the runtime environment is unavailable.

### Gate B — RESCUE-03 Static Product Consolidation (may continue while Gate A is environment-blocked)

Continue only work that does not pretend runtime proof exists:

1. Audit canonical Super Admin/Tenant Admin/User Web/Mobile routes against real API contracts.
2. Remove only source files proven unreferenced by routes/tests/contracts.
3. Replace remaining active placeholders only when an already-existing real backend contract is available; otherwise keep them quarantined.
4. Keep NOC, CCTV streaming, Technician extended workflows, cross-tenant command center, and static Super Reports quarantined until their runtime/domain contracts are complete.
5. Do not mark production readiness or RESCUE-02B PASS from static consolidation.


## Rescue-03 R5 Applied — Command Reconciliation & Canonical Mobile Blueprint

- Added tenant/device-scoped command status lookup by `correlationId`; the HTTP route still requires device `VIEW`, while command submission still requires `CONTROL`.
- User Web now reconciles the exact command through `PENDING/SENT` to `ACKNOWLEDGED/FAILED/TIMED_OUT` for a bounded period instead of stopping at “command sent”. It refreshes the authorized dashboard only after a terminal command state and never fabricates actuator state.
- Mobile uses the same command-status contract. Terminal reconciliation triggers a fresh authorized dashboard load; unresolved `PENDING/SENT` remains explicitly non-terminal.
- Removed the unreferenced second Mobile UI generation under `src/app/mobile-app.tsx`; `apps/user-mobile/App.tsx` remains the only Expo runtime authority.
- Preserved the Development Kit/UI Blueprint five-tab Mobile requirement on the secure canonical shell: `Home`, `Devices`, `Realtime`, `Alerts`, `Profile`.
- Devices and Realtime read only through the authenticated mobile session client; Alerts remains fail-closed and does not fabricate an all-clear state.
- Historical G1 mobile contract was updated to validate the canonical secure shell instead of requiring the removed duplicate app.
- Rescue guardrails now bind command reconciliation and the canonical five-tab Mobile surface.

RESCUE-02B runtime acceptance remains pending; R5 is a bounded static/source consolidation revision, not production approval.


## Rescue-03 R6 Applied — Fail-Closed Operator Data & Runtime Check Semantics

- Tenant Dashboard no longer converts failed device/space/scene requests into valid zero counts. Failed cards display unavailable state, while genuine successful empty datasets still display zero/empty correctly.
- Tenant Dashboard telemetry sparkline now distinguishes backend unavailability from a successful query with no telemetry.
- Tenant Historical telemetry now renders a transport/backend error separately from a valid empty aggregate range.
- Super Roles no longer reports zero users when the platform user directory fails, and its MEMBER permission summary now matches the owner/share VIEW/CONTROL boundary introduced in R3/R4.
- Super Provisioning distinguishes tenant/device directory outages from genuine empty inventories and disables provisioning while the tenant directory is unavailable.
- Super MQTT Center now displays the exact canonical topics (`tenants/<tenantId>/devices/<deviceId>/...`) and separates broker authentication (`POST /mqtt/auth`) from telemetry ingest (`POST /mqtt/webhook/telemetry`).
- The official `npm run rescue:runtime:check` command is strict by default. A blocker now produces a non-zero exit code even when the operator invokes the package script directly; `--probe` remains optional.
- Rescue guardrails now bind these operator-truthfulness and fail-closed runtime-check invariants.

RESCUE-02B runtime acceptance remains pending; R6 is static/source consolidation and does not approve production deployment.


## Rescue-03 R7 Applied — Dependency Truthfulness & Capability-Driven Device Detail

- Super API Keys now distinguishes API-key directory failure, tenant-directory failure, and genuine empty results. API-key creation is disabled when tenant data is unavailable; revoke failures are surfaced instead of ignored.
- Super User provisioning now fails closed when the tenant directory is unavailable instead of presenting an empty tenant selector as a valid state.
- Tenant Automation and Scene builders now fail closed when the device/capability catalog cannot be loaded. They no longer convert dependency outages into empty selectors.
- Tenant Schedule creation now fails closed when the Scene catalog is unavailable and distinguishes that failure from a genuine no-scene state.
- Scene execution history and Schedule run history now distinguish backend failure from a genuine empty history.
- Canonical Device Detail now treats Capability, Telemetry, and Command History as independent data dependencies with explicit failure states. Capability-count display uses an unavailable marker rather than reporting zero when capability loading failed.
- Device Detail command controls are now capability-driven. Hardcoded `switch.power` / `device.restart` command buttons were removed; boolean controls are generated only from capabilities marked writable. Non-boolean writable capabilities remain fail-closed in this detail surface until a typed input contract is provided.
- Device Detail command submit feedback explicitly states that final state is authoritative only after ACK/telemetry; successful HTTP submission does not fabricate actuator state.
- The internal continuation rule was corrected so a later chat cannot accidentally fall back to an older baseline.
- Rescue guardrails now bind these R7 dependency/error-state and capability-driven-command invariants.

RESCUE-02B runtime acceptance remains pending; R7 is bounded static/source consolidation and does not approve production deployment.


## Rescue-03 R8 Applied — Typed Capability Semantics & Scene Integrity

- Added shared typed capability value parsing for `boolean`, `integer`, `number`, `string`, `enum`, and JSON `object`; declared types are preserved instead of using generic string/number coercion.
- Numeric values honor capability `min`, `max`, and `precision`; enum values are selected from `enumValues`; JSON object input must parse to an object rather than an array/scalar.
- Added reusable `CapabilityValueInput` UI for boolean/enum/numeric/object/string-safe inputs.
- Device Detail can create numeric/enum capability constraints and issue typed commands for real writable capabilities instead of supporting boolean only.
- Scene and Automation builders reset stale values when the selected capability changes and parse values according to the selected capability contract.
- Automation UI is intentionally limited to the action data types currently supported by the automation runtime (`boolean`, `number`, `string`) instead of advertising unsupported integer/enum/object execution.
- Scene UI excludes object actions while preserving typed primitive/enum values; unsupported capability contracts remain fail-closed.
- Scene persistence now fail-fast validates that every action resolves to the exact tenant device + capability id + capability key, is writable, and accepts the supplied typed value before the Scene is stored.
- Added Scene persistence regression coverage and Rescue guardrails for typed capability behavior and Scene tenant/capability integrity.
- Direct typed-value utility smoke checks passed 9/9 cases, including preserving `"00123"` as a string, integer/number constraint enforcement, typed enum values, boolean values, and JSON object validation.

RESCUE-02B runtime acceptance remains mandatory and pending. R8 is bounded static/source consolidation and does not approve production deployment.

## RESCUE-02B RR23 — Contract Drift Repair + Complete Failure Index

Live RR22 evidence proved the runtime and build path through Gate 2 up to the root unit/contract suite:

- sealed manifest: PASS (992/992 tree, 993/993 hashes);
- Rescue validator: 251/251 PASS;
- local core runtime: protocol-ready;
- source-bound Gate 1 receipt: PASS and live-revalidated;
- unit-type boundary self-test: PASS;
- acceptance self-test: PASS;
- backend production build: PASS;
- Web/mobile validation: PASS;
- root Jest result: 18 suites failed / 162 passed, 25 tests failed / 1160 passed.

The visible failures were not one database/runtime problem. A deterministic source-contract audit reproduced sixteen stale contract assertions across fourteen root contract suites. Those assertions were written against older surfaces and had not followed later canonical hardening, including DeviceAccessGuard + VIEW authorization, PLATFORM_ADMIN shared-admin support, the platform device directory, accessible spaces, encoded command paths, backend-backed analytics Alerts, the canonical analytics-findings surface, DeviceModule dashboard authorization, the automation runtime-policy helper, and the current ESP32 wire-contract wording.

One additional real source defect was found: `src/automation/automation.repository.ts` emitted the activation/deactivation structured event name through a ternary expression. The structured-logging contract requires literal event names. RR23 preserves the same behavior but emits two literal event branches.

RR23 also fixes acceptance diagnostics. Previously `run-rescue-acceptance.mjs` printed only the final 3,000 characters from a failed subprocess, hiding earlier Jest suite/test names and encouraging one-error-at-a-time diagnosis. The full output always remains in the JSON report; RR23 now prints a bounded high-signal `FAILURE SUMMARY` containing every visible `FAIL <suite>`, `● <test>`, TypeScript diagnostic, and Jest aggregate count before the bounded tail.

Local RR23 proof before sealing:

- root `test/*.contract.spec.ts` isolated contract harness: 405/405 PASS;
- structured-logging contract scan: PASS after literal automation event repair;
- unit-type boundary self-test: PASS;
- acceptance orchestration self-test: PASS;
- acceptance failure-summary self-test: PASS;
- runtime protocol self-test: PASS;
- EMQX webhook self-test: PASS;
- local-runtime self-test: PASS;
- production-approval receipt self-test: PASS;
- lifecycle validation: PASS;
- Rescue validator: 254/254 PASS before final sealing.

RR23 changes sealed source, so the RR22 Gate 1 receipt cannot be reused. Rebind Gate 1 once on RR23, then run full acceptance. If any tests still fail, RR23 will expose all failing suite/test headers in one run; continue only from that complete failure set. Automated acceptance, live broker evidence, physical ESP32 evidence, OTA approval, and production approval are still not claimed until proven live.


## RESCUE-02B RR27 — Live Broker Authentication Fail-Closed Root Fix (2026-09-13)

- RR26 automated acceptance is proven live PASS through backend build, web/mobile validation, 1185/1185 unit/contract tests, database integration, and MQTT integration.
- RR26 live evidence then exposed a security blocker: EMQX 5.8.0 accepted an MQTT CONNECT carrying a deliberately wrong secret even though the backend `/mqtt/auth` returned `result=deny`, the global HTTP authenticator was enabled, and `tcp:default` reported `enable_authn=true`.
- Vendor release notes document a false-positive authentication fix beginning with EMQX 5.9.0. RR27 pins the rescue and development broker images to EMQX 5.9.2.
- RR27 also removes the validation gap that allowed Gate 1 to pass with positive-connect evidence only. Full runtime readiness now requires both a valid MQTT publisher CONNECT and a fresh wrong-secret CONNECT rejection.
- `scripts/self-test-rescue-runtime-probes.mjs` includes an explicit fail-open broker fixture that accepts every password; the runtime checker must reject that fixture specifically on `MQTT wrong-secret rejection`.
- Existing RR26 evidence is diagnostic history only after this source change; RR27 must repeat Gate 1, automated acceptance, and evidence initialization before live evidence continues.


## RR28 — Root-cause fix: foreign Mosquitto host-port collision

Live comparator evidence on the operator PC proved the previous wrong-secret result was **not** produced by the rescue EMQX container. With no Podman rescue containers running, `127.0.0.1:1883` was still listening under Windows process `mosquitto` (PID 4148) and accepted an arbitrary MQTT username/password. Therefore the old host probe was testing a foreign broker on the same host port while rescue EMQX itself was configured separately inside Compose.

RR28 fixes this at the runtime boundary instead of changing backend auth or Gate 2 logic:

- Rescue EMQX keeps canonical container-network MQTT at `emqx:1883` for API/broker traffic.
- Host mapping is isolated behind `RESCUE_MQTT_HOST_PORT`, default **18884**; canonical host rescue URL is `mqtt://127.0.0.1:18884`.
- `rescue:local:up/recover` refuses to start if the dedicated rescue MQTT host port is already occupied, instead of silently probing some other broker.
- Local runtime state records `mqttHostPort` and `mqttHostUrl`.
- Gate 1, Gate 1 validation, and local automated acceptance re-use that source-bound runtime endpoint for live MQTT positive/negative auth probes.
- External topology behavior remains unchanged: without a source-bound local runtime, the checker continues to use the externally configured `MQTT_BROKER_URL`.
- Regression coverage now reproduces the exact incident: a legacy/fail-open MQTT broker is present on the old endpoint while the rescue broker is healthy on its dedicated endpoint. Runtime readiness and automated acceptance PASS only by proving the dedicated rescue endpoint.

This corrects the RR27 diagnosis: the observed wrong-secret acceptance was caused by **host-port identity collision with local Mosquitto**, not by a proven EMQX credential-validation defect. The RR27 negative-auth gate itself remains valid and is retained.

Gate 2 business logic, database schema, authorization logic, Web/Mobile source, and device credential verification are unchanged by RR28.

Next operator gate: overlay RR28 while preserving `.env`, `node_modules`, and named volumes; run `rescue:local:recover`, confirm the runtime reports MQTT host endpoint `127.0.0.1:18884`, then Gate 1 + Gate 1 validation. Only after that re-run full acceptance and initialize new source-bound live evidence.

### RR28 sealed-source regression evidence

Before final packaging, the root-cause fix passed:

- exact source tree generation: **997 source paths**;
- baseline manifest generation: **998 entries**;
- Rescue validator: **266/266 PASS**;
- runtime protocol regression: **PASS**, including a foreign fail-open broker on the legacy endpoint while the dedicated rescue endpoint remains correct;
- local-runtime orchestration self-test: **PASS**;
- acceptance orchestrator self-test: **PASS**, including source-bound local MQTT endpoint selection;
- module lifecycle validation: **PASS**.

No live Gate 1 PASS is claimed by these synthetic checks. The operator PC must still prove the dedicated rescue endpoint after overlay.

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

## WAVE 1 LARGE-BATCH CI HARDENING V12 — NEGATIVE ACL CONNECTION LIFECYCLE

Latest GitHub evidence (`logs_94531471162.zip`) confirms the V11 callback bounds work: the outer job no longer hangs indefinitely and the exact operation is named. Core `test` remains green; real EMQX 5.9.2 is reached; valid device auth, wrong-secret denial, device command subscribe, and publisher command delivery all pass. The first concrete failure is the publisher forbidden telemetry publish timing out after the preceding forbidden subscription check.

Root cause is the negative ACL connection lifecycle, not EMQX authentication. Rescue EMQX is configured to disconnect a client on authorization denial. V11 reused a client after a denied subscribe, so a later QoS-1 publish could execute on an already disconnected MQTT.js client and never receive a PUBACK callback.

V12 permanently treats the entire negative ACL class as one batch: every forbidden subscribe/publish runs on a fresh one-shot connection; explicit SUBACK/PUBACK authorization denial, explicit authorization error, or MQTT v5 `DISCONNECT 0x87` is required for PASS; close-only/unrelated error/timeout is fail-closed; positive clients are preserved for later positive assertions; and persistence/state side effects are independently verified absent. Publisher non-command, cross-device, and wrong-device ACK paths are all covered by the same mechanism.

This remains CI/acceptance harness hardening only. No application business logic, Prisma schema, UI, MQTT auth backend rules, or production approval boundary is changed. Rescue endpoint remains `18884`; the foreign Windows Mosquitto issue on `1883` stays closed. Production remains blocked on physical ESP32/Wi-Fi reconnect/physical MQTT/OTA evidence.

- Wave 2 sealing infrastructure is cross-platform deterministic: repository-tree ordering uses code-point order instead of host-default locale collation; mixed-case ordering is regression-tested.


---

## WAVE 2 RECOVERY V5 — PRISMA LOCAL TOOLING ENVIRONMENT

The V4 operator recovery passed deterministic/source sealing, all inherited Wave 1 checks, `RESCUE VALIDATION PASS (281/281)`, broker smoke self-test, GitHub CI self-test and Wave 2 source invariants. The only failure occurred at `wave2:prisma:check`: Prisma P1012 because the operator shell did not define `DATABASE_URL`. No schema validation error was reported.

V5 classifies this correctly as a local tooling-env defect. `scripts/check-prisma-schema.mjs` preserves any real caller `DATABASE_URL` and otherwise injects a deterministic loopback port-1 schema-only URL solely for Prisma `validate` and `generate`. A dependency-free self-test proves fallback/explicit/blank behavior and subprocess order. This fallback is STATIC/CONTRACT evidence only; GitHub PostgreSQL 16 + migration + isolated-schema integration remains authoritative runtime evidence. The V5 target seal is 1033 source paths / 1034 manifest entries. Wave 2 remains ACTIVE and unpushed until V5 local gate passes and the single GitHub Wave 2 push is fully green.


### V5 package QA
- Prisma schema-wrapper dependency-free self-test: PASS (fallback, explicit URL preservation, blank handling, validate→generate ordering).
- Wave 2 core runtime invariant self-test: PASS.
- baseline manifest regression: PASS.
- GitHub CI contract self-test: PASS.
- V5 applicator synthetic recovery: PASS from a sealed 1031/1032 V4 structural state through 12-file overlay, 1033/1034 regenerated seal, synthetic lightweight-gate invocation, and final verify.
- Real operator Prisma/Jest and GitHub PostgreSQL/HTTPS/Redis/EMQX/full acceptance remain pending and must not be inferred from the synthetic applicator test.

---

## WAVE 2 RECOVERY V6 — TYPESCRIPT CONTRACT CLOSURE

Operator V5 passed the inherited Wave 1 lightweight chain, `RESCUE VALIDATION PASS (281/281)`, broker/CI self-tests, Prisma wrapper self-test, and real Prisma validate/generate. The first source-level failures appeared only when the 12 targeted Jest suites compiled Wave 2 code. Eight suites ran successfully with 88 tests passing; four suites could not compile because two Wave 2 type contracts had drifted.

Root causes are grouped and fixed together:
- `CommandMetricEvent` did not yet include the retry lifecycle events emitted by `CommandService.retryPublish`: `retry_replay`, `retry_raced`, and `retry_claimed`;
- `NotificationService.claimDueBatch` allowed TypeScript to infer its defaulted `claimTimeoutMs` parameter from an `as const` literal, producing the literal type `60000` instead of runtime `number`.

V6 widens the notification batch/claim parameters explicitly to `number`, extends the command metric event union, and adds the command retry metrics to the targeted metrics regression suite. This is a source-contract correction only; no business-flow semantics, database schema, MQTT behavior, lease policy, or retry policy are relaxed. Wave 2 remains ACTIVE and unpushed until V6 local gate passes and the single GitHub Wave 2 heavy/live acceptance is fully green.

### V6 package QA
- Wave 2 core runtime invariant self-test: PASS.
- baseline manifest regression: PASS.
- GitHub CI contract self-test: PASS.
- Prisma wrapper self-test: PASS.
- `CommandMetricEvent` retry-event TypeScript contract check: PASS.
- syntax/transpile for the three TypeScript files changed by V6: PASS.
- V6 applicator synthetic recovery: PASS from sealed V5 `1033/1034` through 11-file overlay, unchanged `1033/1034` reseal, synthetic lightweight-gate invocation, and final verify.
- Real operator targeted Jest and GitHub PostgreSQL/HTTPS/Redis/EMQX/full acceptance remain pending; no PASS is inferred from the synthetic gate invocation.

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



## Wave 2 V9 root-cause correction (2026-09-15)
- GitHub V8: unit 185/185 and E2E 4/4 passed; DB integration 14/15 suites passed.
- Remaining 3 Notification tests all failed as `WEBHOOK_UNREACHABLE`; the old transport flattened the underlying TLS/socket cause.
- Root correction: one shared `NotificationHttpsClient` for Webhook + Email Relay, explicit scoped CA trust for tests, absolute timeout, TLS/network/timeout classification, no global TLS bypass.
- Container QA: actual HTTPS success with fixture CA PASS; untrusted cert -> TLS/DEPTH_ZERO_SELF_SIGNED_CERT PASS; timeout -> ETIMEDOUT PASS; refused socket -> NETWORK/ECONNREFUSED PASS; changed TypeScript transpile PASS; Wave 2 invariant PASS.
- Wave 2 remains ACTIVE pending Windows local 14-suite gate and GitHub heavy acceptance.

V9 pre-handoff QA: shared HTTPS real-network checks + authoritative 1035/1036 seal + synthetic V8→V9 applicator all PASS; GitHub heavy evidence pending.


## WAVE 3 V2 — ESP-IDF BUILD-CHAIN ROOT-CAUSE CORRECTION

The first Wave 3 GitHub run preserved the green core application baseline but failed during the first real ESP-IDF configure step: `main` required unknown component `iot_sdk`. V2 root audit expanded this into the complete native firmware class before another push: component identity/discovery, explicit ESP-IDF API ownership, 4MB dual-OTA flash sizing, MQTT CA verification, OTA content-length fail-closed behavior, Wi-Fi-backed entropy before long-lived device-secret generation, ESP binary magic validation, and truthful NVS at-rest evidence. ESP32 and ESP32-C3 are now independent parallel build/QEMU matrix targets so native failures surface together and in parallel with core CI; cheap source/build-graph guards run before ESP-IDF install. Wave 3 remains ACTIVE until both native builds/QEMU boots, exact-artifact live-service OTA simulation, real EMQX and full acceptance are green.
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

## WAVE 3 V3 — ESP-IDF 5.5 MQTT API-SURFACE ROOT CORRECTION

The second Wave 3 GitHub native run proved the V2 component/build graph correction worked: both `esp32` and `esp32c3` reached compilation of `packages/esp32-sdk/src/iot_sdk.c`, while the inherited core application remained green (`186/186` suites) and PostgreSQL integration remained green (`15/15` suites). Both chip targets then failed on the same SDK line because the source used non-existent ESP-MQTT symbols `esp_mqtt_client_register_events` and `MQTT_EVENT_ANY_ID`.

V3 corrects the API surface to ESP-IDF 5.5 public ESP-MQTT contracts: `esp_mqtt_client_register_event(..., MQTT_EVENT_ANY, ...)`. A new dependency-free `self-test-wave3-esp-idf-api-surface.mjs` rejects the obsolete symbols and checks the public owner-header/component dependency pairs for MQTT, HTTP, OTA, RNG, netif, Wi-Fi, NVS and mbedTLS. GitHub runs this guard before the expensive ESP-IDF installation, so future native API drift fails fast. No backend, Prisma, MQTT broker ACL, OTA semantics, or application API is changed. Wave 3 remains ACTIVE until native compile/QEMU, exact-artifact live simulation, real EMQX and full acceptance are all green.

### V3 package QA
Dependency-free Wave 3 guards and CI contract PASS; workflow/package/pytest syntax PASS; candidate seal `1052/1053` PASS; synthetic recovery from clean V2 `1051/1052` to V3 `1052/1053` PASS with final manifest verification. Real ESP-IDF compile/QEMU remains GitHub-only evidence.


## Wave 3 V4 — ESP-IDF toolchain lifecycle root correction
- GitHub V3 proved both ESP32 and ESP32-C3 native builds completed before QEMU setup.
- Failure class was CI environment re-activation: `install-esp-idf-action` had already exported IDF/tool/Python state, then the QEMU step re-sourced `export.sh` and failed its tool registry with `esp-rom-elfs has no installed versions`.
- V4 keeps the GitHub action as the single ESP-IDF environment owner. QEMU is installed with `$IDF_PYTHON_ENV_PATH/bin/python`; its resolved binary directory alone is appended to PATH/GITHUB_PATH.
- No backend, DB, MQTT business logic, or firmware SDK behavior changed in V4. Wave 3 remains ACTIVE until native QEMU/live simulation/full acceptance is green.


## Wave 3 V5 native QEMU image/runner root correction — 2026-09-15

The V4 GitHub run proved both ESP32 and ESP32-C3 compile successfully and QEMU binaries install correctly. Boot then failed before guest execution because `pytest-embedded-qemu` 2.9.2 generated the merged flash with the esptool v5 command spelling `merge-bin`, while the ESP-IDF 5.5.5 environment carries esptool 4.12.0 whose CLI command is `merge_bin`. The mandatory QEMU path no longer uses pytest-embedded. V5 uses the ESP-IDF 5.5.5 frontend (`idf.py merge-bin`) to create the canonical 4MB flash image, then launches Espressif QEMU directly and requires all firmware boot markers before PASS. A dependency-free runner self-test covers success, premature exit, timeout, invalid target, and stdout/stderr marker collection before the expensive toolchain install.

Wave 3 V5 deep-scan hardening additionally validates the built target identity from `project_description.json` and the exact 4 MiB merged QEMU flash size before guest launch. The live OTA stage remains bound to the application `.bin`, while QEMU alone consumes the merged full-flash image.
