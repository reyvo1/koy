# Wave 2 — Core Runtime Closure

Status: implementation + source-level QA + authoritative seal complete; operator lightweight gate and GitHub heavy acceptance pending, not yet pushed.

## Objective

Close runtime gaps left intentionally behind the 30-module foundation without expanding into provider, CCTV, AI, payment or hardware work reserved for later waves.

## Scope

### Automation delayed retry runtime

- Add an opt-in bounded retry worker behind `AUTOMATION_RUNTIME_ENABLED`.
- Scan only persisted retry-eligible actions; PostgreSQL state/database time remains authoritative.
- Claim retries atomically. Any execution/action claim race must roll back the whole transaction.
- Re-check retry error allowlist at claim time.
- Preserve execution/action identity and the existing command idempotency key.
- Re-arm only FAILED/TIMED_OUT durable commands and republish the same `correlationId`; public idempotent replay semantics remain replay-only.
- Restore only later actions deterministically skipped with `PRIOR_ACTION_FAILED` after their failed predecessor is successfully claimed.

### Scheduler activation safety

- Existing scheduler worker remains the execution runtime.
- Enabling a schedule is rejected while `SCHEDULER_RUNTIME_ENABLED` is false.
- Disabling remains allowed while runtime is off.
- `enabled` must be a real boolean; string coercion is rejected.

### Notification delivery runtime

- Add durable `DELIVERING` state with lease id/time.
- Bounded worker claims due PENDING rows and recovers stale leases.
- Multi-instance workers use conditional claims; stale/foreign lease completion is rejected.
- Retry timing uses PostgreSQL clock.
- Retry only explicit transient failures: timeout/unreachable and HTTP 408/425/429/5xx. Terminal/unknown errors do not retry.
- Idempotent enqueue detects semantic collision rather than silently replaying a different payload under the same key; concurrent P2002 races resolve to the same durable notification when payloads agree.
- Webhook and email relay requests carry stable notification idempotency identifiers.
- Auth verification/reset token senders enqueue real EMAIL notifications instead of no-op calls.
- Provider-neutral email relay is HTTPS-only with bounded timeout and separate bearer credential. Provider-specific adapters remain Wave 8.

## Schema change

Migration `20260915010000_wave2_notification_delivery_runtime` adds:

- `NotificationStatus.DELIVERING`
- `notifications.deliveryLeaseId`
- `notifications.deliveryLeaseAt`
- index on `(status, deliveryLeaseAt)`

No destructive column/table changes are introduced.

## Runtime configuration

Wave 2 keeps Notification delivery fail-closed by default:

- `NOTIFICATION_RUNTIME_ENABLED=false`
- `NOTIFICATION_CLAIM_TIMEOUT_MS=60000`
- `EMAIL_RELAY_TIMEOUT_MS=10000`
- `EMAIL_RELAY_URL`, `EMAIL_RELAY_TOKEN`, `EMAIL_FROM` are required only when Notification runtime is enabled.

Email relay URL must be credential-free HTTPS. Production secret placeholder checks include `EMAIL_RELAY_TOKEN`.

## Local gate

`npm run wave2:prepush:check`

This performs the inherited Wave 1 lightweight gate, Wave 2 source invariant self-test, a Prisma wrapper self-test, Prisma validate/generate, and targeted Wave 2 Jest tests. When the operator shell does not define `DATABASE_URL`, the Prisma wrapper supplies a deterministic schema-only PostgreSQL URL on port 1 solely so Prisma can parse the datasource during `validate`/`generate`; it does not claim or require a live database. A caller-provided `DATABASE_URL` is preserved unchanged. Docker/PostgreSQL/Redis/real EMQX/full acceptance remain GitHub-only.

## GitHub exit gate

Both the core `test` job and `rescue-live-emqx` explicitly run `wave2:core-runtime:self-test` before their heavy runtime/build stages. The core PostgreSQL integration suite now also contains Wave 2 runtime evidence: durable automation retry/re-publish identity and multi-client Notification lease/retry delivery through a real local HTTPS receiver. The live rescue job continues to prove the real EMQX protocol/auth/ACL path.

Wave 2 is not closed until the single Wave 2 push is green on the repository's heavy CI/full acceptance. `rescue:validate` or source invariants alone are never sufficient closure evidence. Evidence tiers and minimum claims are defined in `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md`. A red run stays in Wave 2; related failures are fixed as one class before the next push.

## Source seal

- Authoritative Wave 2 V5 repository tree: 1033 source paths.
- Authoritative Wave 2 V5 baseline manifest: 1034 entries (1033 sealed source paths plus `repository-tree.txt`).
- The seal preserves four V13 authoritative files that exist in the owner/GitHub checkout but are absent from the chat source snapshot; the package preflight requires those files before any copy occurs.
- Dependency-free source QA is complete; operator-side Prisma validate/generate and targeted Jest remain prerequisites inside `wave2:prepush:check`. The Prisma local fallback is schema-only evidence and does not replace GitHub PostgreSQL integration.


## V5 local tooling-env correction

The V4 operator gate reached Prisma after all inherited Wave 1 checks, rescue validation (281/281), broker-smoke self-test, CI self-test and Wave 2 source invariants passed. `prisma validate` then stopped with `P1012 Environment variable not found: DATABASE_URL`. That is a local tooling environment defect, not a Prisma schema or runtime failure.

