# PRODUCTION OPERATIONS HARDENING CHECKPOINT — 2026-10-15

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->

- **Verified committed baseline (unchanged):** the 2026-10-08 SDK-repair candidate is commit `3b80897bb154f6fb80ea375a9e39b698e9c87159` (native-Node SDK root repair on top of implementation `68454f460d9eeee8a9750ec03daafa6570c5d5a6`), itself verified on the 2026-10-08 committed baseline commit `4907ea5822e07188394ebee3c72e860e79a793cc` / GitHub Actions run `37449896281`; branch `main`, origin `reyvo1/iot-platform`. Exact-source GitHub Actions run `37712838417` passed core CI (291 suites / 2585 tests), PostgreSQL integration (16 suites / 72 tests), browser controls/decoded synthetic media and both real ESP-IDF/QEMU targets. The local changes described below are NOT covered by that run.
- **Session resume:** the previous working session lost its context (opencode database reset). Resume evidence was reconstructed from the workspace itself: an interrupted production-operations batch whose files were written but never finished — the monitoring stack (`ops/monitoring/`), `ops/scripts/backup-offhost.sh`, the off-host backup systemd unit/timer, `ops/logrotate/` and `infra/terraform/` — plus three product-surface contracts that existed but were not classified, one of them syntactically broken. No historical status was re-derived from scratch and no wave/module was reopened.
- **Completed batch (source-bound, no runtime claims):** authored the two referenced-but-missing operator documents (`ops/monitoring/README.md`, `infra/README.md`) and `infra/terraform/terraform.tfvars.example`; repaired the `*/` doc-comment defect in `test/admin-web-navigation-parity.contract.spec.ts` (a `**/page.tsx` path closed the block comment early and the suite did not compile); repaired `infra/terraform/main.tf`, where the guarded firewall command referenced an undefined `$MQTT_PORT_FOR_OUTPUT` and would have died on `set -u` instead of printing the intended ruleset (it now passes `MQTT_PORT`); closed an operator-secret gap by gitignoring `infra/terraform/terraform.tfvars` and `infra/terraform/rendered/`, because the rendered plan embeds real hostnames/CIDRs/keys; classified all four exposed contracts (`stable-contract`) in `test/contract-surface-policy.json` and added them to `wave2:test:targeted` and the product-surface self-test; added `test/ops-production-observability.contract.spec.ts` locking the new operational artifacts from source; documented the off-host chain, observability stack, log retention and infrastructure skeleton in `docs/deployment-recovery.md` with honest non-goals added. No UAT, auth/RBAC/TLS/rate-limit, simulated-hardware, migration or error-semantics assertion was weakened, skipped or made allow-failure.
- **Backend↔frontend sync audit (independent re-count, not a re-run of the repo's own self-tests):** controllers **46** and HTTP/SSE endpoints **197** re-counted from source, matching the census exactly, with every controller present in `docs/BACKEND-FRONTEND-SURFACE-CENSUS.md`. Surface mapping verified by hand: admin-web **127** BFF routes and user-web **12** BFF routes; every static `/api` reference from a surface resolves to a real `route.ts` (the parity spec plus a manual trace of the 6 apparent exceptions — `${base}/${id}` variable construction, an optional catch-all, and the design-system `CameraPlayer` mounted by the CCTV page and the User Web device detail). Web camera playback, GPS/maps, maintenance, integration and user-directory flows were traced end-to-end (UI → BFF → controller → guard). Exactly three endpoints have no UI caller: `GET /users/tenant-context` and `POST /camera-network/discover` were already documented as intentional backend-only/quarantine support, and `GET /organizations/:id/branches` was undocumented — it is now classified in the census (both governed surfaces already read branches inline from `GET /organizations` and `GET /organizations/current`) and locked by `test/backend-frontend-surface-census.contract.spec.ts`. No endpoint was removed and no menu was invented.
- **Mobile / SDK / route-map slice (2026-10-15):** the authenticated mobile shell carries exactly five navigable tabs (home, devices, realtime, alerts, profile) with device detail, routine, notification and settings as sub-surfaces — matching the census claim. `packages/sdk` exposes exactly three consumer methods and they map one-to-one onto the three backend `GET /v1/*` public-API endpoints (`/v1/devices`, `/v1/telemetry`, `/v1/findings`); no SDK call references a non-existent route and no `/v1/*` endpoint lacks an SDK method. The UI route map was found to omit the five Admin Web pre-session routes (`/login`, `/daftar`, `/lupa-password`, `/reset-password`, `/verifikasi`) that `validate-rescue-baseline.mjs` classifies as `PRE_LOGIN_ROUTES`; that is a documentation gap, not a missing menu, and it is now documented in an AUTH_UI section naming the validator classification, locked by `scripts/self-test-deep-product-contracts.mjs`. Dynamic leaves (`/tenant/perangkat/[deviceId]`, `/perangkat-saya/[deviceId]`) were re-verified as documented.
- **Pushed receipt (2026-10-15):** batch committed as `22e0e628534e349c85b6ff1859db2dc34a2682ec` on `main` and pushed to verified `origin/main` without force (`2f6919a..22e0e62`). GitHub Actions run `38788329299` for that exact source did not execute a single step: all three jobs failed at external runner allocation with the annotation that recent account payments have failed or the spending limit must be increased, and `Rescue live EMAX / acceptance` was skipped. This is the same owner-owned billing gate recorded for run `37712838417`, not an observed software failure — the local gates above all passed on the same source. Production deployment remains NOT APPROVED.
- **FIRST FAILING GATE:** unchanged and owner-owned: run `37712838417` → `Rescue live EMQX / acceptance` → external GitHub runner allocation, with zero steps executed and the annotation that recent account payments failed or the spending limit must be increased. It is not a physical-hardware blocker and not an observed software failure. This session did not weaken, skip or relabel it and did not push anything. Production deployment remains NOT APPROVED; connection configuration and maintenance-worker enablement still require operator setup after migration.
- **Local QA (real checkout, 2026-10-15):** applied on `reyvo1/iot-platform` `main@2f6919a51b4d94bf7f1b292a8cf54fd10523b172` (the receipt-successor commit; `3b80897bb154f6fb80ea375a9e39b698e9c87159` is its ancestor). The exported snapshot was compared file-for-file against that commit before transfer: 0 paths only in origin, 21 new paths, 14 modified paths — exactly this batch, so nothing from the SDK-repair or SDK-acceptance commits was reverted. **Full Jest: 295/295 suites, 2606/2606 tests PASS** against a real migrated PostgreSQL (disposable `postgres:16-alpine`, `prisma migrate deploy`; `demo-seed-reentry` passes there, which is the suite that fails on a host without `DATABASE_URL`). Targeted Jest `wave2:test:targeted`: **59 suites / 579 tests PASS**. Also PASS: lint, `rescue:validate` (507/507), `security:secrets:scan`, `gitignore:source-scope`, `session:handoff`, `deep-product:contracts`, `product-surface`, `enterprise:wave-status` self-test + verify, `user-web:navigation`, `migration:compatibility` self-test + verify, `baseline:hygiene`, `baseline:manifest` generate + verify (1493 paths / 1494 entries), and the production dependency audit with 0 critical findings. No UAT, auth/RBAC/TLS/rate-limit, simulated-hardware or error-semantics assertion was weakened, skipped or downgraded. The GitHub-hosted live acceptance chain remains owner-gated by the account billing blocker and is not claimed by these local results.

- **Evidence boundary:** `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent class. Focused browser evidence is `BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT`; domain responses/device lookup are explicit fixtures while Chrome decodes real go2rtc/FFmpeg test-pattern frames. PHYSICAL/HIL and provider-owned observations remain separate and non-blocking; they are not fabricated. Native mobile camera transport, Alexa/Google authorization and continuous provider health remain explicit scope boundaries. No simulated-hardware, auth/RBAC/TLS, rate-limit or error-semantics evidence was relabelled, and no provider-owned observation was fabricated, to obtain these results. Waves 1–13 remain SOFTWARE SCOPE CLOSED / GREEN and no numbered wave/module is invented.

- **k6 function stress suite (2026-10-16, source-complete, execution belongs to GitHub):** added `config/stress-budget.json` (80+ declared functions with per-class latency/error budgets, plus an explicit `notStressed` list where every exclusion names its reason), `ops/loadtest/k6/` (budget-driven script, session/auth helpers, per-class latency trends), `scripts/run-k6-stress-suite.mjs` (fail-closed runner judging k6's summary export), `scripts/seed-stress-baseline.mjs` (idempotent stress tenant with device/dashboard/automation/scene/schedule/notification/command, credentials to git-ignored `.stress-credentials`), `test/k6-stress-suite.contract.spec.ts` (every declared path resolves to a real controller route; every PRODUCT_UI controller is exercised or excused; budgets/guards/wiring asserted), a provisioned Grafana dashboard (`k6-stress-overview`), CI wiring (`stress:seed` + k6 install + `stress:suite` in the rescue runtime job), and the operator guide (`ops/loadtest/README.md`). Per explicit owner instruction the suite was NOT executed locally here: k6 binary and local containers are gone from this workspace. Test execution belongs to GitHub Actions on the new public repo `reyvo1/koy`, which is not subject to the billing runner limit. Along the way one genuine product gap was found and fixed at the source: `GET /admin/platform-capability-templates` answered **500** instead of the conventional **400** when `tenantId` was missing (the controller trimmed before the service's `requireTenant` validated); it now flows through the same validation as its sibling platform routes. No gate, assertion, or evidence rule was weakened.

- **k6 CI first execution (2026-10-16, run `38858402113` on `koy`):** core CI (`test` 5m27s) and both ESP-IDF/QEMU jobs passed, and every live probe through the Wave 13 load gate passed including Wave 12/11/10, deep product, management plane, UAT and broker smoke. The job then stopped at the new **Install k6** step (exit 2, `Not found in archive`): the step asked tar for a bare `k6` member, but the pinned release tarball carries `k6-v1.0.0-linux-amd64/k6`. This was an installer-packaging defect in the new CI step, not a platform failure -- the exact mistake was caught locally earlier when unpacking the same tarball. Fixed at the source with an explicit versioned member path and `--strip-components=1` (commit `53fa2a7`), pushed to both remotes; new koy run `38860055904` will exercise the seed + suite steps for the first time.

- **Manifest-miss root cause (2026-10-16, run `38860055904` rerun):** the acceptance job's sealed-source contract failed with `Manifest mismatch at row 7: ./.github/workflows/ci.yml`. Cause was procedural, not product: the k6 installer repair (`53fa2a7`) changed the workflow without resealing, so `baseline:manifest:verify` refused the checkout before any probe ran. Repaired by regenerating the manifest (1503 entries) after the workflow change, verified locally with the full cheap-gate set, and pushed as `9fed271` to both remotes. The same commit fixes the suite's teardown API-key delete (`http.del(url, null, params)` instead of passing headers as the body, which had produced an unauthenticated 401 and would have leaked one key row per run; suite execution itself was unaffected). New koy run `38862156474` carries both repairs.

- **k6 suite first CI execution (2026-10-16, koy run `38863929157`):** the install and seed steps passed; the suite itself exited 99 with `http_req_failed` 4.63%. All of the failures were deterministic and local to four declared functions. Root causes found by reading the API, not by rerunning: Fastify refuses a request that declares `application/json` and carries no body (`FST_ERR_CTP_EMPTY_JSON_BODY`), which is every bodyless POST/DELETE the suite sent (automation activate/deactivate, the device-group churn deletes); the activation endpoints additionally require an `expectedRevision` body field; the aggregation endpoint requires the full canonical window (capability, from, to, bucket) and refuses boolean capabilities, while the seeded `power` capability is boolean by design. Fixes in this batch: per-request Content-Type only when a body exists, a revision-read + `expectedRevision` flip for activation, a numeric `power_consumption` capability in the seed for the aggregation window (fixed at setup time), and a teardown restore that reads the live revision before flipping back. Local reruns of k6 remain out of scope by owner instruction; the next koy run is the evidence.

- **k6 suite second CI execution (2026-10-16, koy run `38877691084`):** failures collapsed from 4.63% to 0.84% of requests. The churn deletes, the aggregation window, and deactivation are green; one function remained, `automation activate`, 0/56. Root cause read from the API again: activation re-validates the persisted definition (`definitionFromAggregate` then the domain validator), and the seeded fixture violated two rules the API enforces on create -- the action targeted the same device+capability as its trigger source, and the stored condition `{}` is not a valid node (`{ kind: 'ALWAYS' }` is), with the action value stored as an object instead of the primitive the data type expects. Deactivation never re-validates targets, which is why only activate failed. Fix: the seed's numeric `power_consumption` sibling is now writable, the automation action targets it with the primitive `120`, the condition is a real `ALWAYS` node, and the seed's update clauses converge older databases to the same shape. Next koy run is the evidence.

- **k6 suite third CI execution (2026-10-16, koy run `38882927455`):** the run itself was green -- every check 2xx, `checks` 100.00%, `http_req_failed` 0.01%, and all declared thresholds passed inside k6. The runner still failed closed with 9 budget breaches because k6 v1.0.0 made `compact` the default end-of-test summary and `--summary-export` follows that model, so the exported file carried no `metrics` object for the runner to re-check (`http_req_duration`, `http_req_failed`, `checks`, and all five class trends read as missing). Fix: the runner now invokes `--summary-mode=legacy`, the v1.0 mode that preserves the `{ metrics: { name: { values } } }` export contract, with the contract spec asserting the mode so a silent default change cannot empty the file again. With the suite green, the next koy run also carries Wave 11/12 probes, the Gate 1 receipt, and the full acceptance steps that have not run since the k6 step landed.

- **k6 suite fourth CI execution (2026-10-16, koy run `38885429394`):** the identical 9 breaches disproved the previous theory. `--summary-mode=legacy` does not change the export: k6 v1.0.0's `--summary-export` writes the same flattened document in every mode (verified in `internal/js/summary-wrapper.js` and its golden test in the k6 repository), and the mode only changes the console display. The real mismatch was the reader: it expected the pre-1.0 nested `metrics.<name>.values` object, while v1.0 exports each statistic flattened on the metric itself (trends carry `p(95)` directly, rate metrics carry `value`). The runner now reads the flattened shape, counts `root_group.checks` in both object and array forms, and the misleading `--summary-mode=legacy` flag is removed and the spec assertion reverted. The suite itself has been green since the previous run; only the reader kept failing closed. Next koy run is expected to pass the k6 step and continue into Wave 11/12, the Gate 1 receipt, and full acceptance.

- **k6 suite fifth CI execution — full pipeline green (2026-10-16, koy run `38887778472`, commit `67248f3`):** first fully green acceptance since the k6 batch landed: `test`, both Wave 3 ESP-IDF/QEMU builds, and the entire rescue/acceptance job — install k6, seed the k6 stress baseline, k6 function stress suite (http_req_duration p95 5ms < 1500ms, http_req_failed 0.015% < 0.5%, checks 100.000% > 99%, every declared class inside its budget, `STRESS SUITE PASS`), Wave 12 ×4, Wave 11 ×4, Gate 1 source-bound runtime receipt, Full automated acceptance once, diagnostics upload and teardown. The four repair commits (`0bb69c3`, `30dc915`, `ca7a8a3`, `67248f3`) are sealed in this checkout; the flattened-export reader fix was the last failure class.

- **UI/chart hardening batch (2026-10-16, local gates + sealed, acceptance pending):** one shared token-aware `SeriesChart` and `GaugeDial` now live in the design system and replace every hand-rolled visual: five admin telemetry surfaces render through the shared chart (super telemetry adds a min–max band, tenant realtime, device detail and the dashboard sparkline render through it, and the `/tenant/grafik` page gains its first actual graph), the User Web CHART widget draws a real graph instead of a text list, GAUGE is an SVG dial instead of an unstyled `<meter>`, and workspace CHART/GAUGE widget kinds render real visuals. The previously undefined widget/dashboard/login CSS (`iot-widget*`, `iot-values`, `iot-series`, `iot-table-wrap`, `iot-gauge`, `iot-login`, `iot-form-error`, …) is defined once in `packages/design-system/src/styles.css`; dead donut CSS removed. New contract `test/ui-chart-system.contract.spec.ts` is in targeted QA. Local gates: design-system/admin-web/user-web typechecks, eslint on all changed files, eight related contract suites (88 tests) green, both Next builds pass. The mobile pass then completed the same batch: `mobile-theme.ts` house tokens (light and dark through one palette), a pure-View `MobileSeriesChart` with a press-to-inspect readout and bucket downsampling, a segmented gauge replacing the plain progress bar, one chart per binding for CHART widgets so units never mix, state-tinted widget badges, and a themed location map with bounded zoom controls and selectable pins — still zero new dependencies, as the mobile package contract forbids lockfile changes. Mobile gates: `npm run mobile:validate`, mobile contract suites (49 tests), in-src mobile Jest suites (84 tests), five related contracts (30 tests) and eslint all green. A second mobile pass then closed the remaining owner-directed visual gaps: the profile settings panel finally renders in light mode (it was dark-only), the tab bar and dashboard selector use the teal accent with proper selected states in both schemes, the login screen gained the brand mark and inset-aware layout, state notices keep their tone in dark mode, and the app now ships a real icon, adaptive icon and splash (locally generated assets through the `expo-splash-screen` plugin). Safe-area insets are handled app-wide via the newly approved `react-native-safe-area-context` — the only dependency addition, recorded in the updated exact-dependency contract; the installed dev-client APK needs one rebuild to include the two new native modules (`react-native-safe-area-context`, `expo-splash-screen`). Gates after this pass: `mobile:validate`, 7 mobile contract suites (62 tests), 8 in-src suites (84 tests), 6 related suites (40 tests), eslint clean; manifest resealed 1511/1511. Full acceptance for this batch ran green in koy run `38912460710` (commit `444963a`).

- **Mobile offline-first wave H1 (2026-10-16, local gates + sealed, acceptance pending):** the phone now keeps a bounded last-known dashboard per server origin: an `expo-sqlite`-backed snapshot cache (24 entries, 256 KiB per entry, fail-closed reads and writes) keyed by origin+tenant+dashboard, served only for connectivity outages (`shouldServeCachedDashboard`), cleared on logout, and rendered with a localized "Mode offline / Offline mode" banner carrying the cached timestamp. Two new suites (20 tests) are registered in `wave2:test:targeted` — `test/mobile-offline-first.contract.spec.ts` and the offline unit spec — and both new contract specs (this one and `test/ui-chart-system.contract.spec.ts` from the previous batch) are classified `current-state` in `test/contract-surface-policy.json`. The `expo-sqlite` import chain surfaced a real typing rule: `expo-modules-core` augments `ProcessEnv` globally, so `isSchedulerRuntimeEnabled` now takes the explicit `SchedulerRuntimeEnvironment` type its automation twin already used (the spec is unchanged). Gates: `mobile:validate`, targeted QA 63/63 suites (624 tests), full Jest 2650/2651 green (the one failure is the DB-bound `demo-seed-reentry` suite that needs `DATABASE_URL`, which CI provides), `rescue:validate` 507/507, manifest/handoff/product-surface self-tests pass; manifest resealed 1516/1516. The dev-client APK needs one rebuild covering all three new native modules (safe-area, splash, sqlite). Full acceptance ran green in the same koy run `38912460710` (commit `444963a`, all four jobs: test, both Wave 3 builds, rescue live EMQX / acceptance).


- **Mobile offline command outbox wave H2 (2026-10-16, local gates + sealed, acceptance green):** a command tapped without connectivity is no longer lost in a failed request: the phone keeps a bounded expo-sqlite command outbox (16 entries per origin+tenant, 5 automatic attempts, 4096-byte value bound, fail-closed reads and writes) whose entries carry the server idempotency key generated at enqueue, so every replay reuses it and a lost response cannot execute twice. Flush policy: a transient answer (unreachable, 429, 5xx) stops the pass and keeps the remaining commands queued, a business failure marks that one failed and continues, automatic attempts stop at `MAX_OUTBOX_ATTEMPTS`, a manual retry grants a fresh budget, discard removes failed entries, and logout clears the queue. The dashboard now renders a localized outbox banner (pending/failed counts with retry and discard actions), the widget reports queued commands as `QUEUED_OFFLINE` ("Perintah disimpan…") instead of letting them read as sent, and the network-settle path replays the queue automatically and reloads the dashboard when anything was sent. The sqlite native import moved to a shared `expo-sqlite-database.ts` so one module owns both tables, pinned by a stronger directory-wide single-import assertion in the H1 contract. Two new suites (25 tests) are registered in `wave2:test:targeted` — `test/mobile-command-outbox.contract.spec.ts` (classified `current-state`) and the outbox unit spec. `enqueuedAt` and `lastAttemptAt` joined the rescue validator's device-local allowlist with spec pins, like `cachedAt`. Gates: `mobile:validate`, targeted QA 65/65 suites (649 tests), full Jest 2675/2676 green (the one failure is the DB-bound `demo-seed-reentry` suite that needs `DATABASE_URL`, which CI provides), `rescue:validate` 507/507, eslint clean, manifest/handoff/product-surface/hygiene/core-runtime self-tests pass; manifest resealed 1522/1522. The dev-client APK rebuild still covers the same three native modules (no new ones). Full acceptance for this batch ran green in koy run `38920403798` (commit `60377db`, all four jobs: test, both Wave 3 ESP-IDF/QEMU builds, and the rescue live EMQX / acceptance chain).

- **Mobile offline-first breadth refresh wave H3 (2026-10-17, local gates + sealed, acceptance pending):** the directory read surfaces joined the offline-first path: the device directory and analytics alerts now keep their last validated payload in the same origin+tenant-namespaced sqlite snapshot cache (`surface|...` keys, 500-device / 200-alert-item bounds, defensive re-validation on read) and are served only for connectivity outages, with the localized cached-mode banner on the devices, realtime and alerts tabs (realtime telemetry is deliberately not cached -- a chart of stale samples invites reading the past as the present). The command outbox gained last-intent-wins coalescing: re-tapping the same control offline supersedes the queued intent for that device+capability with a fresh identity and idempotency key (a stale key would make the server replay the old payload), keeps its original queue position, resets the attempt budget, and may pass a full queue without consuming capacity. Connectivity proof now also drains the queue: every validated directory/alerts load and every accepted command send triggers a flush pass, so queued commands replay without waiting for a manual refresh. Two suites are added (25 tests: `test/mobile-offline-surfaces.contract.spec.ts`, classified `current-state`, and the surfaces unit spec; the outbox suites grew with three coalescing tests). Gates: eslint clean, `mobile:validate`, targeted QA 67/67 suites (667 tests), full Jest 2693/2694 green (the one failure is the DB-bound `demo-seed-reentry` suite that needs `DATABASE_URL`, which CI provides), `rescue:validate` 507/507 (its pinned terminal-reconcile literal was kept and the product code adapted instead), manifest/handoff/product-surface/hygiene/core-runtime self-tests pass; manifest resealed 1525/1525. The dev-client APK rebuild still covers the same three native modules (no new ones). The prior receipt+reseal commit `a7995f0` also ran green as koy run `38925802629`. Full acceptance for this batch must earn a koy run after the push.
## Next action

No failing gate remains: the k6 stress batch is closed green end-to-end on `reyvo1/koy` run `38887778472` (commit `67248f3`) — `test`, both Wave 3 ESP-IDF/QEMU builds, and the full rescue/acceptance chain including install k6, seed, k6 function stress suite PASS, Wave 12 ×4, Wave 11 ×4, the Gate 1 source-bound runtime receipt, and full automated acceptance. Per the enterprise override, the first owner-directed hardening batch (shared chart/gauge UI polish, see receipt) is implemented and sealed locally; once the owner authorizes the push it must earn a new full acceptance run before handoff. Physical ESP32/camera HIL, operator-owned Grafana k6 remote-write, and the billing-blocked private-repo CI remain separate and non-blocking, and the monitoring stack, off-host backup and infrastructure skeleton are still not claimed as deployed. On a fresh session, verify `git rev-parse HEAD` / `git status --short`, read `docs/SESSION-HANDOFF-PROTOCOL.md` and `docs/RESCUE-WORKFLOW.md`, and run `npm run session:handoff:self-test` before any mutation.

--- HISTORICAL CHECKPOINTS BELOW — superseded by the block above ---

# CURRENT PRODUCT HARDENING CHECKPOINT — 2026-10-08



- **Verified committed baseline:** commit `4907ea5822e07188394ebee3c72e860e79a793cc`, branch `main`, origin `reyvo1/iot-platform`; GitHub Actions run `37449896281` completed/success on that exact source. This run does not certify the new local changes.
- **Owner instruction:** complete the Development Kit product gaps without making physical hardware a blocker. The owner subsequently explicitly authorized continuing the npm audit and **PUSH** in this same session; the earlier no-push instruction is superseded. No production deploy or existing-runtime restart is authorized.
- **Implemented batch:** shared typed commands and project confirmation modals; canonical 23+23 admin route sweep; User Web/mobile scene and schedule actions; web camera playback with tenant/VIEW-guarded, credential-free SDP; stored-coordinate maps and admin operator coordinate entry; durable, authority-revalidated recurring maintenance; MQTT/HA connection-check/sync/history/disable; authenticated device firmware/protocol reports. Additive migration strengthens database tenant provenance and prevents duplicate OPEN windows. Details: `docs/PRODUCT-OPERATIONAL-COMPLETION-2026-10-07.md`.
- **Candidate:** implementation `68454f460d9eeee8a9750ec03daafa6570c5d5a6` plus native-Node SDK root repair `3b80897bb154f6fb80ea375a9e39b698e9c87159` are committed/pushed to verified `origin/main` without force. Exact-source GitHub Actions run `37712838417` passed core CI (291 suites / 2585 tests), PostgreSQL integration (16 suites / 72 tests), browser controls/decoded synthetic media, and both real ESP-IDF/QEMU targets. The live acceptance job was not started because GitHub account billing/spending limits blocked runner allocation; this run is NOT full acceptance. The current bounded dirty receipt contains only documentation/evidence synchronization. No production deployment occurred. Waves 1–13 remain SOFTWARE SCOPE CLOSED / GREEN and no numbered wave/module is invented.
- **FIRST FAILING GATE:** run `37712838417` → `Rescue live EMQX / acceptance` → external GitHub runner allocation, with zero steps executed and annotation: recent account payments failed or spending limit needs to be increased. Owner must resolve GitHub Billing & plans before re-running the failed job. This is not a physical-hardware blocker or an observed software test failure. Prior run `37643985961` was red at extensionless native-Node SDK loading; the `.ts` re-export/no-emit project repair and actual native-Node regression now pass, including in current core CI. Do not weaken/skip the live acceptance gate or relabel partial results as full PASS.
- **Final local QA:** targeted Jest 55/55 suites, 558/558 tests; one complete full Jest run 291/291 suites, 2584/2584 tests; real migrated PostgreSQL 8/8 integration tests; focused Chrome actions and real decoded synthetic video; backend/SDK/Admin/User Web/mobile/design-system typechecks; Admin and User Web webpack production builds; lint, zero-critical production audit, staged secret scan and required source/schema/ESP-IDF/QEMU-runner contracts PASS. The standard Turbopack build could not bind a sandbox worker port locally; the unchanged default build remains mandatory in GitHub. No full GitHub acceptance is claimed for this candidate yet.
- **SDK repair QA (2026-10-08):** SDK typecheck and native-Node SDK regression PASS (1 suite / 10 tests); current exact-source core CI confirms 291/291 suites / 2585/2585 tests and 16/16 PostgreSQL suites / 72/72 tests. Required cheap gates, lint, zero-critical production audit, handoff, manifest, structural 507/507 and secret scan PASS before SDK repair push. Initial local full Jest 291/2584 remains historical evidence for the first implementation candidate.
- **Surface:** 46 controllers / 197 endpoints; 23 tenant and 23 super canonical menus, 7 User Web targets and existing 5 mobile tabs. API-only protocols do not gain artificial menus. CCTV/NOC/Technician keep QUARANTINE until a new full acceptance approves promotion.
- **Evidence boundary:** `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent class. Focused browser evidence is `BROWSER_FIXTURE + SYNTHETIC_MEDIA_TRANSPORT`; domain responses/device lookup are explicit fixtures while Chrome decodes real go2rtc/FFmpeg test-pattern frames. PHYSICAL/HIL and provider-owned observations remain separate and non-blocking; they are not fabricated. Native mobile camera transport, Alexa/Google authorization and continuous provider health remain explicit scope boundaries.
- **Production deployment:** NOT APPROVED. Server-owned connection configuration and maintenance-worker enablement require operator setup after migration. No production credentials/configuration were changed.

## Next action

Resolve GitHub account Billing & plans (owner-owned external action), then re-run the failed live acceptance on exact source `3b80897bb154f6fb80ea375a9e39b698e9c87159` / run `37712838417` or run complete acceptance on the newer receipt commit after verifying its actual HEAD. Preserve all production/auth/TLS/UAT gates. If a receipt-only successor exists, compare software paths rather than inventing new implementation work; full acceptance must still name its exact source. The bounded receipt should be resealed, pass `npm run session:handoff:self-test` and authority/structural checks, and be packaged under the existing explicit owner push authorization. On resume verify `git rev-parse HEAD` / `git status --short`, branch/remote and exact-SHA CI. Do not audit from zero or promote this billing-blocked run to full green. Disposable fixtures were removed; deployment remains unapproved and physical equipment remains non-blocking.

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

# Chat Session — Final Cross-Surface Integrity Audit

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


## Superseded authority — historical all-green checkpoint

- GitHub Actions run `37212540616` / commit `2cecb7aa4020ffb6a566949f2e5a44794432d0a7` / evidence `logs_100795117631.zip` is the authoritative **ALL-GREEN** software checkpoint.
- Evidence confirms 281/281 Jest suites, 2443/2443 tests, E2E, PostgreSQL integration, MQTT integration, ESP32 + ESP32-C3 ESP-IDF/QEMU, and the heavy live acceptance chain are green.
- UAT was strengthened rather than weakened: non-reportable Automation triggers are required to fail, while a separate valid reportable trigger must pass.
- `SIMULATED_HARDWARE_LIVE_SERVICE` remains the mandatory automated hardware-equivalent label. PHYSICAL/HIL remains optional/non-blocking for software certification and must never be relabelled as simulated evidence.
- Waves 1–13 remain **SOFTWARE SCOPE CLOSED / GREEN**. Do not restart them from zero without newer failing evidence.

## Active batch — production product-surface completeness

This batch starts from the green checkpoint above and closes product lifecycles that backend source already supported but the web product did not expose completely:

1. **Organization & Branch:** platform directory (`GET /organizations`), Super Admin create/list/add/detach-non-primary/delete-group UI/BFF, primary-branch detach refusal, tenant existence/duplicate validation, transaction-safe scoped mutations, and stable race/conflict semantics. Organization deletion removes grouping rows only and never deletes Tenant records.
2. **Tenant Custom Role:** backend permission catalog, bounded assignment read model, Tenant UI/BFF create/assign/revoke/delete lifecycle, and runtime UAT proving a MEMBER changes `403 -> 200 -> 403` for `dashboard.read` as the role is assigned and revoked.
3. **Webhook signing-secret rotation:** Tenant BFF/UI with explicit two-step confirmation and one-time replacement secret; Wave-5 live probe must prove the new secret validates a real delivery, the old secret no longer validates, and list APIs never expose either secret.
4. **Docs/Development Kit:** route inventory and production-readiness state are synchronized to the actual green checkpoint without declaring an unknown environment production-approved.
5. Existing auth/RBAC/TLS/rate-limit/Wave 1–13/full Jest/simulated-hardware gates remain mandatory. No gate is skipped, downgraded, or made allow-failure.
6. **Custom Role database tenant invariant:** `MembershipRoleOverride.roleId` is hardened from an ID-only FK to a tenant-composite `(roleId, tenantId) -> CustomRole(id, tenantId)` FK. Migration `20261005011500_tenant_role_override_tenant_integrity` aborts if legacy cross-tenant bindings exist instead of silently rewriting authorization data. PostgreSQL integration must prove cross-tenant role assignment fails with `P2003`.

### V1 local retry state / V2 root-hardening note

- The first Production Surface Closure V1 run on the real checkout stopped fail-closed and left the exact V1 payload in the working tree; no commit/push is claimed. The uploaded artifact is only the backup patch, while the named `iot-production-surface-closure-v1-20261005-010151.log` was not uploaded, so the exact V1 failing gate is **not invented or claimed** here.
- Continued source audit found an independent P1 tenant-isolation gap: application writers scope Custom Role assignments by tenant, but the original database FK protected only `roleId -> custom_roles(id)`. V2 makes tenant identity part of the database FK and adds both structural and real PostgreSQL regression coverage.
- V2 retry must accept only the clean green base or the **hash-exact V1 dirty tree**; unrelated local changes remain a hard stop.


## Validation available in exported snapshot

- `deep-product:contracts:self-test`: PASS after the new lifecycle guards.
- `session:handoff:self-test`: PASS after current documentation synchronization.
- `wave2:prisma:self-test`, `rescue:github-ci:self-test`, enterprise wave-status self-test/verify, and `wave1:prepush:self-test`: PASS.
- `node --check scripts/run-rescue-runtime-flow-extension.mjs`: PASS.
- `bash -n scripts/probe-webhook-event-vocabulary.sh`: PASS.
- Dependency-backed targeted Jest, Prisma CLI validation/generation, full local pre-push, live probes, commit/push, and GitHub Heavy UAT are **not claimed yet for this uncommitted batch**; they must run in the real checkout before a new green checkpoint exists.

## Production deployment status

Repository software certification is green at the authority checkpoint, but **production deployment approval remains explicit and environment-specific**. Real production secrets, broker ACL/CA/hostname, DNS/TLS, off-host backup retention/restore ownership, monitoring access, rollback ownership, and any provider-owned observations must be verified by the deployment operator. Repository/UAT green is not permission to invent those facts.

## Next action

Run Production Surface Closure V2 only against `reyvo1/iot-platform` `main@2cecb7aa4020ffb6a566949f2e5a44794432d0a7`; it may start from the clean green base or the hash-exact fail-closed V1 dirty tree. Run early `git diff --check`, manifest/structural guards, Prisma validation/generation, targeted Jest, the strengthened full `wave3:prepush:check`, real PostgreSQL integration including the cross-tenant Custom Role FK proof, final diff review, then one commit/push. Treat the resulting GitHub Heavy UAT as authoritative. **FIRST FAILING GATE: exact V1 gate remains unknown because its log was not uploaded; V2 must print the active stage and failure tail and still stop at the first failing gate without weakening UAT.**

## V2 local gate result — RED, root cause isolated

- Real-checkout run `iot-production-surface-closure-v2-20261005-013753.log` reached `full-local-prepush` after package hashes, manifest/origin verification, structural QA, Prisma checks, and targeted Jest all passed.
- Targeted Jest: **30/30 suites, 318/318 tests PASS**.
- Full Jest: **276/281 suites PASS; 2469/2476 tests PASS**. The 5 failing suites / 7 failing tests all assert the same canonical deployment-safety wording in `docs/production-readiness.md`.
- Root cause: V2 changed the canonical contract text from `Status: NOT READY FOR PRODUCTION DEPLOYMENT` to a richer software-green phrase. The underlying deployment boundary was not intentionally relaxed, but changing the exact canonical status broke multiple safety contracts.
- Root fix: restore the canonical `Status: NOT READY FOR PRODUCTION DEPLOYMENT` and `Completion review status: LOCAL GATES PASSED` markers, while retaining authoritative-green checkpoint details on separate lines. Tests are not weakened or changed.
- The authoritative all-green baseline remains `2cecb7aa4020ffb6a566949f2e5a44794432d0a7` / run `37212540616`; the V2 dirty tree is not a green checkpoint and has not been committed/pushed.

--- HISTORICAL CONTEXT BELOW ---

# Chat Session — Admin BFF session/error semantics deep-audit batch — 2026-10-04

Historical enterprise-wave state: software-closed=1-13; active=none.

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


Waves 1–13 remain **SOFTWARE SCOPE CLOSED / GREEN** at GitHub Actions run `37195822587` on commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` with evidence `logs_100750579910.zip`. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent evidence class; PHYSICAL/HIL and provider-owned external observations remain separate and non-blocking for software closure.

## Latest evidence

- GitHub Actions run `37195822587` / commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / evidence `logs_100750579910.zip`: GREEN; no active CI blocker in the uploaded checkpoint.
- Snapshot SHA-256 matches the handoff export: `7de58e9d9ad3bb56e546577c34fd1becd5c4fe6d769d5a207d4d0f62975cea01`.
- Evidence bundle SHA-256 matches handoff: `b6d58dae9af280d6e14f252accb7fdbd25d9cbc600b04c920dd222bde65dae58`.
- FIRST FAILING GATE: **none** in the authoritative green run. This session continues product hardening, not Wave 1–13 debugging.

## Root-cause finding and repair in this batch

- Admin Web refresh was rotated inside `AdminSessionBackendClient` but most BFF responses never persisted the rotated pair back to HttpOnly cookies. A request could recover once and then repeat refresh with the stale browser access token.
- Manual BFF routes still contained the legacy `401 || 403` invalid-session pattern, including Scene Run; 403 authorization must never destroy a valid session.
- `device-capabilities` and tenant telemetry chart could turn upstream failures into empty-success UI, while tenant command aggregation swallowed unexpected per-device failures.
- Added one central `finalizeAdminSessionResponse` boundary, wired shared proxy responses through it, migrated direct routes to preserve 403 and refresh state, and tightened false-empty error semantics.
- Added `test/admin-web-session-lifecycle.contract.spec.ts` and strengthened `deep-product:contracts:self-test` so these failures cannot silently return.
- Updated current authority/docs/Development Kit from the older b7b evidence to the uploaded exact green `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` / run `37195822587` checkpoint.

## Validation status

- Source identity/evidence hash verification: PASS.
- `node --check scripts/self-test-deep-product-contracts.mjs`: PASS.
- `deep-product:contracts:self-test`: PASS after the Admin BFF repairs and latest-authority update.
- `session:handoff:self-test`: PASS after continuity-doc synchronization.
- Enterprise wave-status self-test/verify: PASS; terminal `software-closed=1-13; active=none` remains synchronized.
- Baseline manifest resealed and verified: **1387/1387 source paths**, **1388/1388 manifest entries**.
- TypeScript parse-level check found no syntax-class diagnostics; dependency imports/types are unresolved because the exported snapshot has no installed dependency tree.
- A bounded `npm ci` attempt did not complete inside this tool environment and was stopped/cleaned; no dependency-backed Jest/pre-push PASS is claimed.
- Full dependency-backed `wave3:prepush:check`, real diff review against git, commit/push, and GitHub heavy UAT cannot be truthfully executed from this exported ZIP because it contains no `.git` metadata. They remain mandatory in the real `reyvo1/iot-platform` checkout.

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

--- HISTORICAL CHAT SESSION CHRONOLOGY BELOW ---


# Chat Session — GitHub Full Jest contract-drift root fix — 2026-10-04

<!-- historical session block; current authority marker removed -->

Wave 13 remains IN PROGRESS. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the mandatory automated hardware-equivalent UAT class; unavailable physical ESP32/camera equipment is non-blocking for software progression and remains separately labelled field evidence.

## Latest evidence

GitHub Actions run `100595907100` checked out commit `23af7c26cd57d513becc7f92059829da666e8247`. Both Wave 3 ESP-IDF matrix jobs built/booted successfully far enough to upload their artifacts. Core job `test` reached Full Jest and finished **2 failed / 276 passed suites; 2 failed / 2409 passed tests**. The only failures were stale source-contract assertions:

1. `test/module-execution-efficiency.contract.spec.ts` still required superseded audit-only/module-runner wording (`first proven failure` on the new execution-loop document, `OFFICIAL VALIDATION+COMMIT`, and `AUDIT ONLY`/`No repository changes made.` in the resume prompt) even though the active handoff protocol now resumes from a verified checkpoint/first failing gate.
2. `src/rbac/domain-access-model.spec.ts` still required Scene/Schedule audit text saying `no owner column and no role gate`, while the controllers now enforce device-derived VIEW/CONTROL and target-Scene authorization. The stale statement also remained in the RBAC ownership catalog/UI blueprint and several source comments.

## Root-cause repair

- Synchronized Development Kit system/failure/fix-validation instructions and the execution-efficiency contract with the durable `RESUME CHECKPOINT → FIRST FAILING GATE → ROOT-CAUSE CLASS → ... → HANDOFF` workflow.
- Replaced stale Scene/Schedule “open to any active tenant member” documentation with the implemented access model: Scene reads require VIEW across action devices; Scene mutations require CONTROL; Schedule inherits target-Scene VIEW/CONTROL; targetless schedules are administrator-only.
- Updated RBAC catalog, ownership/audit comments, enterprise UI blueprint, and domain-access contract to describe the same enforced boundary.
- Added both `src/rbac/domain-access-model.spec.ts` and `test/module-execution-efficiency.contract.spec.ts` to `wave2:test:targeted`, and pinned that coverage in `scripts/validate-rescue-baseline.mjs`. This closes the local-vs-GitHub coverage gap that allowed both stale contracts to pass local pre-push and fail only in GitHub Full Jest.

## QA in repair workspace

- `scripts/self-test-session-handoff.mjs`: PASS, including dynamic agreement of latest GitHub run + full commit SHA across all current continuation files.
- `enterprise:wave-status:self-test` and `enterprise:wave-status:verify`: PASS, 10/10 synchronized current-state documents.
- `scripts/self-test-wave1-prepush.mjs`: PASS.
- `scripts/self-test-rescue-github-ci.mjs`: PASS.
- `scripts/validate-rescue-baseline.mjs`: PASS **486/486** after adding local coverage assertions for both exposed contract specs.
- Changed TypeScript files pass TypeScript `transpileModule` syntax diagnostics; changed Node/JSON sources parse successfully.
- A dependency-free semantic replay of the two failed GitHub assertions now PASS. The extracted repair workspace does not contain `node_modules`, so actual Jest remains deliberately **not claimed** until the operator repository runs the exact two specs and official pre-push gate.

## Next action

Run the two newly targeted contracts first, then `npm run wave3:prepush:check`. If green, review the complete diff once, commit once, push once, and let GitHub heavy UAT continue. Do not reopen ESP32/QEMU/runtime work: the current first failing gate is the two Full Jest governance contracts above.

# Chat Session — GitHub status verifier + simulated hardware UAT hardening — 2026-10-03

<!-- historical session block; current authority marker removed -->

Wave 13 is **IN PROGRESS, software deliverables only**. Physical hardware is not a blocker for software progress: GitHub must maximize `SIMULATED-HARDWARE / LIVE-SERVICE` evidence, while any later field/HIL check stays a separately labeled evidence class and must never be fabricated as physical PASS.

## Root-cause repair and UAT policy

- Fixed the enterprise wave-status verifier so current authority is resolved by the pre-historical block instead of the first 12 lines; this removes the false CI failure seen on commit `f4ed5cd`.
- Strengthened Wave 3 live simulation with cold reboot/rejoin and QoS1 duplicate-telemetry dedupe in addition to provisioning, heartbeat, Wi-Fi/MQTT reconnect, command/ACK replay and OTA verification/rollback.
- Added a combined simulated-hardware UAT evidence gate. It only passes when the same rescue run has live broker negative-flow evidence, the exact built ESP32 firmware live simulation, camera onboarding simulation and RTSP-to-WebRTC media simulation.
- Automated software/UAT completion does not wait for a physical board or camera. Physical/site testing remains a separately labeled optional field-validation layer, not a reason to stop development or keep a software wave open.

## Additional root-cause fixes

- Fixed false-green shell wrappers: `run-camera-probe.sh` and `run-device-location-probe.sh` now use `set -euo pipefail` plus cleanup traps, so a failed Python probe can no longer be overwritten by a successful cleanup/`printf PASS`. `run-media-probe.sh` also emits a simulated-hardware evidence marker only after its real runtime probe succeeds.
- The combined UAT verifier now seals one source-bound receipt only after exact-firmware ESP32 live simulation, real EMQX negative flows, synthetic camera onboarding and RTSP-to-WebRTC all pass in the same rescue job. The ESP32 simulation additionally recreates the device object for a cold boot/rejoin and replays a duplicate QoS-1 telemetry event to prove live database dedupe.
- Removed the physical-lab blocker from software production approval without weakening evidence. `release:approve` accepts `--simulated-hardware=<summary.json>` only when that receipt is `SIMULATED_HARDWARE_LIVE_SERVICE`, matches the current sealed source fingerprint, and carries a valid firmware artifact SHA-256. The historical physical OTA/device-observed digest path remains supported as optional field evidence.
- Production approval self-tests now execute the generator end-to-end: DEFERRED physical OTA without a simulation receipt is rejected, a valid source-bound simulated receipt produces a manifest-bound approval, and a receipt from another source baseline is rejected.
- Corrected the RESCUE evidence validator output so the simulated path reports `Simulated-hardware/live-service device evidence is complete` rather than falsely claiming a physical ESP32 PASS.

## QA status

- `enterprise:wave-status:self-test`: PASS, including long prepended session notes and marker-below-history negative regression.
- `enterprise:wave-status:verify`: PASS, 10/10 current authority documents.
- `uat:simulated-hardware:self-test`: PASS, including failed-camera fail-closed mutation.
- Wave 3 ESP32 simulation self-test: PASS, including cold boot/rejoin, QoS-1 telemetry dedupe, command replay and OTA rollback/confirmation.
- Production approval receipt self-test: PASS for simulated-hardware receipt, source mismatch rejection, tamper rejection, untracked payload rejection and legacy physical compatibility.
- Production approval generator gate self-test: PASS for no-evidence/malformed/deferred-without-simulation rejection, simulated-hardware approval success and cross-baseline rejection.
- Rescue GitHub CI contract self-test: PASS; Wave 1 pre-push self-test: PASS. The local pre-push chain now also requires User Web navigation, rescue CI-env, simulated-hardware UAT and both production-approval self-tests so cheap verifier coverage cannot exist only in GitHub.
- `rescue:validate`: PASS **484/484**; final baseline reseal is **1370/1370 source paths** and **1371/1371 manifest hashes**.
- Changed Node scripts pass `node --check`; changed shell wrappers pass `bash -n`.
- The live combined UAT remains authoritative in GitHub because it requires the rescue Docker/EMQX/PostgreSQL runtime and the exact firmware artifact produced by the ESP-IDF job. Physical hardware is not required for that software gate.

--- PRIOR CHAT SESSION CHRONOLOGY BELOW ---

# Chat Session — GitHub secret-scan root fix — 2026-10-03

GitHub run `37132570951` progressed through dependency bootstrap, enterprise wave-status verification, Wave 2 contract verification and the security dependency-policy steps, then failed at `security:secrets:scan` before the rescue live-service job could execute. The four findings all came from literal PostgreSQL connection-string fixtures in `scripts/self-test-rescue-ci-env.mjs`; they were test data, not leaked credentials, but the scanner correctly rejected credential-shaped source text.

## Root-cause repair

- Removed literal PostgreSQL connection strings from the CI-env self-test source instead of adding a secret-scan allowlist or suppressing the rule.
- The fixture now constructs its disposable PostgreSQL URLs at runtime from non-credential source fragments and still verifies exact `DATABASE_URL` / `TEST_DATABASE_URL` propagation through `scripts/export-rescue-ci-env.mjs`.
- The self-test still asserts that database passwords are never printed by the exporter.
- No production credential, secret-scan policy, or CI assertion was weakened.

## QA

- `node scripts/self-test-rescue-ci-env.mjs`: PASS.
- Source-level PostgreSQL connection-string scan over the changed self-test: no literal `postgresql://user:password@host/...` remains.
- `node scripts/self-test-rescue-github-ci.mjs`: PASS.
- `node scripts/validate-rescue-baseline.mjs`: PASS.
- Baseline manifest regenerated and verified after this session update.
- Full `security:secrets:scan` remains authoritative in the real Git checkout/GitHub because this snapshot does not carry the installed `secretlint` dependency tree; the CI failure class itself is removed at source rather than allowlisted.

## Next step

Apply this tiny root-fix to the clean operator repository, run the local secret scan/pre-push gate, review the three-file diff, then commit/push once. GitHub should then advance past the Wave 13 secret-scan step and expose the next heavy/live-service result. Production remains NOT APPROVED.

--- HISTORICAL CHAT SESSION CHRONOLOGY BELOW ---

# Chat Session — Wave 13 status/CI consistency repair — 2026-10-03

Wave 13 is **IN PROGRESS, software deliverables only**. Waves 1–12 are treated as **software scope CLOSED / GREEN** under their recorded evidence tiers, not as production certification. Production remains **NOT APPROVED** while physical/provider-owned evidence is pending.

This session repairs the root cause of status drift and CI regression gaps: current authority documents are synchronized to the enterprise roadmap, an executable status-sync validator/self-test is added, and Wave 4–8 live probes are made mandatory in the rescue live-service CI chain. Historical Wave 2/3 entries below remain chronology only and no longer define current execution state.

## Repair scope completed

- Synchronized the current authority blocks across agent, current-state, handoff, gate-status, roadmap, project-state, session checkpoint, Development Kit and next-chat handoff documents.
- Added `scripts/verify-enterprise-wave-status.mjs` plus a negative-path self-test. The verifier derives the current wave from `docs/ENTERPRISE-WAVE-ROADMAP.md` and rejects stale/ambiguous current-state markers.
- Wired status self-test/verification into package scripts, the local pre-push chain and GitHub core CI.
- Restored mandatory Wave 4–8 live regression coverage in the rescue GitHub job: UAT/TLS, webhook+SDK, capability templates/saved reports/MQTT management/NOC, mobile notification+maintenance, and billing lifecycle.
- Kept external evidence honest: positive provider-owned payment settlement/webhook, physical ESP32/HIL and physical camera/vendor behavior remain PENDING rather than being relabeled software PASS.
- Increased only the aggregate rescue job budget from 45 to 60 minutes because five additional live-regression groups now execute; individual probe timeouts remain bounded/fail-fast.

## QA executed in this snapshot

- GitHub Actions YAML parse: PASS. Changed Node scripts syntax: PASS. Shell syntax for `scripts/*.sh` and `ops/scripts/*.sh`: PASS.
- `enterprise:wave-status:self-test`: PASS, including stale-handoff and double-active negative cases.
- `enterprise:wave-status:verify`: PASS, 10/10 synchronized current-state documents.
- `baseline:hygiene:self-test` and `baseline:manifest:self-test`: PASS.
- `wave1:prepush:self-test`: PASS. `wave2:core-runtime:self-test`: PASS. Full Wave 3 ESP32 source/build/API/toolchain/QEMU simulation self-test chain: PASS.
- `rescue:github-ci:self-test`: PASS, including mandatory Wave 4–8 regression assertions.
- Production approval receipt/generator self-tests and UAT seed-env self-test: PASS.
- With a temporary synthetic Git index (QA only; no commit/history/remote), `gitignore:source-scope:self-test`: PASS.
- `rescue:validate`: PASS **481/481**.
- Full secret scan reached and cleared the strict credential/pinned-key phase, then could not complete the `secretlint` phase because this ZIP snapshot has no installed dependency tree and the environment cannot fetch the missing CLI. Full Jest/lint/typecheck/build/live Docker probes likewise remain authoritative operator/GitHub gates, not locally fabricated PASS.

## 2026-10-03 User Web + Wave 4 CI root-cause repair

- GitHub run `100557627291` failed in Wave 4 before later live regressions: UAT documentation validation read rescue `PORT=3000` while docs still claimed 5000, and its Prisma account check did not load `DATABASE_URL` from the generated `.env`.
- Added `scripts/export-rescue-ci-env.mjs` so the generated rescue `.env` becomes the single source of truth for `DATABASE_URL`, `TEST_DATABASE_URL`, `IOT_API`, `PROBE_BASE`, and `PROBE_API_BASE` across subsequent GitHub probe steps without printing secret values.
- `verify-uat-baseline.mjs` and UAT documentation checks now resolve the same generated rescue environment; UAT/staging docs are synchronized to API port 3000 and Admin Web port 3100.
- User Web now has seven governed top-level surfaces: Beranda, Ruangan, Perangkat Saya, Realtime, Dashboard, Alerts, Profil. Realtime proxies the VIEW-guarded backend SSE stream; Alerts uses the accessible-device analytics endpoint; Profil uses the authenticated profile GET/POST contract.
- Added `user-web:navigation:self-test`, including a negative mutation that removes Dashboard and must fail, closing the previous blind spot where navigation completeness could drift while `rescue:validate` stayed green.
- Scene/Schedule remain intentionally outside User Web navigation until a complete end-user authoring UI exists; their backend boundary is now hardened: scene reads require VIEW across all action devices, scene mutations/run require CONTROL, and schedules inherit VIEW/CONTROL from their target scene.
- Tenant-wide notification delivery logs are now guarded by `AdminRoleGuard`; MEMBER-facing Alerts continue to use the separate accessible-device analytics endpoint.

## Handoff

The repaired source is ready for operator-side verification in the real Git repository. Before commit/push, use the real `.git` checkout with installed lockfile dependencies, run the maximal local pre-push gate, review the complete diff once, then make the single approved push and let GitHub execute the expanded live-service chain. Production remains NOT APPROVED.

--- HISTORICAL CHAT SESSION CHRONOLOGY BELOW ---

# Chat Session — Enterprise Wave 3 ESP32 + OTA Automated Simulation

## Active progress — 2026-09-15

Wave 1 and Wave 2 are CLOSED GREEN; Wave 2 V9 is the authoritative input baseline (`1035` source paths / `1036` manifest entries). Wave 3 is ACTIVE and is being built as one large automated simulation gate before one push.

Implemented in the current Wave 3 batch:
- ESP32 SDK version/contract bumped to 2.1.0 and made a real ESP-IDF component.
- Streamed HTTPS OTA implementation writes only the inactive OTA partition, computes full SHA-256, compares digest before boot-slot selection, aborts partial writes, and keeps a new image rollback-pending until MQTT reconnect confirms it.
- ESP-IDF test application added with dual OTA slots and rollback enabled.
- Mandatory GitHub ESP-IDF 5.5.5 job builds ESP32, boots it in Espressif QEMU via repository-native boot runner (`idf.py merge-bin` + direct QEMU), cross-builds ESP32-C3, and uploads the exact firmware artifact.
- Optional Wokwi CI is wired only when `WOKWI_CLI_TOKEN` exists; absence is explicit NOT_RUN, never PASS.
- Live Wave 3 digital twin uses the built firmware artifact and real rescue API/PostgreSQL/EMQX to exercise provisioning, heartbeat, telemetry, reconnect, command/ACK, duplicate command suppression, and OTA SHA/reject/interruption/rollback/confirm scenarios.
- Acceptance policy now has a distinct SIMULATED-HARDWARE tier. Physical ESP32/HIL remains pending final Wave 13 certification.
- Stale documentation/validator wording that claimed OTA SHA verification was unimplemented has been replaced by the new simulation-versus-physical evidence boundary.
- Wave 3 self-tests resolve repository paths from the script location rather than process CWD.

QA already executed in the chat environment:
- `self-test-wave3-esp32-simulation.mjs`: PASS, including actual local trusted HTTPS artifact transfer, wrong-digest rejection, interrupted-stream rejection, dedupe and rollback model.
- `self-test-wave3-esp32-source.mjs`: PASS.
- `self-test-rescue-github-ci.mjs`: PASS with mandatory firmware job/artifact/live-simulation sequencing.
- Wave 3 scripts Node syntax: PASS.
- GitHub workflow YAML parse: PASS.
- Updated OTA/evidence guards in `validate-rescue-baseline.mjs`: PASS in the working snapshot; the snapshot still has one unrelated historical Super Reports failure, so unchanged baseline files must come from the sealed V9 authoritative source rather than being patched from the chat snapshot.
- Real ESP-IDF compilation/QEMU and rescue live-service simulation are intentionally pending GitHub evidence; they must not be claimed locally.

Next before handoff/package:
1. Overlay only Wave 3 changed/new files onto the complete sealed V9 authoritative baseline.
2. Generate/verify the new target seal and run dependency-free regressions there.
3. Build/test a recovery applicator that verifies the real user target is clean sealed V9 before copying anything.
4. Package Wave 3. Do not push until the operator local `wave3:prepush:check` is green.

## Wave 3 pre-package QA update

- Rebuilt the Wave 3 candidate from the complete sealed Wave 2 V9 baseline instead of trusting unrelated stale files in the chat snapshot.
- Overlay scope: 37 changed/new Wave 3 files; 15 are new source paths.
- Authoritative candidate seal after overlay: **1050 source paths / 1051 manifest entries**.
- `manage-baseline-manifest verify`: PASS on the reconstructed candidate.
- Wave 3 simulation self-test: PASS even when invoked outside repository CWD.
- Wave 3 source/CI contract self-test: PASS.
- GitHub CI contract self-test: PASS.
- `package.json` parse, GitHub Actions YAML parse and pytest Python syntax: PASS.
- OTA/evidence guards in `validate-rescue-baseline`: PASS; one unrelated historical Super Reports assertion remains only in the chat-retained source snapshot and is not included in the Wave 3 payload. The operator/GitHub Wave 2 V9 checkout remains authoritative for unchanged files.
- Mandatory real ESP-IDF build/QEMU and live rescue simulation are still GitHub evidence and are not claimed locally.

---

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


## 2026-09-15 — Wave 3 V2 root-cause pass

- User explicitly requested root-cause repair because GitHub heavy runs are slow.
- First Wave 3 GitHub run: core application remained green; firmware job failed during ESP-IDF configure with `Failed to resolve component 'iot_sdk' required by component 'main'`.
- Root audit against ESP-IDF build-system contract found the full class, not only the visible line: component identity is directory-derived (`esp32-sdk`), `main` auto-depends on discovered components, the C3 job copied only `test-app` and would lose the SDK parent component, RNG/netif helper APIs lacked explicit owning headers/dependency declaration, and the custom dual-OTA partition table needed a 4MB flash contract.
- V2 removes fabricated `REQUIRES iot_sdk`, keeps direct EXTRA_COMPONENT_DIRS discovery, copies the complete SDK tree for C3, adds `esp_random.h`, `esp_netif.h`, `esp_wifi_default.h`, `esp_hw_support`, 4MB flash config, secure MQTT CA verification, and fail-closed invalid OTA Content-Length handling.
- Added `scripts/self-test-wave3-esp-idf-build-graph.mjs`. It checks component discovery, dependency ownership, C3 topology, flash contract, secure MQTT, and CI sequencing.
- CI firmware job now runs parallel with core test, and all cheap Wave 3 source/build-graph guards execute before the expensive ESP-IDF installation. Rescue live acceptance still waits for both jobs.
- Dependency-free Wave 3 simulation/build-graph/source guards pass after the changes. Real ESP-IDF compile/QEMU remains pending GitHub evidence; do not claim it locally.

## 2026-09-15 — Wave 3 V2 full native-chain root audit

- User required root-cause repair because GitHub native firmware runs are slow; no one-line `REQUIRES` patch is acceptable.
- First Wave 3 run proved core application green and failed at ESP-IDF component resolution (`main` required nonexistent `iot_sdk`).
- Root audit closed guaranteed follow-on failures before repush: component discovery, API header/dependency ownership, ESP32-C3 source-tree topology, 4MB custom partition flash sizing, MQTT TLS CA verification, OTA invalid Content-Length rejection, and slow CI sequencing.
- Additional security/evidence audit moved long-lived device-secret generation until after Wi-Fi connects (RF entropy active), rejects non-ESP `.bin` artifacts via image magic `0xE9`, and removed the false claim that simulation proves encrypted NVS. Production/HIL must prove NVS encryption or equivalent secure storage separately.
- Firmware CI was redesigned as a parallel `[esp32, esp32c3]` matrix. Both targets build with ESP-IDF 5.5.5 and boot target-appropriate Espressif QEMU; firmware also runs in parallel with core CI. Rescue live acceptance waits for core plus the complete matrix and consumes the exact ESP32 artifact.
- Dependency-free build-graph/source/simulator/CI guards PASS. YAML/package/Python syntax PASS. Real ESP-IDF/QEMU remains GitHub evidence because the chat container has no network/toolchain.
- Wave 3 remains ACTIVE; Wave 4 blocked.

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

### V2 final package certification
- Final staged payload matches the Wave 3 V2 candidate for all 23 indexed files.
- Internal `SHA256SUMS.txt` verification: PASS.
- ZIP structural integrity (`unzip -t`): PASS.
- Exact final-ZIP applicator test from a clean synthetic Wave 3 V1 `1050/1051` baseline: PASS through root guards, target-generated `1051/1052` seal, synthetic lightweight-gate invocation, and final seal verification.
- Exact final-ZIP payload identity after apply: 23/23 PASS.
- Real ESP-IDF 5.5.5 native compilation/QEMU and live EMQX/OTA/full acceptance remain GitHub evidence and are intentionally not claimed by this packaging test.

## 2026-09-15 — Wave 3 V3 ESP-IDF API-surface root correction

- GitHub V2 proved the V2 build-graph correction: both `esp32` and `esp32c3` compiled into `packages/esp32-sdk/src/iot_sdk.c`.
- Core evidence stayed green: `186/186` core suites and `15/15` PostgreSQL integration suites passed.
- Both native targets failed on one shared ESP-MQTT API mismatch: `esp_mqtt_client_register_events` / `MQTT_EVENT_ANY_ID` are not ESP-IDF 5.5 public symbols.
- Verified against official ESP-IDF/ESP-MQTT 5.5 documentation: correct API is `esp_mqtt_client_register_event(..., MQTT_EVENT_ANY, ...)`.
- V3 changes the SDK to that public API and adds `scripts/self-test-wave3-esp-idf-api-surface.mjs`.
- The new guard is dependency-free and runs before ESP-IDF install; it rejects the obsolete MQTT names and checks native owner-header/component-dependency pairs across MQTT, HTTP, OTA, RNG, netif, Wi-Fi, NVS and mbedTLS.
- No backend, database, broker ACL, OTA state-machine or product feature change is included.
- Wave 3 remains ACTIVE pending real ESP-IDF compile/QEMU plus the inherited exact-artifact live simulation/full acceptance chain.

### V3 package QA — ESP-IDF 5.5 API-surface correction
- Dependency-free Wave 3 simulator/build-graph/source/API-surface guards: PASS.
- GitHub CI contract self-test: PASS; API-surface guard is required before ESP-IDF install.
- Workflow YAML, package JSON, pytest syntax: PASS.
- Candidate source seal: 1052/1053 PASS.
- Synthetic clean pushed V2 1051/1052 -> V3 12-file overlay -> 1052/1053 reseal -> synthetic lightweight gate invocation -> final verify: PASS with process status 0.
- Real ESP-IDF 5.5.5 compile/QEMU is not claimed locally; GitHub remains the native-toolchain authority.


## 2026-09-15 — Wave 3 V4 root-cause correction
- GitHub V3: core 186/186 suites and DB integration 15/15 remained green.
- Both ESP32/ESP32-C3 firmware targets built successfully; failure moved to QEMU setup.
- Root cause: `install-esp-idf-action` already exported `/tmp/esp` environment, then workflow re-sourced `$IDF_PATH/export.sh`; activation failed with `esp-rom-elfs has no installed versions`.
- V4 removes all secondary `export.sh` sourcing from the firmware job.
- QEMU install and pytest use `$IDF_PYTHON_ENV_PATH/bin/python`; QEMU binary path is resolved under `$IDF_TOOLS_PATH/tools/<tool>` and appended to current PATH + `$GITHUB_PATH`.
- Added `self-test-wave3-esp-idf-toolchain-lifecycle.mjs` and CI regression assertions.
- Wave 3 remains ACTIVE pending GitHub native QEMU + live service + full acceptance.
- V4 synthetic recovery QA: clean V3 1052/1053 -> 11-file overlay -> all dependency-free Wave 3/toolchain/CI/manifest regressions PASS -> generated V4 1053/1054 -> pre-push command invocation -> final manifest verify PASS. Full npm pre-push and native QEMU remain for operator/GitHub evidence.


## 2026-09-15 — Wave 3 V5 deep root-cause scan

- Latest GitHub logs were scanned across both firmware matrix jobs and the core job. Core remains green; both chips compile successfully.
- Failure class is not firmware source: pytest-embedded-qemu 2.9.2 emits esptool v5 `merge-bin`, while pinned ESP-IDF 5.5.5 provides esptool 4.12.0 with the v4 `merge_bin` CLI. Both targets fail at identical flash-image generation before guest boot.
- Internet verification: ESP-IDF 5.5.5 documents `idf.py merge-bin`; Espressif QEMU docs document direct `qemu-system-xtensa` / `qemu-system-riscv32` execution from a merged 4MB flash image; ESP32-C3 requires `-icount 3`.
- V5 removes pytest-embedded from mandatory QEMU evidence, adds `scripts/run-wave3-qemu-boot.mjs`, and adds a dependency-free runner self-test covering success/exit/timeout/unsupported-target.
- Keep optional Wokwi separate; PHYSICAL/HIL remains Wave 13 evidence.

## 2026-09-15 — Wave 3 V5 deep root-cause scan / native QEMU compatibility

- GitHub V4 proved both ESP32 and ESP32-C3 native builds and QEMU installation succeed. The shared failure occurred before guest boot: `pytest-embedded-qemu` 2.9.2 generated esptool-v5 `merge-bin`, while pinned ESP-IDF 5.5.5 carried esptool 4.12.0 whose direct CLI spelling is `merge_bin`.
- Mandatory QEMU evidence no longer depends on pytest-embedded. The pinned framework now owns image creation via `idf.py merge-bin`, followed by direct target-specific Espressif QEMU execution under a bounded repository-native marker runner.
- Deep scan also removed the redundant dual-target pytest parameterization, kept ESP32/ESP32-C3 as independent CI matrix builds, preserved exact application `.bin` handoff for OTA, and retained optional Wokwi as additional evidence only.
- New fail-fast runner checks: build target must match the matrix target, merged QEMU image must be exactly 4 MiB, ESP32-C3 requires `-icount 3`, all three firmware boot markers are required, and premature exit/timeout are fail-closed.
- Dependency-free Wave 3 guards, GitHub CI self-test, manifest portability test, YAML/package parse, and QEMU runner success/mismatch/wrong-size/exit/timeout cases all PASS locally in the artifact workspace.
- Heavy native ESP-IDF/QEMU remains GitHub authority; no physical/HIL PASS is claimed.

### V5 applicator certification

- Candidate authoritative seal: 1054 source paths / 1055 manifest entries.
- V5 applicator tested from a clean committed V4 replica with authoritative V4 seal 1053/1054.
- Recovery preflight detected the exact V4 pytest-embedded compatibility markers, copied 17 files, deleted `packages/esp32-sdk/test-app/pytest_wave3.py`, ran all dependency-free Wave 3 guards, regenerated 1054/1055, and finished final manifest verification PASS.
- Synthetic test deliberately mocked only `npm run wave3:prepush:check` because this artifact workspace does not contain the full project dependency installation; on the user's Windows repo the applicator must execute the real lightweight pre-push gate and fail closed if it is not green.
- Final ZIP must be certified separately after this note is included so the distributed artifact is byte-identical to the tested package.

### V5 final package certification

- Final distribution ZIP was extracted into a clean directory and every internal `SHA256SUMS.txt` entry verified.
- The applicator was then executed from that extracted ZIP against a fresh clean committed V4 replica. Recovery, 17-file overlay, one-file deletion, all dependency-free guards, target-generated 1054/1055 seal, mocked-only synthetic pre-push invocation, and final manifest verification all PASS.
- Final ZIP payload matched the applied target byte-for-byte 17/17. On the user's real Windows repository, `npm run wave3:prepush:check` is not mocked and remains mandatory before any corrective push.
- GitHub remains the authority for native dual-target direct-QEMU boot, exact firmware artifact live-service OTA simulation, real EMQX, and full acceptance. Wave 4 stays blocked.

## 2026-09-28 — V6 QEMU device-argument audit: REVERTED, hypothesis disproved by CI

- V6 (commit 5888126) was pushed to GitHub and CI returned failure. Analysis of run 36376040283:
  - `Wave 3 ESP-IDF esp32 build and QEMU boot` — the QEMU boot step **PASSED** with the V6 eFuse image, then failed only at `Upload Wave 3 firmware artifact` with `Failed to CreateArtifact: Artifact storage quota has been hit`.
  - `test` job — every step through `Production artifact startup smoke` passed, then failed at `Upload production release artifact` with the same artifact-storage-quota error.
  - `Wave 3 ESP-IDF esp32c3 build and QEMU boot` — real regression. `Boot esp32c3 linked SDK firmware in Espressif QEMU` failed: `QEMU esp32c3 boot timed out after 30000ms; missing=WAVE3_QEMU_BOOT_OK, WAVE3_SDK_LINK_OK version=2.1.0 state=0, WAVE3_OTA_SHA256_REQUIRED`.
  - `Rescue live EMQX / acceptance` — skipped, because it needs both firmware jobs.
- The C3 log is decisive. The guest boots normally through `rst:0x1 (POWERON)`, `efuse block revision: v0.0`, `efuse_init: Chip rev: v0.3`, `heap_init`, `spi_flash: detected chip: gd` — and then stops emitting output at exactly `W (33) eFUse: calibration efuse version does not match, set default version to 0`. The application never reaches `app_main`, so no marker is ever printed. V6's only functional change on the C3 path was attaching the ESP-IDF default eFuse image, whose single non-zero byte is `0x0c` at offset `0x26`.
- The premise of V6 was wrong, and the mistake was mine. I audited the runner against `qemu_ext.py`, found four device arguments the native `idf.py qemu` frontend passes, and treated every difference from the native frontend as a defect. Divergence from upstream was not evidence of a bug. V5 was already a **green** GitHub run (34986815462, 14m58s, all four jobs successful), which is direct evidence that the V5 QEMU command booted both targets correctly. I had that fact available in `gh run list` and did not check it before pushing.
- The ESP32 side passing is not exculpatory either: the ESP32 eFuse default has different non-zero bytes (`0x80` at `0x0d`, `0x10` at `0x16`) and the ESP32 firmware completed its markers. Whatever offset `0x26` means on ESP32-C3, supplying it changes calibration-eFuse state in a way that stops the boot before `app_main`.
- Action taken: reverted `scripts/run-wave3-qemu-boot.mjs`, `scripts/self-test-wave3-qemu-boot-runner.mjs` and `scripts/self-test-wave3-esp-idf-api-surface.mjs` to their exact V5 content, and deleted `scripts/wave3-qemu-efuse-defaults.mjs`. Confirmed with `git diff 893f017` that all three are byte-identical to V5 again. The QEMU boot path is now exactly the configuration that produced a green run.
- Retained from V6: the sealed-manifest fix (`manage-baseline-manifest.mjs` excludes any `build` directory at any depth, plus 3 regression assertions in `self-test-baseline-manifest.mjs`). That defect was reproduced locally and is independent of QEMU. It also happens to be what makes a future local `baseline:manifest:generate` safe on a machine that has built the firmware.
- Seal after revert: 1054 source paths / 1055 manifest entries, matching V5's count exactly, since the reverted eFuse module was the only added file.
- Also noted, and not a code problem: the account has exhausted its GitHub Actions artifact storage quota ("Usage is recalculated every 6-12 hours"). That alone fails the `test` job and the ESP32 artifact upload, and it will keep failing until the quota resets or retention is trimmed. It must not be misread as a Wave 3 defect.
- Method lesson, recorded so this is not repeated: before pushing any change to a toolchain-integrated gate, check the previous run's actual conclusion. `gh run list` is one command and would have shown V5 green. A source-level audit can find real divergences and still be a net regression, because "differs from upstream" is not "broken".


## 2026-10-06 — Production release artifact completeness root fix [V11-RELEASE-ARTIFACT-HIDDEN-PINS]
- Post-green production-boundary audit corrected an authority-reading mistake: `f88ec808...` in the job setup log is the GitHub hosted-runner image provisioner commit, not the repository checkout. The source actually checked out, tested, and named in both uploaded artifacts is `3892bf6f0b922fc5130cf5dce4ed337a484993b7` from GitHub run `37326742206`.
- Root defect: `release:build` intentionally packages `.node-version` and `.nvmrc`, but the `Upload production release artifact` step used the action default `include-hidden-files: false`. A green pre-upload `release:verify` therefore did not prove the downloaded GitHub artifact still contained both runtime pins.
- Root fix: the production release upload now sets `include-hidden-files: true` only for the already manifest-verified bounded release directory. `rescue:github-ci:self-test` pins this requirement and the ordering `release:verify` -> upload.
- Production remains NOT APPROVED. Next: certify this CI-boundary change locally and in GitHub; only then resume RESCUE-02B final evidence and target-environment evidence/approval.
