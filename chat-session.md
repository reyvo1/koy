# Chat Session — Enterprise Wave 2 Core Runtime Closure

## Wave 2 progress — 2026-09-15

## Wave 2 applicator sealing correction — 2026-09-15

The first operator-side Wave 2 apply reached the post-overlay seal with the correct 1029/1030 counts but failed `repository-tree.txt` equality with `missing=none; stale=none`. Root cause is sealing infrastructure, not Wave 2 runtime: `manage-baseline-manifest.mjs` used host-default `localeCompare()`, so identical path sets could be ordered differently across environments/locales. Permanent correction: sealed-source ordering now uses deterministic code-point comparison; the baseline-manifest self-test includes a mixed-case ordering regression; the recovery applicator accepts the exact failed Wave 2 overlay safely, applies the deterministic sealer, verifies the full authoritative source, then runs the canonical Wave 2 pre-push gate. No runtime/business/schema semantics are relaxed. No GitHub push has occurred.

Wave 1 V13 is confirmed fully green by the owner and is frozen as the software/CI baseline. The project execution model is now Wave 1–13 (`docs/ENTERPRISE-WAVE-ROADMAP.md`), with one complete large wave before one GitHub push.

Wave 2 implementation completed in the working batch so far:

- Automation: added opt-in delayed retry worker, bounded persisted candidate scan, claim-time retry allowlist validation, PARTIALLY_FAILED recovery, restoration of deterministic later skips, atomic rollback on execution/action claim races, and explicit `CommandService.retryPublish()` that re-arms and republishes the same FAILED/TIMED_OUT command/correlation identity.
- Scheduler: added fail-closed runtime policy and strict activation guard; enable is rejected when runtime is off, disable remains allowed.
- Notification: added durable `DELIVERING` lease state/migration, bounded multi-instance-safe delivery worker, stale lease recovery, database-clock retry, stale lease rejection, explicit transient-only retry policy, semantic idempotency collision detection/P2002 race recovery, webhook idempotency headers, auth verification/reset EMAIL enqueue, and provider-neutral HTTPS email relay with stable downstream idempotency headers.
- Config: Notification runtime defaults off and requires HTTPS relay URL/token/from only when enabled; relay token is production-secret validated.
- Docs: master Wave 1–13 roadmap plus Wave 2 contract and historical module supersession notes are synchronized.

## Local QA status

- `node scripts/self-test-wave2-core-runtime.mjs` = PASS.
- `node scripts/self-test-rescue-github-ci.mjs` = PASS with explicit Wave 2 guard assertions in both GitHub jobs.
- `node scripts/self-test-wave1-prepush.mjs` = PASS; inherited Wave 1 gate contract remains intact.
- `node scripts/self-test-rescue-live-broker-smoke.mjs` = PASS; Wave 1 MQTT/dashboard smoke regression guard remains intact.
- GitHub Actions YAML parse = PASS.
- `package.json` parse = PASS.
- TypeScript source syntax/transpile = PASS for all 26 changed/new `.ts` files.
- Authoritative sealed source = 1027 paths / 1028 manifest entries: V13's 1016-path baseline plus 13 Wave 2 source paths minus the two framework-generated `apps/*/next-env.d.ts` files, while preserving the four authoritative files present in GitHub/operator repo but absent from the chat snapshot.
- Dependency bootstrap in this chat container is unavailable/incomplete (`npm ci` network timeout; offline cache lacks packages), so dependency-resolved Jest and Prisma validate/generate cannot honestly be claimed here.
- The operator-side apply script MUST run `npm run wave2:prepush:check` against the real repo with dependencies installed before commit/push.
- No Docker/PostgreSQL/Redis/EMQX/full acceptance is run locally; GitHub remains authoritative.

## Ready state

Implementation, source-level QA and authoritative manifest/tree sealing are complete. Do not push until the packaged apply script completes the canonical Wave 2 lightweight gate on the operator repository. If GitHub is red after the single Wave 2 push, remain in Wave 2 and batch the first failure plus all same-class failures.

## Next steps

1. Produce and integrity-seal one `WAVE2-CORE-RUNTIME-CLOSURE-20260915.zip` with preflight/apply instructions.
2. Apply it to the clean complete V13 owner repository.
3. Require `npm run wave2:prepush:check` to PASS inside the apply flow.
4. One commit + one push only after that lightweight gate is green.
5. Analyze GitHub heavy acceptance; close Wave 2 only when all authoritative jobs are green.

---

