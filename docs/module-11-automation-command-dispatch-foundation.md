# Module 11 Slice 11.8 — Automation Command Dispatch Foundation

## Status

Selected after the remote-green Slice 11.7 closure commit
`035bdc5106b6ae58f9c5d84c742f419d45301d2b` from GitHub Actions run
`30913013664`.

This checkpoint selects the next bounded implementation slice. It does not yet
implement or activate command dispatch.

SELECTION_INVARIANT_SLICE118_SCHEMA=1
SELECTION_INVARIANT_SLICE118_IMPLEMENTED=false
SELECTION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false
SELECTION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false
SELECTION_INVARIANT_SLICE118_RETRY_ACTIVE=false
SELECTION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false
SELECTION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false
SELECTION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false

## Objective

Implement one internal, deterministic dispatcher boundary for an already
reserved automation execution. The dispatcher must:

1. accept only trusted `tenantId + executionId` identity;
2. claim the next persisted action through
   `AutomationExecutionTransitionRepository`;
3. preserve persisted action position order;
4. call the existing `CommandService.publish` boundary;
5. use `automationActionCommandIdempotencyKey(executionId, actionId)`, which must produce `automation:<executionId>:<actionId>`;
6. publish the exact one-capability payload
   `{ [capabilityKey]: value }`;
7. record success or failure through the transition repository;
8. stop after the first failed action;
9. produce bounded structured logs with literal event names.

## Command Identity and Failure Boundary

Direct MQTT publication is forbidden. The dispatcher must not inject
`MqttService` or publish to a topic itself.

Successful dispatch must bind the returned device-command identity. A failure
must preserve the deterministic action idempotency key and record a bounded
error code. When `CommandService` created a failed command before throwing, the
implementation must recover its identity through an approved command boundary
or an exact tenant-and-idempotency lookup; it must never guess or create a
second command.

No automatic retry is included. A future retry slice must reuse the exact same
action idempotency key and must be separately approved.

## Runtime Reachability Boundary

The service may be registered as an internal provider for focused and
integration testing, but this slice does not add:

- a telemetry subscriber or MQTT consumer;
- an evaluator coordinator;
- a worker, queue, scheduler, or polling loop;
- a public controller or endpoint;
- an automation enablement path;
- user-configurable cooldown;
- Module 12 activation;
- production deployment approval.

Normal automation writes remain `enabled=false`. No runtime path may invoke the
dispatcher until a later telemetry-coordination and activation gate is
implemented and explicitly approved.

## Required Proof

The implementation package must add:

- typed unit tests for success, idempotent replay, command rejection, publish
  failure, unexpected failure, and first-failure stop behavior;
- PostgreSQL integration proof binding command and action identities;
- a cross-slice audit over `CommandService`, MQTT publication, structured
  logging, execution transitions, and historical contracts;
- fail-fast source checks that reject direct MQTT publication, unstable
  idempotency keys, missing contract registration, or runtime activation.

## Explicit Non-Scope

This selection adds no application runtime, Prisma schema, migration, command,
MQTT publication, telemetry coordination, retry, activation endpoint, frontend,
mobile behavior, Scene, Module 12 activation, push approval, or production
deployment approval.
