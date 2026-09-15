# Wave 2 supersession note — 2026-09-15

This document remains valid evidence for the original foundation boundary. Wave 2 now closes the previously deferred runtime portion with an opt-in durable retry worker, claim-time allowlist revalidation, atomic rollback on claim races, and an explicit command retry API that re-arms/republishes the same FAILED/TIMED_OUT command identity. See `docs/wave-02-core-runtime-closure.md`. Automation remains operator-gated by `AUTOMATION_RUNTIME_ENABLED`.

---

# Module 11 Slice 11.12 — Automation Retry Dispatch Foundation Closure

## Status

Slice 11.12 is implemented and locally green at exact commit `2640f08`
(`feat(automation): bounded synchronous retry dispatch in telemetry
coordination (Slice 11.12)`). The immutable selection record remains
`docs/module-11-automation-retry-dispatch-foundation.md`. No runtime
activation, automation enablement, Module 12 activation, or production
deployment is granted by this closure.

## Local validation evidence

- Full Jest: 132 test suites, 941 tests — all passed.
- Build: `nest build` green.
- PostgreSQL integration (local PostgreSQL 16, isolated schema per run):
  11 suites, 45 tests — all passed, including the updated
  automation-telemetry-coordination suite wired with the real
  `AutomationRetryReservationService`.

## Closed implementation boundary

- `AutomationTelemetryCoordinator.coordinateCandidate` runs at most one
  synchronous retry pass after the initial dispatch finalizes FAILED or
  PARTIALLY_FAILED.
- The retry pass consults only persisted state through
  `AutomationRetryReservationService`: attempt count, allowlisted error code,
  and database-clock next-eligible time. It never re-evaluates the trigger,
  never creates a second execution row, and never touches cooldown state.
- The command idempotency key `automation:<executionId>:<actionId>` is
  unchanged across attempts; total attempts stay bounded at 3 with the
  deterministic 5s/15s backoff persisted in PostgreSQL.
- No worker, queue, scheduler, polling loop, telemetry ingestion change,
  public endpoint, or application runtime wiring exists.

## Machine-readable closure invariants

- CLOSURE_INVARIANT_SLICE1112_SCHEMA=1
- CLOSURE_INVARIANT_SLICE1112_IMPLEMENTED=true
- CLOSURE_INVARIANT_SLICE1112_RETRY_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1112_REEVALUATES_TRIGGER=false
- CLOSURE_INVARIANT_SLICE1112_IDEMPOTENCY_KEY_REUSED=true
- CLOSURE_INVARIANT_SLICE1112_MAX_DISPATCH_ATTEMPTS=3
- CLOSURE_INVARIANT_SLICE1112_WORKER_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1112_SCHEDULER_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1112_QUEUE_ACTIVE=false
- CLOSURE_INVARIANT_SLICE1112_DIRECT_MQTT_PUBLISH=false
- CLOSURE_INVARIANT_SLICE1112_AUTOMATION_ENABLED=false
- CLOSURE_INVARIANT_SLICE1112_PUBLIC_ENDPOINT_ACTIVATED=false
- CLOSURE_INVARIANT_SLICE1112_MODULE12_ACTIVATED=false
- CLOSURE_INVARIANT_SLICE1112_PRODUCTION_DEPLOYMENT_APPROVED=false

## Explicitly deferred

Runtime activation of retry (a worker or scheduler that invokes the dispatch
outside a telemetry coordination call), activation endpoint, Module 12
activation, and production deployment remain deferred to separately approved
checkpoints.
