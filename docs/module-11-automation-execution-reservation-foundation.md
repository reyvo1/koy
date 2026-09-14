# Module 11 Slice 11.5 - Automation Execution Reservation Foundation

## Status

This is the binding implementation record for the owner-approved Slice 11.5 candidate selected after the remote-green Slice 11.4 closure commit `e9112d25852dafb90bb21db6748de9c09efbf1c4` in GitHub Actions run `30812751919`.

That exact closure run passed 117 Jest suites and 826 tests, production release verification, and production startup smoke. Artifact `8855519562` was uploaded with SHA-256 `ccc65d493f19839ba0d77486bda7a700fe51ee9aa13837a0dcd9e8fd668eea86`.

This slice introduces persistence and repository foundations only. It does not subscribe to telemetry, evaluate conditions, dispatch commands, configure or reserve cooldown, activate automation, or approve production deployment.

## Objective

Persist one tenant-bound automation execution reservation for one accepted telemetry record and one exact automation revision while preserving the Slice 11.4 runtime safety contract:

- deterministic canonical identity;
- database-enforced replay safety;
- immutable trigger and action evidence;
- bounded ancestry verification;
- auditable loop suppression;
- restrictive tenant-bound foreign keys;
- no runtime side effects.

## Canonical Reservation Identity

The database unique boundary is:

`tenantId + automationId + automationRevision + triggerTelemetryId`

A concurrent or repeated request using the same tuple and equivalent immutable evidence returns the existing execution as `REPLAYED`. The same tuple with different trigger value, event identity, timestamp, ancestry, or action intent fails closed with `AUTOMATION_EXECUTION_IDEMPOTENCY_CONFLICT`.

No process-local map, random retry key, MQTT delivery count, or Redis key is authoritative.

## Trusted Evidence Validation

`AutomationExecutionRepository.reserveMatchedExecution` is an internal persistence boundary. Before reservation it requires:

1. a tenant-scoped automation with the exact revision and `enabled=true`;
2. trigger device, capability ID, and capability key matching that revision;
3. an accepted tenant-scoped telemetry row matching telemetry ID, event ID, device, database timestamp, capability key, and normalized primitive value;
4. evaluator action intents matching the persisted ordered automation actions exactly;
5. a bounded ancestry array containing at most 16 exact execution identities.

The existing automation write repository continues to force `enabled=false`. This slice adds no activation API or public method capable of enabling an automation. The isolated PostgreSQL integration test may set `enabled=true` directly inside its disposable test schema only to prove the future internal reservation boundary.

## Persistence Model

`AutomationExecution` stores:

- tenant and automation identity;
- exact automation revision;
- accepted telemetry and normalized event identity;
- trigger device, capability ID, capability key, value, and database timestamp;
- bounded ancestry;
- initial execution status and decision reason;
- database-created audit timestamp.

`AutomationExecutionAction` stores the immutable ordered action snapshot:

- action ID and position;
- action kind;
- tenant-bound device and capability identity;
- capability key and primitive value;
- initial action status;
- optional future command identity and bounded error code fields.

Execution-owned actions cascade only with their execution. Automation, telemetry, device, capability, and command evidence use restrictive foreign keys.

## Initial State Semantics

A matched reservation starts as:

- execution: `RESERVED`;
- actions: `PENDING`;
- decision reason: `CONDITION_MATCHED`.

A valid ancestry cycle, duplicate ancestry identity, or unverified tenant-scoped ancestry is persisted fail-closed as:

- execution: `SUPPRESSED_LOOP`;
- actions: `SKIPPED`;
- bounded reason: `ANCESTRY_CONTAINS_AUTOMATION`, `ANCESTRY_DUPLICATE`, or `ANCESTRY_UNVERIFIED`.

Malformed or over-limit envelopes are rejected before persistence.

## Test Boundary

The candidate includes:

- focused repository tests for reservation, loop suppression, action mismatch, idempotent replay, and replay conflict;
- PostgreSQL integration coverage for concurrent canonical reservation, immutable conflict detection, loop suppression, disabled automation rejection, telemetry mismatch, and restrictive evidence references;
- a stable repository contract registered in the historical transition-safety policy;
- the official validation profile with formatter, lint, focused tests, lifecycle validation, Prisma validation and generation, build, Full Jest, and historical-transition matrix gates.

The standard CI database-integration job remains the authoritative PostgreSQL proof after push.

## Explicit Non-Scope

This slice adds no HTTP controller, API, telemetry subscriber, MQTT consumer, coordinator, worker, queue, scheduler, evaluator invocation, `CommandService` invocation, device command creation, direct MQTT publication, Redis state, cooldown configuration, cooldown reservation, dispatch transition method, retry policy, activation endpoint, frontend, mobile behavior, Module 12 activation, push approval, or production deployment approval.

Every production automation remains unreachable by runtime because the approved write boundary still persists `enabled=false` and no activation surface exists.

Production deployment remains **NOT APPROVED**.
