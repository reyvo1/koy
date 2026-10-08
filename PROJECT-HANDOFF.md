# CURRENT PRODUCT HARDENING CHECKPOINT — 2026-10-08

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->

- **Verified committed baseline:** commit `4907ea5822e07188394ebee3c72e860e79a793cc`, branch `main`, origin `reyvo1/iot-platform`; GitHub Actions run `37449896281` completed/success on that exact source. This run does not certify the new local changes.
- **Owner instruction:** complete the Development Kit product gaps without making physical hardware a blocker. The owner subsequently explicitly authorized continuing the npm audit and **PUSH** in this same session; the earlier no-push instruction is superseded. No production deploy or existing-runtime restart is authorized.
- **Implemented batch:** shared typed commands and project confirmation modals; canonical 23+23 admin route sweep; User Web/mobile scene and schedule actions; web camera playback with tenant/VIEW-guarded, credential-free SDP; stored-coordinate maps and admin operator coordinate entry; durable, authority-revalidated recurring maintenance; MQTT/HA connection-check/sync/history/disable; authenticated device firmware/protocol reports. Additive migration strengthens database tenant provenance and prevents duplicate OPEN windows. Details: `docs/PRODUCT-OPERATIONAL-COMPLETION-2026-10-07.md`.
- **Candidate:** commit `68454f460d9eeee8a9750ec03daafa6570c5d5a6` was pushed without force to verified `origin/main`. Exact-source GitHub Actions run `37643985961` completed/failure at Wave 5 SDK loading; it is not an all-green checkpoint. Core CI (291 suites / 2584 tests), PostgreSQL integration (16 suites / 72 tests), both ESP-IDF/QEMU targets, live EMQX, simulated ESP32/OTA and Wave 4 passed. Current known dirty tree contains the bounded native-Node SDK root repair and handoff/evidence synchronization. No production deployment occurred; Waves 1–13 remain SOFTWARE SCOPE CLOSED / GREEN and no numbered wave/module is invented.
- **FIRST FAILING GATE:** run `37643985961` → `Wave 5 public API webhook and SDK live regression` → native Node ESM `ERR_MODULE_NOT_FOUND` for the extensionless shared parser re-export in `packages/sdk/src/index.ts`. Repair uses explicit `.ts` source extension and SDK no-emit `allowImportingTsExtensions`; a subprocess regression imports the actual SDK through Node type stripping and exercises parser/client behavior. No gate or production contract is weakened. Full live acceptance remains pending a new exact-source run.
- **Final local QA:** targeted Jest 55/55 suites, 558/558 tests; one complete full Jest run 291/291 suites, 2584/2584 tests; real migrated PostgreSQL 8/8 integration tests; focused Chrome actions and real decoded synthetic video; backend/SDK/Admin/User Web/mobile/design-system typechecks; Admin and User Web webpack production builds; lint, zero-critical production audit, staged secret scan and required source/schema/ESP-IDF/QEMU-runner contracts PASS. The standard Turbopack build could not bind a sandbox worker port locally; the unchanged default build remains mandatory in GitHub. No full GitHub acceptance is claimed for this candidate yet.
- **SDK repair QA (2026-10-08):** SDK typecheck and native-Node SDK regression PASS (1 suite / 10 tests). The unchanged full CI will certify the repair; the prior candidate full Jest count is 291/291 suites / 2584/2584 tests.
- **Surface:** 46 controllers / 197 endpoints; 23 tenant and 23 super canonical menus, 7 User Web targets and existing 5 mobile tabs. API-only protocols do not gain artificial menus. CCTV/NOC/Technician keep QUARANTINE until a new full acceptance approves promotion.
- **Evidence boundary:** `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent class. Focused browser evidence is `BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT`; domain responses/device lookup are explicit fixtures while Chrome decodes real go2rtc/FFmpeg test-pattern frames. PHYSICAL/HIL and provider-owned observations remain separate and non-blocking; they are not fabricated. Native mobile camera transport, Alexa/Google authorization and continuous provider health remain explicit scope boundaries.
- **Production deployment:** NOT APPROVED. Server-owned connection configuration and maintenance-worker enablement require operator setup after migration. No production credentials/configuration were changed.

## Next action

Validate the native Node SDK regression, SDK typecheck and affected contracts; reseal tree/manifest, run `npm run session:handoff:self-test` and required authority/structural checks, review the bounded repair, then commit/push under the existing explicit owner authorization. Monitor the resulting exact SHA through full GitHub acceptance. Resume from any actual first failing gate, preserving the candidate. On resume verify `git rev-parse HEAD` / `git status --short`, branch/remote and exact-SHA CI; do not audit from zero or treat red run `37643985961` as green. Session-owned disposable fixtures were removed. Production deployment remains unapproved and physical equipment remains non-blocking.

--- HISTORICAL CHECKPOINTS BELOW — superseded by the block above ---

# SESSION TRANSFER — 2026-10-05 FINAL PRODUCT-SURFACE INTEGRITY AUDIT

- **Authoritative all-green software baseline:** commit `8b2a76b69bb84e12324baee5ca031c7540d3b5d3` / GitHub Actions run `37307702951` / evidence `logs_101047777120.zip`. Evidence confirms 283/283 Jest suites, 2494/2494 tests, PostgreSQL integration 15/15 suites / 64/64 tests, dual ESP32/ESP32-C3 QEMU, Deep Product live regression, Wave 7, and full automated acceptance are green.
- **FIRST FAILING GATE:** none at the authoritative checkpoint. Waves 1–13 remain software-scope closed/green and must not be reopened without newer failing evidence.
- **Active local batch:** final backend↔frontend/menu/action integrity audit. This batch is **not yet a certified checkpoint** until official local gates and a new GitHub Heavy UAT pass on the real checkout.
- **Root fixes in this batch:** one canonical 23-route tenant navigation model shared by TenantShell, lab/field shell, and dashboard quick access; user directory returns the exact tenant membership status and fails closed on tenant/membership integrity drift; user edit sends only fields actually changed and renders PENDING/REVOKED truthfully; Technician quarantine now exposes the already-existing manual maintenance open action as well as resolve.
- **Static audit result:** all 23 canonical tenant menu targets exist in the audited source; 72 BFF mutation routes have UI callers by static surface scan; backend census remains 45 controllers / 187 HTTP-or-SSE endpoints; known MACHINE_ONLY/AUTH_UI/LEGACY/QUARANTINE exclusions remain intentional.
- **UAT policy:** no UAT assertion, auth/RBAC/TLS/rate-limit rule, simulated-hardware requirement, or error semantic is weakened. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent evidence label; PHYSICAL/HIL remains optional/non-blocking for software.
- **Snapshot boundary:** this exported audit workspace still lacks the `/super/reports` subtree and repository manifest files, so `rescue:validate` and browser sweep cannot be claimed here. The complete real checkout must run those official gates; missing Chrome in the audit container is not converted into a PASS.
- **V7 local validation:** PostgreSQL integration is now proven green at **15/15 suites, 64/64 tests**. Full `wave3:prepush:check` then stopped fail-closed at **2 failing Jest suites / 2 tests**: the Module-10 navigation contract still required labels to live inline in `tenant-shell.tsx` after the canonical-navigation refactor, and `demo-seed-reentry` had no `DATABASE_URL` because the V7 runner did not carry an isolated test database into the full-Jest phase. No push occurred.
- **V8 root fix:** keep the navigation uniqueness assertion but read tenant labels from the canonical `tenant-navigation.ts` source and assert both tenant shells consume it; keep a dedicated migrated PostgreSQL test schema alive through full pre-push so DB-backed full-Jest tests run against isolated test data. No UAT, auth/RBAC, TLS, rate-limit, simulated-hardware, or error-semantic assertion is weakened.
- **Production deployment:** remains **NOT APPROVED** until real target-environment evidence is captured and verified.

# Project Handoff — Final Cross-Surface Integrity Audit

<!-- HISTORICAL-ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->

## Current authority — 2026-10-05

- **Authoritative all-green software baseline:** commit `8b2a76b69bb84e12324baee5ca031c7540d3b5d3` / GitHub Actions run `37307702951` / evidence `logs_101047777120.zip`. Evidence confirms 283/283 Jest suites, 2494/2494 tests, PostgreSQL integration 15/15 suites / 64/64 tests, dual ESP32/ESP32-C3 QEMU, Deep Product live regression, Wave 7, and full automated acceptance are green.
- **FIRST FAILING GATE:** none at the authoritative checkpoint. Waves 1–13 remain software-scope closed/green and must not be reopened without newer failing evidence.
- **Active local batch:** final backend↔frontend/menu/action integrity audit. This batch is **not yet a certified checkpoint** until official local gates and a new GitHub Heavy UAT pass on the real checkout.
- **Root fixes in this batch:** one canonical 23-route tenant navigation model shared by TenantShell, lab/field shell, and dashboard quick access; user directory returns the exact tenant membership status and fails closed on tenant/membership integrity drift; user edit sends only fields actually changed and renders PENDING/REVOKED truthfully; Technician quarantine now exposes the already-existing manual maintenance open action as well as resolve.
- **Static audit result:** all 23 canonical tenant menu targets exist in the audited source; 72 BFF mutation routes have UI callers by static surface scan; backend census remains 45 controllers / 187 HTTP-or-SSE endpoints; known MACHINE_ONLY/AUTH_UI/LEGACY/QUARANTINE exclusions remain intentional.
- **UAT policy:** no UAT assertion, auth/RBAC/TLS/rate-limit rule, simulated-hardware requirement, or error semantic is weakened. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent evidence label; PHYSICAL/HIL remains optional/non-blocking for software.
- **Snapshot boundary:** this exported audit workspace still lacks the `/super/reports` subtree and repository manifest files, so `rescue:validate` and browser sweep cannot be claimed here. The complete real checkout must run those official gates; missing Chrome in the audit container is not converted into a PASS.
- **Production deployment:** remains **NOT APPROVED** until real target-environment evidence is captured and verified.
## Next action

On the complete `reyvo1/iot-platform` real checkout at `8b2a76b69bb84e12324baee5ca031c7540d3b5d3`, run `git rev-parse HEAD` and `git status --short`, apply the bounded final-surface audit overlay only in an isolated temporary worktree, then run official structural validation, Prisma checks, targeted Jest, real PostgreSQL integration, full `wave3:prepush:check`, and diff review. Only if every local gate is green: one commit/push and a new GitHub Heavy UAT. Any failure is the new **FIRST FAILING GATE** and blocks push; do not weaken UAT.

## Superseded candidate evidence — historical RED at live Organization probe

- GitHub Actions run `37222382814` / commit `99d912da9d36f5354f50198ca036883670c84445` / evidence `logs_100821663855.zip` is the newest candidate and is **NOT GREEN**.
- Core CI, build, Prisma migration, full Jest, database/MQTT/recovery coverage, and both ESP32/ESP32-C3 ESP-IDF/QEMU jobs completed without a failing step in the uploaded bundle.
- FIRST FAILING GATE: `Rescue live EMQX / acceptance` → `Deep product lifecycle live regression`, after `tenant-create-delete-billing-lifecycle... PASS`.
- Root cause is a UAT script contract bug: `apiRequest()` returns `{ status, body }`, but the primary-branch detach assertion read `primaryDetachRejected.response.status`, so `response` was undefined before the mandatory 409 assertion could execute.
- Root fix keeps the backend policy and the negative assertion unchanged: read `primaryDetachRejected.status === 409`, and add dependency-free + Jest guards that forbid the stale `.response.status` access. No UAT/auth/RBAC/TLS/rate-limit/simulated-hardware gate is removed, skipped, downgraded, or made allow-failure.
- The authoritative all-green baseline remains run `37212540616` / commit `2cecb7aa4020ffb6a566949f2e5a44794432d0a7`.


## Current recovery authority — Production Surface Closure V3

- Authoritative all-green baseline: commit `2cecb7aa4020ffb6a566949f2e5a44794432d0a7`, GitHub Actions run `37212540616`, evidence `logs_100795117631.zip`.
- Waves 1–13 remain **SOFTWARE SCOPE CLOSED / GREEN**; this recovery does not reopen them.
- V2 real-checkout local run `iot-production-surface-closure-v2-20261005-013753.log` is **RED** at `full-local-prepush`; it is not a release authority and no commit/push is claimed.
- Package/manifest/origin/structural QA/Prisma/targeted Jest passed before the failure. Targeted Jest result: **30/30 suites, 318/318 tests PASS**.
- Full Jest result: **276/281 suites PASS; 2469/2476 tests PASS**. All 7 failures in 5 suites share one documentation-safety root cause: `docs/production-readiness.md` no longer contained the canonical `Status: NOT READY FOR PRODUCTION DEPLOYMENT` marker.
- V3 restores that canonical fail-closed deployment status and the `Completion review status: LOCAL GATES PASSED` marker without changing any Jest expectation or weakening UAT. The richer repository-software-green checkpoint remains separate metadata.
- Custom Role tenant-composite database FK hardening from V2 remains included and must still pass Prisma/PostgreSQL/full pre-push gates.

## Next action

Apply V3 only to the hash-exact V2 failed tree (or clean authoritative green baseline), rerun early diff/manifest/structural QA, Prisma, targeted Jest, full `wave3:prepush:check`, final diff review, then one commit/push only if every local gate is green. GitHub Heavy UAT for the resulting commit becomes the next candidate authority; production deployment remains separately unapproved pending environment-specific checks.

--- HISTORICAL CONTEXT BELOW ---

# Project Handoff — post-green deep product hardening



## Latest candidate UAT — RED at additive deep-product live regression

- GitHub run `37209964468` / commit `7009e18803c82b67906f0d1d66ab626465cb7cd9` / evidence `logs_100788241456.zip` is the newest candidate evidence and is **NOT GREEN**.
- Core CI is healthy: **281/281 Jest suites and 2443/2443 tests PASS**; application E2E, PostgreSQL integration, MQTT integration, coverage, build/release checks and both Wave-3 ESP-IDF/QEMU jobs passed.
- FIRST FAILING GATE: `rescue-live-emqx` → `Deep product lifecycle live regression` → `POST /automations` returned HTTP 400 `Automation trigger capability must be reportable`.
- Root cause is the new live UAT fixture, not a reason to weaken backend policy: `capability-apply-full-shape` intentionally converges the shared `power` capability to `isReportable=false`, then the same mutated `power` capability was reused as the Automation trigger. The backend correctly rejected that invalid trigger.
- Root fix keeps the negative domain rule and makes UAT stronger: a dedicated `signal` capability remains `isReportable=true` for the valid Automation path, while an explicit live negative probe first requires the mutated non-reportable `power` trigger to fail with HTTP 400 and a reportable-capability error.
- No existing UAT/auth/RBAC/TLS/rate-limit/simulated-hardware gate is removed, skipped, downgraded, or made allow-failure.
- Last authoritative all-green baseline remains run `37195822587` / commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / evidence `logs_100750579910.zip`.
- `SIMULATED_HARDWARE_LIVE_SERVICE` remains the mandatory automated hardware-equivalent label; PHYSICAL/HIL remains optional/non-blocking for software.

## Current root-fix batch — isolate cross-feature UAT fixtures without weakening policy

1. `scripts/run-rescue-runtime-flow-extension.mjs` creates a dedicated reportable `signal` capability after the full-shape `power` apply.
2. The live UAT explicitly attempts an Automation with the now non-reportable `power` trigger and requires **HTTP 400** plus the reportable-capability error semantics.
3. Only after that negative guard passes does the valid Automation use `signal` as its trigger; the action still commands Device B through writable `power`, preserving the no-self-trigger-source domain rule.
4. `scripts/self-test-deep-product-contracts.mjs` and `test/deep-product-integrity.contract.spec.ts` now lock both halves of this contract so a future change cannot simply remove the negative check to obtain green.
5. Validation in the exported workspace: Node syntax checks PASS; `deep-product:contracts:self-test` PASS; `wave2:prisma:self-test`, `rescue:github-ci:self-test`, enterprise wave-status self-test/verify, `wave1:prepush:self-test`, and `rescue:validate` **PASS 501/501**. Dependency-backed local Jest/live runtime after this fixture correction is not claimed in the export; the real-checkout V6 runner must execute targeted Jest + full `wave3:prepush:check` before commit/push.

## Next action

Apply the V6 root-fix only on clean `main@7009e18803c82b67906f0d1d66ab626465cb7cd9` for `reyvo1/iot-platform`. Run early diff/manifest hygiene, structural guards, Prisma checks, targeted Jest and the full strengthened local pre-push. Commit/push exactly once only if every local gate is green, then treat the next GitHub Heavy UAT as authoritative. If the live negative non-reportable probe or valid reportable Automation path fails, stop and repair the product/UAT cause; do not weaken the rule.

## Current candidate UAT — RED; root-cause repair in progress

- GitHub run `37206734123` / commit `dd253ef6a67e77469934278b55806819fd292701` / evidence `logs_100779580158.zip` is the newest candidate evidence and is **NOT GREEN**.
- FIRST FAILING GATE: `test` → Full Jest. Result: **4 failed / 277 passed suites; 7 failed / 2436 passed tests**.
- The failing classes are precise: two new deep-product contract specs were missing from `test/contract-surface-policy.json`; two legacy Module-10 assertions still required the obsolete `401 || 403 => logout` semantics; and `tenant-creation-meters.contract.spec.ts` mocked Prisma without `$transaction` after tenant creation became atomic.
- This is not a reason to weaken UAT. The repair classifies the new contracts, changes the stale auth assertions to explicitly require **401 clears / 403 preserves session**, makes the tenant unit mock transaction-aware, adds all four exposed suites to `wave2:test:targeted`, and strengthens `wave3:prepush:check` to run **full Jest serially** before the ESP32 self-test.
- GitHub steps before Full Jest passed, including lint, Prisma validation/migrations, backend build, web type-check/build, and dependency/security gates. Both Wave-3 ESP-IDF/QEMU matrix jobs also booted successfully. The heavy downstream live chain is not claimed because the core `test` job is red.
- Last authoritative all-green baseline remains run `37195822587` / commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / evidence `logs_100750579910.zip`.
- `SIMULATED_HARDWARE_LIVE_SERVICE` remains the mandatory automated hardware-equivalent label; PHYSICAL/HIL stays separate and non-blocking for software.


Waves 1–13 are **SOFTWARE SCOPE CLOSED / GREEN** for automated, source-bound software certification. GitHub Actions run `37195822587` on commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` completed the full automated acceptance chain. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent evidence class; PHYSICAL/HIL and provider-owned external observations remain separate and non-blocking for software closure.