# Chat Session — Wave 1 V13 Dashboard Fixture Contract Hardening

## Progress
- Analyzed GitHub log `logs_94594644195.zip` without reopening older diagnosis.
- Confirmed core `test` remains GREEN: 180/180 suites, 1187/1187 tests.
- Confirmed V12 MQTT class is fixed in real EMQX: `publisher-non-command-operations-denied` PASSes and the smoke advances through telemetry webhook idempotency.
- Identified the first new blocker at `POST /dashboards`: live smoke used `GAUGE` with the existing boolean `power` capability, so the production resolver correctly returned `DASHBOARD_WIDGET_RESOLUTION_INVALID`.
- Fixed the whole live-dashboard fixture semantic-contract class: boolean power evidence uses `CARD` + `READ` + `LATEST`, and self-tests lock that relationship.
- GitHub CI self-test now requires the dashboard semantic regression guard.

## Test status
- `node --check scripts/run-rescue-live-broker-smoke.mjs`: PASS.
- `node --check scripts/self-test-rescue-live-broker-smoke.mjs`: PASS.
- `node --check scripts/self-test-rescue-github-ci.mjs`: PASS.
- `node scripts/self-test-rescue-live-broker-smoke.mjs`: PASS.
- `node scripts/self-test-rescue-github-ci.mjs`: PASS.
- Negative regression mutation (`CARD` -> `GAUGE` for the boolean power fixture): correctly rejected, PASS.
- Docker/build/DB/Redis/real EMQX/full acceptance intentionally not run locally.

## Ready state
V13 is CI/acceptance-fixture hardening only. Application dashboard validation remains fail-closed and unchanged. V12 MQTT one-shot denial evidence remains intact. Rescue endpoint is still `mqtt://127.0.0.1:18884`; do not reopen the foreign Windows broker on `1883`.

## Next steps
1. Apply V13 to the clean complete V12 Git working tree.
2. Run only the package-provided lightweight pre-push gate locally.
3. Make one commit and one GitHub push.
4. Let GitHub run heavy Docker/build/DB/Redis/EMQX/full acceptance.
5. If red, analyze the first failure plus all related failures in its class before another batch.
6. Production remains NOT APPROVED until physical ESP32/Wi-Fi reconnect/physical MQTT/OTA evidence is complete.

## Source snapshot boundary
The source snapshot available in this chat still omits four files that the authoritative GitHub checkout proves are present in the sealed baseline. V13 therefore preserves the authoritative V12 1016-path repository tree and updates only hashes for files actually changed by V13. The apply script refuses an incomplete target repository before copying anything.

---

# Chat Session — RR30 GitHub CI Restoration

## Progress
- Restored the project’s original GitHub-hosted heavy-test strategy instead of repeating Docker/Podman builds on the Windows/WSL host.
- Preserved the existing `.github/workflows/ci.yml` core job.
- Added `rescue-live-emqx` GitHub job using Ubuntu + Docker Compose.
- Added source-controlled `scripts/run-rescue-live-broker-smoke.mjs`, derived from the previously proven Phase-A live runner, with CI mode that does not mutate evidence files.
- Real broker smoke covers valid/wrong device auth, publisher ACL, device telemetry/ACK/command subscription, cross-device denial, telemetry idempotency, ACK binding/replay, wrong webhook secret, and revoked-device denial.
- Added `rescue:github-ci:self-test` and CI guardrails.

## Test status
- Node syntax check for new broker smoke: PASS.
- GitHub CI static self-test: pending final seal run.
- Rescue validator / manifest: pending final seal run.
- Real GitHub-hosted Docker execution cannot be performed inside this artifact workspace; authoritative live proof is the first GitHub Actions run after pushing RR30.

## Ready state
- Source changes are CI/tooling/docs only; no application business logic, Prisma schema, MQTT auth backend, Web/Mobile code, or physical-device contract is intentionally changed.

## Next steps
1. Push/overlay RR30 into the GitHub repository.
2. Run CI manually with `workflow_dispatch` or by push/PR.
3. Inspect the existing core `test` job first; this reproduces DB integration on fresh GitHub PostgreSQL.
4. If core CI passes, `rescue-live-emqx` runs automatically with real EMQX.
5. Do not run local full acceptance unless GitHub-specific failure requires local reproduction.
6. After GitHub full acceptance passes, initialize a new source-bound evidence file; physical ESP32 remains separate.

## GitHub Base #1 first-run root cause — permanent Wave 1 remediation

