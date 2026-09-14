# Module 11 Slice 11.9 — Automation Telemetry Coordination Foundation Selection

## Status

Selected after the remote-green Slice 11.8 closure commit
`89c75d62c25290b20c635490d9e5faf617d429ac` from CI run
`30968372456`.

This checkpoint selects the next bounded implementation slice. It does not yet
implement or activate telemetry coordination.

SELECTION_INVARIANT_SLICE119_SCHEMA=1
SELECTION_INVARIANT_SLICE119_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false
SELECTION_INVARIANT_SLICE119_AUTOMATION_ENABLED=false
SELECTION_INVARIANT_SLICE119_DISPATCH_RUNTIME_REACHABLE=false
SELECTION_INVARIANT_SLICE119_RETRY_ACTIVE=false
SELECTION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false
SELECTION_INVARIANT_SLICE119_PUBLIC_ENDPOINT_ACTIVE=false
SELECTION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false
SELECTION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

Define one internal deterministic coordinator boundary for trusted persisted
telemetry evidence. A later implementation candidate must:

1. accept only a typed internal envelope containing exact tenant, telemetry,
   device, event, occurrence-time, capability report, and bounded ancestry
   identity;
2. treat an empty ancestry as valid only for an externally originated telemetry
   envelope explicitly classified by the trusted caller;
3. load candidate automation revisions through a tenant-bound PostgreSQL read
   boundary using exact trigger device and capability identity;
4. load only the latest capability values required by each candidate condition;
5. process capability reports and candidate automations in deterministic order;
6. invoke only `AutomationEvaluator.evaluate` for condition decisions;
7. invoke only `AutomationExecutionRepository.reserveMatchedExecution` for
   execution identity, cooldown, idempotency, and loop-suppression decisions;
8. invoke only `AutomationCommandDispatcher.dispatchExecution` when persisted
   reservation state proves dispatch is required;
9. preserve replay safety so duplicate telemetry cannot create a second
   execution or command;
10. emit bounded structured logs with literal event names and no raw telemetry
    payloads, credentials, MQTT topics, or secrets.

## Trust and Persistence Boundary

The coordinator must not parse MQTT topics, authenticate webhook requests, or
persist telemetry. `TelemetryService.ingest` remains the authority that validates
and commits telemetry before any future coordination call.

The coordinator must not query owner-facing automation APIs. Runtime candidate
and latest-value reads require a dedicated tenant-bound internal repository
boundary. PostgreSQL remains authoritative; Redis and process-local maps must
not become execution, cooldown, idempotency, replay, or loop-prevention truth.

## Runtime Reachability Boundary

The future service may be registered as an internal provider for focused and
integration testing, but this selected slice does not authorize wiring it into
`TelemetryService`, either MQTT webhook controller, a subscriber, worker, queue,
scheduler, polling loop, or public endpoint.

Normal automation writes remain `enabled=false`. The existing dispatcher remains
runtime-unreachable. Retry, runtime activation, provenance propagation for
internally generated events, Module 12, and production deployment require
separate explicit gates.

## Required Implementation Proof

The implementation package must add:

- typed unit tests for deterministic ordering, no-candidate behavior,
  not-matched behavior, matched reservation, suppressed outcomes, replay, and
  first-failure isolation;
- PostgreSQL integration proof for tenant isolation, exact trigger lookup,
  latest-value lookup, execution replay, cooldown, ancestry suppression, and
  dispatcher handoff;
- a cross-slice audit over telemetry persistence, evaluator input,
  execution reservation, action transitions, command dispatch, structured
  logging, and historical contracts;
- fail-fast source checks that reject direct MQTT subscription, direct command
  publication, process-local authority, public reachability, retry, or runtime
  activation.

## Explicit Non-Scope

This selection adds no application runtime, Prisma schema, migration, telemetry
subscriber, coordinator implementation, automation enablement, command,
MQTT publication, retry, public API, frontend, mobile behavior, Scene, Module 12
activation, push approval, or production deployment approval.
