# Module 11 Slice 11.10 — Automation Retry Safety Foundation Selection

## Status

Selected together with the remote-green Slice 11.9 closure at exact commit
`7de76596c6c1d52bd725406f3fad381cc62aedaf` / CI run `30983551478`.

This checkpoint selects a bounded retry safety contract. It does not implement or activate retry.
The previous activation-preparation candidate is VOID and is not a source of truth.

SELECTION_INVARIANT_SLICE1110_SCHEMA=1
SELECTION_INVARIANT_SLICE1110_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=false
SELECTION_INVARIANT_SLICE1110_AUTOMATION_ENABLED=false
SELECTION_INVARIANT_SLICE1110_COORDINATOR_RUNTIME_REACHABLE=false
SELECTION_INVARIANT_SLICE1110_WORKER_ACTIVE=false
SELECTION_INVARIANT_SLICE1110_SCHEDULER_ACTIVE=false
SELECTION_INVARIANT_SLICE1110_QUEUE_ACTIVE=false
SELECTION_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false
SELECTION_INVARIANT_SLICE1110_IDEMPOTENCY_KEY_REUSED=true
SELECTION_INVARIANT_SLICE1110_MAX_DISPATCH_ATTEMPTS=3
SELECTION_INVARIANT_SLICE1110_UNKNOWN_ERRORS_RETRYABLE=false
SELECTION_INVARIANT_SLICE1110_MODULE12_ACTIVATED=false
SELECTION_INVARIANT_SLICE1110_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

A later implementation candidate may add only an internal PostgreSQL-authoritative retry reservation foundation for failed automation actions. It must:

1. preserve the exact command idempotency key `automation:<executionId>:<actionId>` across every attempt;
2. permit at most three total dispatch attempts, including the initial attempt;
3. use persisted attempt state and persisted next-eligible time; process-local timers, Redis-only state, and MQTT delivery count are not authoritative;
4. retry only explicit allowlisted transient failures; unknown, validation, capability, authorization, and contract errors remain non-retryable;
5. preserve action order and never retry succeeded, skipped, suppressed, or replayed work;
6. use deterministic bounded backoff derived from the persisted attempt index;
7. keep telemetry evaluation separate: retry must not re-evaluate the trigger or create a second execution;
8. reuse the existing transition repository and `CommandService`; direct MQTT publication remains forbidden;
9. emit bounded structured events without payloads, credentials, topics, or secrets;
10. fail closed when persisted retry evidence is missing, conflicting, exhausted, or outside the tenant boundary.

## Activation boundary

The future retry service may be internal for focused and PostgreSQL integration tests, but no worker,
queue, scheduler, polling loop, telemetry hook, public endpoint, or application runtime wiring is selected.
Automation remains disabled. Runtime activation requires a separate approval, audit, rollback plan, and checklist.

## Validation profile

This combined closure/selection checkpoint uses Risk Profile A because it changes documentation,
lifecycle metadata, contracts, and guards only.

- Database integration: `NOT_APPLICABLE` — no schema, migration, repository, or DB runtime change.
- Prisma generation/build: `NOT_APPLICABLE` — no runtime or generated-code change.
- Android device proof: `NOT_APPLICABLE` — no mobile/native/API-contract change.
- Full Jest locally: `NOT_APPLICABLE` — focused contracts plus historical-transition matrix are mandatory; full CI remains mandatory before CLOSED.

## Explicit non-scope

No retry implementation, schema, migration, worker, scheduler, queue, direct MQTT publication,
coordinator activation, automation enablement, public API, frontend/mobile behavior, Module 12,
push approval, or production deployment approval is included.