The first GitHub-hosted core job stopped at `security:audit:production` because the old `@fastify/middie` critical finding acceptance expired. This is not a PostgreSQL, Redis, EMQX, Docker, or application-runtime failure. Wave 1 does not extend the expired exception. The permanent remediation upgrades the NestJS/Fastify boundary to NestJS 11.2.3 / Fastify 5.10.0, retires the accepted critical finding, adds a lockfile guard that rejects `@fastify/middie` below 9.3.3, and runs that guard before `npm audit` in GitHub CI.

The dependency lock must be regenerated by `npm install` when this in-wave migration is applied. After that, local backend build/contracts and GitHub heavy CI are authoritative. This remains Wave 1 and is not a new RR checkpoint.

## Wave 1 GitHub CI continuation — Next.js critical remediation
- NestJS/Fastify permanent upgrade completed dependency installation successfully on Node 22.23.2 / npm 10.9.8.
- Production security audit then exposed the next critical blocker: `next`.
- Both web workspaces were still pinned to Next.js 16.2.10.
- Next.js security release requires 16.3.3+ for the August 2026 critical advisories.
- Wave 1 now pins both web workspaces to Next.js 16.3.5 and adds a fail-closed lockfile verifier.
- No security exception is added.
- After apply: run production audit, backend build, web validation, contracts, manifest, Rescue validator, and GitHub CI self-test before push.

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

## WAVE 1 LARGE-BATCH CI HARDENING V12 — NEGATIVE ACL ONE-SHOT EVIDENCE

### GitHub result analyzed
GitHub run `logs_94531471162.zip` kept the core `test` job green and advanced `rescue-live-emqx` through real EMQX 5.9.2. The live broker smoke passed runtime login/tenant/device setup, valid device auth, wrong-secret denial, device command subscription, and publisher command publish/device receipt. It then failed at `liveBroker.publisher-non-command-denied` with `MQTT publish .../telemetry timed out after 8000ms`.

### Root cause class
V11 correctly bounded callbacks, but the negative ACL sequence still reused a client after a denied operation. The rescue broker intentionally uses `authorization.deny_action=disconnect`; therefore a denied subscribe can terminate that MQTT connection. The following QoS-1 publish on the same disconnected client can remain queued without a PUBACK callback and hit the harness timeout. That timeout is not valid ACL-denial evidence.

### Permanent large-batch remediation
- negative ACL assertions now use fresh one-shot MQTT connections;
- publisher non-command subscribe and publish each use separate fresh publisher clients;
- cross-device command subscribe and telemetry publish each use separate fresh source-device clients;
- wrong-device ACK uses a fresh target-device client;
- positive `deviceAClient` / `publisherClient` are never sacrificed to disconnect-on-deny tests;
- negative subscribe evidence requires explicit SUBACK denial, explicit authorization error, or MQTT v5 `DISCONNECT` reason `0x87`;
- negative publish evidence requires explicit PUBACK denial, explicit authorization error, or MQTT v5 `DISCONNECT` reason `0x87`;
- close-only, unrelated errors, and timeout remain fail-closed and cannot become PASS;
- negative publish checks also require the forbidden side effect to remain absent (no telemetry persistence / no wrong-device ACK state transition);
- synthetic tests cover allowed callback, denied SUBACK/PUBACK, `DISCONNECT 0x87`, explicit authorization error, close-only ambiguity, and true callback hang.

### Local test status
- `node --check scripts/lib/rescue-mqtt-operations.mjs`: PASS.
- `node scripts/self-test-rescue-mqtt-operations.mjs`: PASS.
- `node scripts/self-test-rescue-live-broker-smoke.mjs`: PASS.
- `node scripts/self-test-rescue-github-ci.mjs`: PASS.
- Docker/build/DB/Redis/real EMQX/full acceptance were intentionally not run locally.

### Ready state / next step
Apply V12 as one Wave 1 batch, run the existing lightweight pre-push gate, commit once, and push once. GitHub remains authoritative for Docker/DB/Redis/real EMQX/full acceptance. Do not reopen the old host-port `1883` diagnosis; canonical rescue MQTT remains `127.0.0.1:18884`. Production remains NOT APPROVED until physical ESP32/Wi-Fi reconnect/MQTT/OTA evidence is complete.

### Session source-snapshot boundary
The V11 source snapshot carried into this chat omits four files that the authoritative GitHub checkout already proved present in the sealed `1016/1016` source set: the two Super Admin report routes and the two MQTT TLS test fixtures. Therefore this session does not regenerate the source tree from the incomplete snapshot. V12 preserves the V11 `repository-tree.txt` (1016 paths), reseals only files changed by V12 in the 1017-entry manifest, and its apply preflight refuses an incomplete target repository before copying payload files.
## Wave 2 operator recovery V3 — generated Next.js artifact sealing

