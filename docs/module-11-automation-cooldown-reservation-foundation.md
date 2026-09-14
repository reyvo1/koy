# Module 11 Slice 11.6 - Automation Cooldown Reservation Foundation

## Status

This is the binding implementation record for the owner-approved Slice 11.6 candidate selected after the remote-green Slice 11.5 closure commit `3dc303c270ff8641d1df78ed511b101bb6ddda9c` in GitHub Actions run `30822543569`.

That exact closure run passed 119 Jest suites and 840 tests, PostgreSQL integration, release verification with 352 manifest entries, and production startup smoke. Artifact `8859546377` was uploaded with SHA-256 `bc9c2968cf7ec4ea7e4ac8d9729c285579f119c3b18939d6e65024ff5e9905b6`.

This slice adds a PostgreSQL-authoritative cooldown reservation foundation only. It does not expose cooldown configuration to users, subscribe to telemetry, coordinate evaluation, dispatch commands, activate automation, or approve production deployment.

## Objective

Extend the closed execution reservation foundation with deterministic cooldown suppression that remains correct under concurrent delivery and process restart:

- bound internal cooldown state to `0..86400` seconds;
- serialize reservation decisions per `tenantId + automationId`;
- use PostgreSQL `clock_timestamp()` rather than process-local time;
- treat accepted non-suppressed execution start as the cooldown reference;
- persist `SUPPRESSED_COOLDOWN` as an immutable terminal outcome;
- keep suppressed rows from extending the cooldown window;
- preserve canonical replay and immutable evidence semantics;
- keep Redis non-authoritative and optional for later optimization.

## Configuration Boundary

`Automation.cooldownSeconds` is an internal persistence field with a default of `0`.

The approved owner-scoped automation repository forces `cooldownSeconds=0` on create and replace. No domain-contract field, HTTP input, DTO, controller, or activation API can configure a positive value in this slice.

The PostgreSQL integration test may set a positive value directly inside its disposable schema only to prove the future internal runtime boundary. A later separately approved domain and API contract is required before users can configure cooldown.

## Atomic Reservation Order

`AutomationExecutionRepository.reserveMatchedExecution` preserves the closed runtime order:

1. validate the bounded trusted envelope;
2. return an equivalent canonical replay without rereading mutable automation state;
3. acquire a PostgreSQL transaction advisory lock scoped to tenant and automation;
4. recheck canonical identity after the lock;
5. load the exact enabled automation revision;
6. validate action and accepted-telemetry evidence;
7. resolve loop suppression before cooldown;
8. read PostgreSQL `clock_timestamp()`;
9. query the latest non-suppressed execution inside the configured window;
10. persist one immutable execution and ordered action snapshot.

The advisory lock may conservatively serialize unrelated keys in the improbable event of a PostgreSQL hash collision, but it cannot permit duplicate or unsafe execution.

## Cooldown Reference Semantics

The cooldown reference query includes only accepted execution statuses:

- `RESERVED`;
- `DISPATCHING`;
- `SUCCEEDED`;
- `FAILED`;
- `PARTIALLY_FAILED`.

`SUPPRESSED_COOLDOWN` and `SUPPRESSED_LOOP` never extend the window.

At the exact boundary, a new execution is permitted because the reference must be strictly newer than:

`databaseNow - cooldownSeconds`

A positive active window produces:

- execution status: `SUPPRESSED_COOLDOWN`;
- decision reason: `COOLDOWN_ACTIVE`;
- action status: `SKIPPED`;
- immutable `cooldownSeconds`;
- database `cooldownEvaluatedAt`;
- restrictive `cooldownReferenceExecutionId`.

A zero cooldown produces `RESERVED` and `PENDING` actions without a reference execution.

## Persistence Changes

The additive migration:

- adds bounded `cooldownSeconds` to `Automation`;
- adds cooldown snapshot, evaluation timestamp, and optional reference identity to `AutomationExecution`;
- adds an indexed tenant-automation-status-time lookup;
- adds a tenant-bound restrictive self-reference for suppression evidence;
- adds no destructive table, column, or enum operation.

New execution `createdAt` is explicitly populated from the same PostgreSQL clock used for cooldown evaluation. This avoids transaction-start clock skew while a concurrent reservation waits for the advisory lock.

## Replay and Failure Semantics

A previously persisted canonical execution remains replayable without reading current enabled state or current cooldown configuration.

An invalid persisted cooldown or unavailable database clock fails closed with bounded error codes. A conflicting canonical replay remains `AUTOMATION_EXECUTION_IDEMPOTENCY_CONFLICT`.

Loop suppression takes precedence over cooldown and stores no cooldown evaluation timestamp or reference.

## Test Boundary

The candidate includes:

- focused repository tests for database lock use, database time, zero cooldown, active suppression, loop precedence, invalid cooldown, canonical recheck, and replay;
- PostgreSQL integration tests for concurrent different-event suppression, zero-cooldown concurrency, non-extending suppressed rows, restrictive references, forced-zero owner writes, and historical replay;
- a stable contract registered in the historical transition-safety policy;
- an official validation profile covering formatter, lint, focused tests, lifecycle, Prisma, build, Full Jest, and historical-transition gates.

Remote CI remains the authoritative PostgreSQL concurrency proof after push.

## Explicit Non-Scope

This slice adds no user-configurable cooldown field, public DTO, controller, API, telemetry subscriber, MQTT consumer, evaluator coordinator, execution dispatcher, action-state transition coordinator, `CommandService` invocation, device-command creation, direct MQTT publication, Redis state, worker, queue, scheduler, retry policy, activation endpoint, frontend, mobile behavior, Module 12 activation, push approval, or production deployment approval.

Normal automation writes remain `enabled=false` and `cooldownSeconds=0`.

Production deployment remains **NOT APPROVED**.
