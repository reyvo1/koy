# Module 11 Slice 11.9 — Automation Telemetry Coordination Foundation Implementation

## Status

Implemented as an internal, runtime-inactive foundation after the remote-green
selection commit `5781c65014c24fb5498b02fb611eaf885eea2c85` from GitHub
Actions run `30971468421`.

IMPLEMENTATION_INVARIANT_SLICE119_SCHEMA=1
IMPLEMENTATION_INVARIANT_SLICE119_IMPLEMENTED=true
IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE119_AUTOMATION_DEFAULT_ENABLED=false
IMPLEMENTATION_INVARIANT_SLICE119_RUNTIME_REACHABLE=false
IMPLEMENTATION_INVARIANT_SLICE119_TELEMETRY_SERVICE_WIRED=false
IMPLEMENTATION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false
IMPLEMENTATION_INVARIANT_SLICE119_DIRECT_COMMAND_PUBLICATION=false
IMPLEMENTATION_INVARIANT_SLICE119_PROCESS_LOCAL_AUTHORITY=false
IMPLEMENTATION_INVARIANT_SLICE119_RETRY_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE119_PUBLIC_ENDPOINT_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false
IMPLEMENTATION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false

## Implemented Boundary

`AutomationTelemetryCoordinator` accepts one exact typed internal envelope for
an already persisted telemetry record. It validates tenant, telemetry, device,
event, persisted occurrence time, explicit origin classification, bounded
ancestry, and a bounded exact set of primitive capability reports before any
automation lookup.

`AutomationRuntimeReadRepository` is the PostgreSQL-authoritative internal read
boundary. It:

1. verifies that the envelope exactly matches the persisted telemetry row and
   reportable capability identities;
2. loads only enabled candidate automations for the exact tenant, trigger
   device, and trigger capability;
3. reconstructs and validates the current persisted definition;
4. extracts only condition targets that require latest values;
5. loads each required latest primitive value deterministically by
   `createdAt DESC, id DESC`.

Candidate and report processing is deterministic and bounded. A failure in one
candidate is recorded with a normalized error code and does not prevent later
candidates from being evaluated.

## Evaluation and Reservation Transition

The existing evaluator preview behavior remains fail-closed for enabled
candidates. This slice adds explicit `APPROVED_RUNTIME` evaluation mode for the
internal coordinator. In that mode, disabled candidates are rejected and only
persisted enabled candidates may produce a condition match. The evaluator
remains pure and has no Prisma, MQTT, command, or telemetry side effects.

A match is passed only to
`AutomationExecutionRepository.reserveMatchedExecution`. PostgreSQL remains the
authority for exact execution identity, replay, cooldown, ancestry suppression,
and immutable action snapshots. The coordinator calls
`AutomationCommandDispatcher.dispatchExecution` only when the persisted
execution status is `RESERVED` or `DISPATCHING`. Suppressed and already terminal
replays are never dispatched again.

## Runtime Reachability

The coordinator and runtime read repository are registered only as internal
`AutomationModule` providers. They are not exported and are not wired into
`TelemetryService`, MQTT webhook controllers, a subscriber, worker, queue,
scheduler, polling loop, or public controller.

Normal owner automation writes remain `enabled=false`. Tests may explicitly
mark isolated fixtures enabled to prove the future runtime composition, but this
slice adds no activation API and no production runtime entry point.

## Safety and Observability

Structured logs use literal event names and bounded identity/count fields. Raw
telemetry payloads, credentials, MQTT topics, headers, and exception objects are
not logged. No process-local map, Redis key, retry loop, direct MQTT dependency,
or direct command publication is introduced.

The validation profile is risk-based: cheap source, lifecycle, type-shape,
structured logging, and focused tests run before Prisma/build and PostgreSQL
integration. Because this slice adds runtime orchestration and PostgreSQL read
behavior, database integration, full Jest, and historical transition proof
remain mandatory.

## Explicit Non-Scope

This slice adds no telemetry subscriber, `TelemetryService` hook, MQTT consumer,
worker, queue, scheduler, polling loop, retry, user activation endpoint, public
API, controller, Prisma schema, migration, Redis authority, frontend, mobile
behavior, Scene, Module 12 activation, push approval, or production deployment
approval.