The second operator-side recovery passed deterministic ordering regression, then failed manifest verification at `apps/admin-web/next-env.d.ts`: the path set and ordering were correct, but the local generated Next.js declaration content differed from the chat snapshot seal. This is a sealing-classification defect, not a Wave 2 runtime defect. Next.js regenerates `next-env.d.ts` during `next dev`, `next build`, and `next typegen`; therefore it is not an authoritative source input. The permanent V3 correction excludes `next-env.d.ts` at any source depth while continuing to seal ordinary authored `.d.ts` files. A regression test mutates generated `next-env.d.ts` and requires verification to remain green, while an authored declaration remains in `repository-tree.txt`. The authoritative Wave 2 seal is therefore 1027 source paths / 1028 manifest entries. No GitHub push has occurred.



## Wave 2 recovery V4 — evidence-first correction

Operator V3 recovery successfully produced the deterministic 1027/1028 seal and entered the real `wave2:prepush:check`. It failed inside `rescue:validate` on the check named `baseline manifest ignores generated TypeScript incremental build metadata...`. Root cause: the validator asserted the old literal source string `const excludedFilePatterns = [/\.tsbuildinfo$/i]`; after V3 correctly added `next-env.d.ts` to the same exclusion array, behavior was correct but the brittle source-string assertion became false. This is a validator regression, not an application-runtime defect.

V4 permanent correction:
- validator checks the required `.tsbuildinfo` and `next-env.d.ts` patterns semantically instead of requiring the old exact array literal;
- baseline self-test now actually mutates `.tsbuildinfo` after sealing and requires verify to stay green;
- ordinary authored source drift remains rejected;
- `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md` defines STATIC/CONTRACT, UNIT, INTEGRATION, LIVE-SERVICE, PHYSICAL/EXTERNAL and PRODUCTION CERTIFICATION tiers;
- PostgreSQL integration now proves automation retry claims and republishes the same failed command identity;
- Notification integration uses two Prisma clients plus a real local HTTPS receiver to prove one lease, terminal HTTP 400, and persisted 503 backoff/reclaim/success;
- the existing GitHub database integration step automatically executes these new `test/integration/*.integration-spec.ts` files, while the rescue job continues real EMQX evidence.

No GitHub push has occurred. Wave 2 remains ACTIVE until the operator V4 lightweight gate passes and the single GitHub Wave 2 push is fully green.

### V4 package QA
- dependency-free baseline-manifest regression: PASS;
- Wave 2 core runtime invariant self-test: PASS;
- GitHub CI self-test: PASS;
- TypeScript syntax/transpile for changed/new integration specs: PASS;
- synthetic V3 recovery applicator: PASS through exact-state preflight, 16-file overlay, 1031/1032 target-generated seal, verify, synthetic gate invocation, and final verify;
- real Prisma/Jest/PostgreSQL/HTTPS/EMQX/full acceptance is intentionally not claimed in the chat container; operator/GitHub gates remain authoritative.


---

## Wave 2 recovery V5 — Prisma local env boundary

Operator V4 output proved the entire inherited Wave 1 lightweight chain through `RESCUE VALIDATION PASS (281/281)`, MQTT ACL observation/live-smoke self-tests, GitHub CI self-test and Wave 2 source invariants. It then failed at `prisma validate` with P1012 `Environment variable not found: DATABASE_URL`. No Prisma schema error occurred.

V5 fixes the tooling class, not application runtime: `wave2:prisma:check` now calls `scripts/check-prisma-schema.mjs`, which preserves a supplied `DATABASE_URL` or uses a deterministic schema-only loopback port-1 fallback for validate/generate. `scripts/self-test-wave2-prisma-schema-check.mjs` proves fallback selection, explicit URL preservation, blank handling and exact validate→generate ordering with a fake CLI. The evidence policy explicitly states this is STATIC/CONTRACT only. GitHub PostgreSQL 16 + migrations + isolated integration tests remain required before Wave 2 can close. V5 target seal is 1033/1034. No push yet.


