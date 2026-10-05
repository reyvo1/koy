# Project Handoff — Production Surface Closure Recovery

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->
## Latest candidate evidence — RED at live Organization probe

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
