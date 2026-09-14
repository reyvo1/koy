# Module 11 Slice 11.12 — Automation Retry Dispatch Selection

## Status

Selected after the local-green Slice 11.11 implementation commit `032b649`.
This checkpoint selects a bounded retry dispatch step inside the existing
telemetry coordination path. It does not activate automation, add a worker,
queue, scheduler, polling loop, or public endpoint, and does not approve
production deployment.

SELECTION_INVARIANT_SLICE1112_SCHEMA=1
SELECTION_INVARIANT_SLICE1112_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE1112_RETRY_ACTIVE=false
SELECTION_INVARIANT_SLICE1112_AUTOMATION_ENABLED=false
SELECTION_INVARIANT_SLICE1112_WORKER_ACTIVE=false
SELECTION_INVARIANT_SLICE1112_SCHEDULER_ACTIVE=false
SELECTION_INVARIANT_SLICE1112_QUEUE_ACTIVE=false
SELECTION_INVARIANT_SLICE1112_DIRECT_MQTT_PUBLISH=false
SELECTION_INVARIANT_SLICE1112_REEVALUATES_TRIGGER=false
SELECTION_INVARIANT_SLICE1112_IDEMPOTENCY_KEY_REUSED=true
SELECTION_INVARIANT_SLICE1112_MAX_DISPATCH_ATTEMPTS=3
SELECTION_INVARIANT_SLICE1112_MODULE12_ACTIVATED=false
SELECTION_INVARIANT_SLICE1112_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

A later implementation candidate may add only an internal, synchronous retry
dispatch step to `AutomationTelemetryCoordinator.coordinateCandidate`. It must:

1. run only when the just-dispatched execution finalized as FAILED or
   PARTIALLY_FAILED with exactly one FAILED action that is retry-eligible;
2. consult the persisted attempt count, allowlisted error code, and database
   clock next-eligible time through `AutomationRetryReservationService`;
3. never re-evaluate the trigger, never create a second execution row, and
   never touch cooldown bookkeeping;
4. preserve action order: the retried action stays at its position; later
   SKIPPED actions stay skipped until their predecessors succeed;
5. keep the command idempotency key `automation:<executionId>:<actionId>`
   unchanged across attempts;
6. bound total work: at most one retry pass per telemetry coordination call;
7. emit bounded structured events without payloads, credentials, topics, or
   secrets.

## Activation boundary

The retry dispatch step is internal to the coordinator. No worker, queue,
scheduler, polling loop, telemetry ingestion hook change, public endpoint, or
application runtime wiring is selected. Automation remains disabled.

## Explicit non-scope

No new schema or migration, no direct MQTT publication changes, no activation
endpoint, no frontend/mobile behavior, no Module 12 activation, no push
approval, and no production deployment approval.
