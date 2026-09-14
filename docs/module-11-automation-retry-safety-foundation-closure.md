# Module 11 Slice 11.10 — Automation Retry Safety Foundation Implementation Closure

## Status

Slice 11.10 is implemented and locally green at exact commit `024acda`
(`feat(automation): implement bounded retry safety foundation (Slice 11.10)`).
The immutable selection record remains
`docs/module-11-automation-retry-safety-foundation.md`. No runtime activation,
automation enablement, or production deployment is granted by this closure.

## Local validation evidence (exact machine state)

- Full Jest: 132 test suites, 936 tests — all passed.
- PostgreSQL 16.14 (local Windows service, localhost:5432): `prisma migrate deploy`
  applied all 20 migrations to database `iot`; columns
  `automation_execution_actions.dispatchAttemptCount` and
  `automation_execution_actions.retryNextEligibleAt` verified present.
- Database integration suite: 11 suites, 45 tests — all passed against the
  migrated local PostgreSQL.

## Implemented boundary

- `AutomationRetryReservationService` (internal provider of `AutomationModule`):
  - `evaluateFailedAction` — decides `RETRY_SCHEDULED` vs `TERMINAL_FAILURE`
    from persisted state only; fails closed on missing, conflicting, or
    out-of-range persisted attempt evidence.
  - `claimEligibleRetry` — transactionally resets a FAILED execution/action to
    DISPATCHING for exactly one more attempt only after the persisted
    `retryNextEligibleAt` (database clock) passes and the attempt budget allows.
- Persisted policy: max 3 total dispatch attempts; deterministic backoff
  5s after attempt 1, 15s after attempt 2.
- Retryable error codes are allowlisted
  (`COMMAND_PUBLISH_FAILED`,
  `AUTOMATION_COMMAND_DISPATCH_COMMAND_TIMED_OUT`,
  `AUTOMATION_EXECUTION_UNEXPECTED`-class transient codes). Unknown, validation,
  capability, authorization, and contract errors stay terminal.
- Command idempotency key `automation:<executionId>:<actionId>` is derived,
  never stored or altered across attempts.
- Migration
  `20260822010000_module_11_automation_retry_safety_foundation` adds the two
  columns plus a shape CHECK (1..3 attempts; eligibility time required once the
  count exceeds 1).

## Machine-readable closure invariants

- CLOSURE_INVARIANT_SLICE1110_SCHEMA=1
- CLOSURE_INVARIANT_SLICE1110_IMPLEMENTED=true
- CLOSURE_INVARIANT_SLICE1110_IDEMPOTENCY_KEY_REUSED=true
- CLOSURE_INVARIANT_SLICE1110_MAX_DISPATCH_ATTEMPTS=3
- CLOSURE_INVARIANT_SLICE1110_UNKNOWN_ERRORS_RETRYABLE=false
- CLOSURE_INVARIANT_SLICE1110_WORKER_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1110_SCHEDULER_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1110_QUEUE_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false
- CLOSURE_INVARIANT_SLICE1110_AUTOMATION_ENABLED=false
- CLOSURE_INVARIANT_SLICE1110_PUBLIC_ENDPOINT_ACTIVATED=false
- CLOSURE_INVARIANT_SLICE1110_MODULE12_ACTIVATED=false
- CLOSURE_INVARIANT_SLICE1110_PRODUCTION_DEPLOYMENT_APPROVED=false

## Explicitly deferred

No retry trigger loop, worker, scheduler, queue, telemetry hook, activation
endpoint, Module 12 activation, or production deployment is approved or wired by
this closure.
