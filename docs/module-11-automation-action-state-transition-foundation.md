# Module 11 Slice 11.7 — Automation Action-State Transition Foundation

## Status

Selected after remote-green Slice 11.6 closure commit `4fcdaf1eec4f9e5b6899459baa326c409e7fcf53` from GitHub Actions run `30880293865`.

This slice adds a PostgreSQL-authoritative repository foundation for forward-only automation execution and action-state transitions. It does not subscribe to telemetry, coordinate evaluation, call `CommandService`, publish MQTT commands, retry work, activate automations, activate Module 12, or approve production deployment.

## Transition Boundary

The transition repository serializes every state mutation per `tenantId + executionId` with a PostgreSQL transaction-scoped advisory lock. It uses `clock_timestamp()` for dispatch and completion timestamps.

Supported operations are:

1. claim the next persisted `PENDING` action in position order;
2. replay the already active `DISPATCHING` action without advancing concurrently;
3. record a dispatch success and bind the deterministic device-command identity;
4. record a dispatch failure, skip all later pending actions, and finalize the execution;
5. replay equivalent terminal evidence and reject conflicting replays.

## Forward-Only State Rules

Execution transitions:

- `RESERVED` → `DISPATCHING`;
- `DISPATCHING` → `SUCCEEDED`;
- `DISPATCHING` → `FAILED`;
- `DISPATCHING` → `PARTIALLY_FAILED`.

Action transitions:

- `PENDING` → `DISPATCHING`;
- `DISPATCHING` → `SUCCEEDED`;
- `DISPATCHING` → `FAILED`;
- later `PENDING` actions → `SKIPPED` after the first failure.

`SUPPRESSED_COOLDOWN`, `SUPPRESSED_LOOP`, `SUCCEEDED`, `FAILED`, and `PARTIALLY_FAILED` executions are terminal. Terminal records are replayable only when their immutable command or error evidence is equivalent.

## Sequential Ordering

Only one action may be `DISPATCHING` for an execution. An action may be claimed only when every earlier action is `SUCCEEDED`. Concurrent claims are serialized and return one applied claim plus idempotent replays of the same active action.

## Command Identity Boundary

This slice does not create or publish commands. When a future dispatcher supplies an existing command identity, the transition repository verifies:

- the command belongs to the same tenant and target device;
- the command uses the deterministic idempotency key `automation:<executionId>:<actionId>`;
- successful actions bind only `SENT` or `ACKNOWLEDGED` commands;
- failed actions bind only `FAILED` commands. A later command timeout does not move an already successful dispatch backward.

Direct MQTT publication remains forbidden. Future dispatch must call the existing `CommandService`.

## Database Audit Shape

The migration adds `dispatchStartedAt` and `completedAt` to execution and action records. PostgreSQL check constraints enforce timestamp, command, and error-code consistency for each state. Suppressed actions are terminal `SKIPPED` records with bounded error evidence and database-authored completion timestamps.

## Structured Logging Invariant

ACTION_TRANSITION_STRUCTURED_LOG_LITERAL_EVENTS=true
ACTION_TRANSITION_STRUCTURED_LOG_GATE_BEFORE_DATABASE=true

Every structured application logger call introduced by this slice uses a literal,
normalized event name. Dynamic `event` shorthand is forbidden because the
repository-wide logging contract statically audits event names before release.
The dedicated structured-logging contract gate runs before focused tests, build,
and PostgreSQL integration so this class of defect fails before expensive gates.

## Failure Semantics

On the first action failure:

- the active action becomes `FAILED` with a normalized bounded error code;
- remaining pending actions become `SKIPPED` with `PRIOR_ACTION_FAILED`;
- the execution becomes `FAILED` when no prior action succeeded;
- the execution becomes `PARTIALLY_FAILED` when at least one prior action succeeded.

No automatic retry is introduced.

Because this slice changes Prisma state shape, raw PostgreSQL transition SQL,
and database constraints, its official local profile runs dependency-free source
checks, the structured-logging contract, focused tests, Prisma validation and
build before the isolated PostgreSQL integration suite and Full Jest. The database gate is bound to
`NODE_ENV=test`, `DATABASE_INTEGRATION_TESTS_ALLOWED=true`, and a host-supplied
loopback non-system `TEST_DATABASE_URL`. Database credentials are not stored in
the package or validation profile. A candidate is not locally verified
when that database gate is skipped or unavailable.

## Explicit Non-Scope

This slice adds no telemetry subscriber, MQTT consumer, evaluator coordinator, worker, queue, scheduler, `CommandService` invocation, device-command creation, direct MQTT publication, retry policy, public API, controller, activation endpoint, frontend or mobile behavior, user-configurable cooldown, Redis runtime state, Scene, Scheduler module, Notification module, Module 12 activation, push approval, or production deployment approval.

Automation definitions remain disabled by normal owner writes. Production deployment remains **NOT APPROVED**.
