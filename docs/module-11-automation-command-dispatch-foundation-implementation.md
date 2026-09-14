# Module 11 Slice 11.8 — Automation Command Dispatch Foundation Implementation

## Status

Implemented as an internal and inactive provider after the remote-green Slice
11.8 selection commit
`9ee57b6614fa3d673180c8cf9cde8278c2144308` from GitHub Actions run
`83875019767`.

IMPLEMENTATION_INVARIANT_SLICE118_SCHEMA=1
IMPLEMENTATION_INVARIANT_SLICE118_IMPLEMENTED=true
IMPLEMENTATION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE118_DIRECT_MQTT_PUBLISH=false
IMPLEMENTATION_INVARIANT_SLICE118_RETRY_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE118_PUBLIC_ENDPOINT_ACTIVE=false
IMPLEMENTATION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false
IMPLEMENTATION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false
IMPLEMENTATION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false

## Implemented Boundary

`AutomationCommandDispatcher` accepts only trusted `tenantId + executionId`
identity. It repeatedly claims the next persisted action through
`AutomationExecutionTransitionRepository`, preserving the database-defined
position order and the single-active-action invariant.

Each claimed `DEVICE_COMMAND` action is sent only through
`CommandService.publish` with:

- the persisted tenant and device identity;
- the exact one-capability payload `{ [capabilityKey]: value }`;
- deterministic idempotency key
  `automation:<executionId>:<actionId>`.

A command in `SENT` or `ACKNOWLEDGED` state is recorded as action success. A
command in `FAILED` or `TIMED_OUT` state is recorded as action failure. When
`CommandService` creates a failed command before throwing, the dispatcher
recovers its identity only through the tenant-bound
`CommandService.findTenantDeviceCommandByIdempotencyKey` boundary. It never
guesses a command ID and never creates a replacement command.

The dispatcher stops immediately after the first failed action. Remaining
persisted actions are finalized by the transition repository as `SKIPPED` with
`PRIOR_ACTION_FAILED`.

## Replay and Fail-Closed Behavior

A replay of an already claimed action reuses the exact deterministic command
idempotency key. Existing successful terminal command evidence completes the
action without a second MQTT publication. Existing failed or timed-out command
evidence binds the action failure. A non-terminal replayed command fails closed
without attaching an invalid command relation.

Unexpected errors are normalized to the bounded invariant code
`AUTOMATION_COMMAND_DISPATCH_UNEXPECTED`. Domain command errors preserve their
machine-readable error code when it satisfies the transition error-code shape.

## Runtime Reachability Boundary

The dispatcher is registered only as an internal Nest provider. This
implementation adds no telemetry subscriber, MQTT consumer, evaluator
coordinator, worker, queue, scheduler, polling loop, controller, endpoint,
automation enablement path, or retry mechanism.

`AutomationModule` imports `DeviceModule` only to receive the existing
`CommandService` boundary. The dispatcher does not import or inject
`MqttService` and does not construct an MQTT topic.

## Proof Boundary

The implementation includes:

- typed unit proof for success, replay, command rejection, publish failure,
  unexpected failure, non-terminal fail-closed behavior, timed-out command
  binding, ordered continuation, and first-failure stop behavior;
- `CommandService` tenant-bound idempotency lookup proof;
- transition proof accepting `TIMED_OUT` as terminal failed-command evidence;
- PostgreSQL integration proof for successful command/action identity binding
  and failed-command recovery;
- structured-log literal event proof;
- dependency-free source guards rejecting direct MQTT publication, unstable
  idempotency, missing provider wiring, missing tests, contract-policy drift,
  or runtime activation.

## Explicit Non-Scope

This implementation does not add Prisma schema or migration changes, direct
MQTT publication, telemetry coordination, retry, runtime activation, frontend
or mobile behavior, Scene, Module 12 activation, push approval, or production
deployment approval.