V5 replaces the direct `prisma validate && prisma generate` package command with `scripts/check-prisma-schema.mjs`. The wrapper preserves any real caller-provided `DATABASE_URL`; when absent, it injects a deterministic loopback port-1 schema-only URL for the two non-runtime Prisma commands. The companion self-test proves fallback selection, explicit URL preservation, blank-value handling, and exact `validate` then `generate` subprocess order. GitHub continues to use its real PostgreSQL 16 service and `TEST_DATABASE_URL` for migration and integration evidence; the fallback cannot close any runtime evidence tier.

## V6 TypeScript contract closure

The V5 local gate reached real targeted Jest compilation after Prisma validate/generate passed. Two compile-time contract drifts were exposed and are closed as one class in V6:

- command retry observability now declares `retry_replay`, `retry_raced`, and `retry_claimed` in `CommandMetricEvent` and verifies their Prometheus output;
- notification durable-claim parameters are explicitly numeric, preventing `as const` defaults from narrowing runtime configuration values to literal-only types.

The targeted Wave 2 suite now includes `src/metrics/metrics.service.spec.ts`. Runtime behavior, retry policy, leases, database schema, and broker behavior are unchanged.

V6 package QA passed the dependency-free invariants, retry metric compile contract, changed-file transpile checks, and an end-to-end synthetic recovery from a valid V5 `1033/1034` state. Operator targeted Jest remains the next required local evidence before the single Wave 2 GitHub push.

---

## Wave 2 V7 — first GitHub heavy-integration correction

The first Wave 2 GitHub heavy run after V6 proved broad regression stability before stopping in the PostgreSQL integration stage: `185/185` unit suites (`1219/1219` tests) passed, the application E2E smoke passed `4/4`, and `13/15` database integration suites passed. `rescue-live-emqx` did not run because it is sequenced after the core job.

Two related Wave 2 integration defects were exposed and are fixed together in V7:

1. **Automation retry DB transition shape.** A FAILED automation action legitimately carries the terminal `commandId`, but the PostgreSQL transition constraint requires `commandId IS NULL` while the action is back in `DISPATCHING`. The retry claim now clears that terminal link and refreshes `dispatchStartedAt` from the PostgreSQL clock. The dispatcher then reattaches the same durable DeviceCommand after `retryPublish()` resolves through the unchanged automation idempotency key/correlation identity. This preserves retry identity while satisfying the real database state machine.
2. **Notification integration adapter contract.** `ClaimedNotificationDelivery` is a lease DTO with field `id`, while `NotificationTransportInput` intentionally requires `notificationId`. Production worker code already performs this mapping. The integration evidence now uses the same explicit adapter instead of passing the claim DTO directly to the transport. No production transport contract is weakened.

V7 adds source guards for both contracts and keeps the authoritative Wave 2 seal count at `1033/1034` (modified files only; no new source path). Wave 2 remains ACTIVE until the recovery is locally validated and a corrective GitHub run passes PostgreSQL/HTTPS integration, then real EMQX/full acceptance.

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



## V9 root-cause closure — shared outbound HTTPS transport

GitHub V8 proved that the remaining Notification failures were all collapsed to `WEBHOOK_UNREACHABLE`. The prior transport design used global `fetch` plus a process-global TLS bypass in integration evidence, and flattened TLS/socket causes into one generic code. That made failures non-diagnostic and allowed the same class to reappear on adjacent outbound channels.

V9 replaces that foundation instead of patching the harness:

- `NotificationHttpsClient` is the single outbound HTTPS implementation for both Webhook and Email Relay.
- Production TLS verification is always enabled. Integration evidence trusts only the checked-in fixture CA through an isolated client instance; `NODE_TLS_REJECT_UNAUTHORIZED=0` is forbidden.
- The client enforces an absolute request deadline and classifies `TIMEOUT`, `TLS`, and `NETWORK` separately while preserving the low-level cause code.
- Webhook/Email transports map those classes to stable durable error codes. TLS trust failures are terminal because retry cannot repair certificate configuration.
- Local targeted tests exercise real HTTPS success, untrusted-certificate rejection, absolute timeout, and connect failure before any push.
- PostgreSQL integration exercises both Webhook and Email Relay over the same real HTTPS client.

Wave 2 is **CLOSED GREEN** after the V9 corrective push passed the full GitHub core job and downstream real-EMQX/full acceptance. The "Wave 2 remains ACTIVE" wording that previously closed this document is superseded.

## Machine-readable closure invariants

<!-- CLOSURE_INVARIANT:START -->
CLOSURE_INVARIANT_WAVE_2_CORE_RUNTIME_CLOSURE_SCHEMA=1
CLOSURE_INVARIANT_WAVE_2_CORE_RUNTIME_CLOSURE_CLOSED=true
CLOSURE_INVARIANT_WAVE_2_NOTIFICATION_DELIVERY_RUNTIME_ACTIVATED=false
CLOSURE_INVARIANT_WAVE_2_AUTOMATION_RETRY_RUNTIME_ACTIVATED=false
CLOSURE_INVARIANT_WAVE_2_SCHEDULER_RUNTIME_ACTIVATED=false
CLOSURE_INVARIANT_WAVE_2_PROVIDER_EMAIL_ADAPTERS_IMPLEMENTED=false
CLOSURE_INVARIANT_WAVE_2_PRODUCTION_DEPLOYMENT_APPROVED=false
CLOSURE_INVARIANT_WAVE_2_PHYSICAL_HARDWARE_PROVEN=false
<!-- CLOSURE_INVARIANT:END -->

The runtime capabilities described above are implemented and source-validated, but each stays
opt-in behind its own `*_RUNTIME_ENABLED` flag, which is `false` by default. "CLOSED GREEN" is a
claim about Wave 2's own exit criteria only. It is not a production approval, not a claim that
notification or retry delivery has ever run in production, and not a claim that any physical
board was exercised.