- GitHub run `37195822587` / commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / evidence `logs_100750579910.zip`.
- FIRST FAILING GATE: **none — full automated acceptance is green**.
- Current candidate purpose: deep audit backend↔frontend↔menu↔RBAC↔error semantics↔workflow/docs/Development Kit after the green certification baseline.
- Do not reopen closed Wave 1–13 software gates without newer failing evidence.
- Do not weaken UAT, rate limits, auth, TLS, simulated-hardware evidence or external/provider boundaries to make a test pass.
- `SIMULATED_HARDWARE_LIVE_SERVICE` closes software-controlled hardware-equivalent behavior; physical/site HIL remains separately labelled and non-blocking.

## Current repair batch — Admin BFF session/error semantics

1. `AdminSessionBackendClient` refresh rotation is now finalized through one response helper: a final 401 clears cookies, while successful/403 responses preserve the session and persist rotated access/refresh tokens.
2. Shared `proxyBackend` uses that helper, so its 76 route consumers inherit the corrected session lifecycle.
3. Remaining direct Admin BFF routes no longer collapse 403 into 401/logout; Scene Run now preserves a valid forbidden session.
4. Device capability and telemetry-chart routes no longer translate upstream auth/infrastructure failures into `200` empty states.
5. Tenant command aggregation hides only expected per-device 403/404 visibility races and propagates unexpected/infrastructure failures.
6. Current authority is the exact green checkpoint `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / run `37195822587` / `logs_100750579910.zip`; Waves 1–13 remain closed and are not being reopened.

## Current repair batch — deep product integrity root-cause closure

This batch builds on the Admin BFF session/error-semantics repair and does not reopen Waves 1–13.

1. **Tenant ↔ Billing lifecycle:** tenant creation and mandatory FREE subscription now share one Prisma transaction; deleting an otherwise-empty tenant removes the system-owned subscription in the same transaction, while any other `RESTRICT` dependency remains fail-closed and surfaces as `409 Conflict`.
2. **Capability lifecycle:** apply now converges the complete published shape (`schemaVersion`, semantic/data type, unit, constraints, readable/writable/reportable flags). The drift scan paginates deterministically so later drift cannot remain hidden behind already-aligned rows.
3. **Scene ↔ Schedule integrity:** Prisma now models the tenant-scoped Scene relation and migration `20261004213000_schedule_scene_referential_integrity` adds a composite `ON DELETE RESTRICT` FK. Migration aborts on legacy orphan schedule rows instead of deleting or rewriting operator data. Scene delete also returns a domain `409` and records DELETE audit only after the delete succeeds.
4. **Scene UI contract:** action count is derived from backend `actions[]`; create+enable reports partial failure honestly instead of claiming an inactive Scene is active.
5. **UAT strengthened, not weakened:** `wave2:test:targeted` now also runs Scene persistence + deep-product integrity contracts. GitHub heavy CI gains `Deep product lifecycle live regression`, which exercises tenant create/delete with billing, complete capability-shape apply, and scheduled-Scene delete refusal against the live stack. Existing Wave 4–13, simulated-hardware, EMQX, TLS, security, load and full-acceptance gates remain unchanged.
6. Physical HIL remains optional/non-blocking for software. Automated hardware evidence keeps the exact `SIMULATED_HARDWARE_LIVE_SERVICE` label.

### Validation in exported snapshot

- TypeScript/TSX syntax diagnostics for every changed source/spec: PASS via TypeScript `transpileModule`.
- `node --check scripts/run-rescue-runtime-flow-extension.mjs`: PASS.
- `deep-product:contracts:self-test`: PASS with the new integrity checks.
- `session:handoff:self-test`: PASS before the final documentation reseal.
- `rescue:validate`: reached the repository hygiene gate and failed only because local `tsc --noEmit` created `dist/tsconfig.tsbuildinfo`; that generated `dist/` was removed. No product assertion failed before that hygiene stop.
- Dependency-backed Jest, Prisma validation/migration execution, full `wave3:prepush:check`, Git diff review, commit/push and GitHub heavy UAT are **not claimed** in this exported no-`.git`/no-`node_modules` workspace. They remain mandatory in the real checkout.


## Candidate repair validation before handoff

- `deep-product:contracts:self-test`: **PASS** with explicit checks for contract classification, 401/403 semantics, transaction-aware tenant test, targeted coverage, and full-Jest pre-push parity.
- `session:handoff:self-test`: **PASS**; all current continuation files agree on failed candidate run `37206734123` / commit `dd253ef6a67e77469934278b55806819fd292701` while retaining the last all-green baseline.
- `rescue:validate`: **PASS 501/501**.
- Baseline manifest after the repair: **1389/1389 source paths; 1390/1390 hash entries**.
- `wave2:prisma:self-test`, `rescue:github-ci:self-test`, enterprise wave-status self-test/verify, and `wave1:prepush:self-test`: **PASS**.
- Changed TypeScript test files pass TypeScript `transpileModule` syntax diagnostics; changed Node/JSON files parse successfully.
- A local `npm ci` attempt in this exported tool workspace did not finish, so dependency-backed Jest/full pre-push is **not claimed here**. The real checkout runner must execute expanded targeted Jest and the strengthened full `wave3:prepush:check`; any failure blocks commit/push.

## Local V4 rerun evidence — 2026-10-04

- Real-checkout V4 reached **281/281 Jest suites and 2443/2443 tests PASS**, then completed the Wave 3 ESP32 self-test PASS.
- The only failing gate was the mandatory post-gate `git diff --check`: `PROJECT-HANDOFF.md:68: new blank line at EOF`. No application/UAT assertion failed in that rerun.
- V5 fixes the exported handoff whitespace defect, reseals the baseline manifest, and moves an additional `git diff --check` **before** dependency-backed/heavy QA while retaining the existing post-gate check. No UAT, auth, database, TLS, rate-limit, simulated-hardware, or acceptance assertion is relaxed.

## Next action

Run the V5 recovery only on `main` at `dd253ef6a67e77469934278b55806819fd292701`; it accepts either the clean candidate or the exact fail-closed V4-applied working tree. It validates package hashes and the existing V4 diff, fixes the EOF defect, runs an early `git diff --check`, then dependency-free self-tests, Prisma checks, expanded targeted Jest and the strengthened full `wave3:prepush:check`. A second diff check must pass before one commit/push and a new GitHub heavy UAT run. Any failure still blocks commit/push; repair the cause rather than relaxing UAT.