### V5 package QA
- Prisma schema-wrapper dependency-free self-test: PASS (fallback, explicit URL preservation, blank handling, validate→generate ordering).
- Wave 2 core runtime invariant self-test: PASS.
- baseline manifest regression: PASS.
- GitHub CI contract self-test: PASS.
- V5 applicator synthetic recovery: PASS from a sealed 1031/1032 V4 structural state through 12-file overlay, 1033/1034 regenerated seal, synthetic lightweight-gate invocation, and final verify.
- Real operator Prisma/Jest and GitHub PostgreSQL/HTTPS/Redis/EMQX/full acceptance remain pending and must not be inferred from the synthetic applicator test.

---

## Wave 2 V6 — operator V5 targeted-test result

Operator V5 successfully passed source seal 1033/1034, inherited Wave 1 lightweight checks, `RESCUE VALIDATION PASS (281/281)`, broker smoke self-test, GitHub CI self-test, Wave 2 source invariant test, Prisma wrapper self-test, and real `prisma validate` + `prisma generate`. Targeted Jest then executed far enough to prove 8/12 suites and 88 tests PASS. Four suites were blocked at TypeScript compile by two coherent contract defects:
1. `CommandMetricEvent` lacked `retry_replay`, `retry_raced`, `retry_claimed` while `CommandService.retryPublish` already emits them.
2. `NotificationService.claimDueBatch` inferred default `claimTimeoutMs` as literal `60000`, rejecting a runtime `number` from `ConfigService`.

V6 fixes the whole class: extend the metric union, explicitly type delivery batch/claim parameters as `number`, add retry metric assertions to `metrics.service.spec.ts`, include that spec in `wave2:test:targeted`, and add source invariants so the drift cannot recur. This is not a relaxation of tests or runtime policy. Seal path count remains 1033/1034 because V6 only modifies existing sealed files. No push yet.

### V6 package QA
- dependency-free Wave 2 invariant: PASS
- baseline-manifest regression: PASS
- GitHub CI contract self-test: PASS
- Prisma wrapper self-test: PASS
- retry metric union compile contract: PASS
- changed TS syntax/transpile: PASS
- applicator synthetic V5 recovery: PASS (`1033/1034` -> overlay 11 files -> `1033/1034` -> synthetic gate invocation -> final verify)
- operator targeted Jest is NOT yet claimed; GitHub heavy/live evidence is NOT yet claimed

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



## 2026-09-15 — Wave 2 V9 root-cause pass
- User explicitly rejected symptom-by-symptom patching; workflow corrected to root-cause cluster repair.
- GitHub V8 evidence: 185/185 unit suites, 1219 tests, E2E 4/4, DB integration 14/15 suites; remaining Notification test failures were all `WEBHOOK_UNREACHABLE`.
- Root architectural defect: Webhook and Email Relay each used global `fetch`; integration depended on process-global TLS bypass; error mapping flattened TLS/socket causes.
- Implemented shared framework-neutral `NotificationHttpsClient` using `node:https`, strict TLS verification, scoped fixture CA for tests, absolute deadline, and TIMEOUT/TLS/NETWORK classification with preserved `causeCode`.
- Both Webhook and Email Relay now use the same client. TLS trust failures map to terminal `*_TLS_INVALID`; timeout/network retain retry semantics.
- Integration test now proves Webhook + Email through the shared real HTTPS client and forbids `NODE_TLS_REJECT_UNAUTHORIZED`.
- Local targeted suite now includes `notification-https.client.spec.ts` (14 suites total).
- Real container QA of the shared client: trusted fixture CA PASS; untrusted cert classified TLS/DEPTH_ZERO_SELF_SIGNED_CERT; timeout ETIMEDOUT; connect failure NETWORK/ECONNREFUSED.
- Wave 2 remains ACTIVE. No Wave 3 work and no production approval.

### V9 QA certification before handoff
- Dependency-free Wave 2, baseline-manifest, GitHub-CI and Prisma-wrapper self-tests: PASS.
- TypeScript transpile of all V9 changed runtime/tests: PASS.
- Real shared HTTPS client execution: trusted fixture CA -> 204 PASS; untrusted self-signed cert -> TLS/DEPTH_ZERO_SELF_SIGNED_CERT PASS; absolute timeout -> TIMEOUT/ETIMEDOUT PASS; refused socket -> NETWORK/ECONNREFUSED PASS.
- Full authoritative reconstructed source seal: 1035/1036 PASS.
- Synthetic clean V8 1033/1034 -> V9 18-file overlay -> 1035/1036 -> gate invocation -> final verify: PASS.
- Heavy PostgreSQL/Notification/EMQX/full acceptance remains GitHub evidence and is not claimed locally.
