# Module 11 Slice 11.4 - Automation Runtime Safety Contract

## Status

This document is the binding contract for Module 11 Slice 11.4. The slice is selected after the remote-green Slice 11.3 closure commit `35f9e8812bc186f576773df96ad1ca195706e4fe` in GitHub Actions run `30803661710`.

This checkpoint defines future runtime safety semantics only. It does not activate automation runtime behavior. Every persisted automation remains `enabled=false`, and production deployment remains **NOT APPROVED**.

## Objective

Define the minimum deterministic and fail-closed contract required before telemetry subscription, execution persistence, cooldown enforcement, action dispatch, or broader loop prevention may be implemented.

The contract covers:

- trusted trigger event identity;
- tenant-bound deterministic execution identity;
- replay-safe idempotency;
- atomic cooldown reservation;
- bounded execution ancestry and causal-loop suppression;
- auditable execution and action state transitions;
- deterministic action ordering;
- `CommandService`-only command publication;
- explicit failure and partial-execution semantics.

## Trusted Runtime Envelope

A future runtime request must originate from an already accepted telemetry record and must carry only trusted normalized fields:

- `tenantId`;
- `automationId`;
- `automationRevision`;
- `triggerTelemetryId`;
- normalized `triggerEventId`;
- trigger device and capability identity;
- trigger value;
- persisted telemetry timestamp;
- bounded execution ancestry.

Tenant identity must never be accepted from an untrusted automation definition or action payload. The runtime must reload the automation inside trusted tenant context and revalidate the exact persisted revision before any reservation or dispatch.

## Deterministic Execution Identity

The canonical execution identity is derived from the exact tuple:

`tenantId + automationId + automationRevision + triggerTelemetryId`

`triggerEventId` remains audit evidence, while the persisted telemetry primary key prevents collisions between devices or normalized event namespaces.

The future persistence layer must enforce one execution reservation for the canonical tuple. A repeated request with the same tuple and equivalent immutable snapshot is an idempotent replay. A repeated tuple with conflicting tenant, revision, trigger, ancestry, or action snapshot is a fail-closed conflict.

No process-local map, timestamp-only key, random retry key, or MQTT delivery count may be treated as the authoritative idempotency boundary.

## Required Decision Order

A future coordinator must apply this order without bypass:

1. validate the trusted bounded envelope;
2. load the tenant-scoped automation and exact revision;
3. require explicit approved enablement;
4. verify trigger identity and evaluate conditions using `AutomationEvaluator`;
5. reject non-matches without creating an execution;
6. reject bounded ancestry cycles;
7. atomically reserve the canonical execution identity;
8. atomically evaluate and reserve cooldown using database time;
9. persist the immutable ordered action snapshot;
10. dispatch actions in persisted position order through `CommandService`;
11. persist every terminal execution and action outcome.

A crash or concurrent delivery must never create a second reservation for the same canonical execution identity.

## Cooldown Contract

Cooldown configuration is not introduced by this slice. A later domain-contract extension is required before users can configure it.

When cooldown is implemented, it must:

- use database time rather than process-local time;
- be evaluated and reserved atomically with execution identity;
- be scoped to `tenantId + automationId`;
- use the accepted execution start as the reference point;
- record suppression as an auditable terminal outcome;
- never sleep, busy-wait, or rely only on Redis TTL;
- remain correct when Redis is absent or restarted.

Redis may later accelerate lookups, but PostgreSQL remains authoritative.

## Bounded Ancestry and Loop Prevention

Future internally generated events must carry bounded ancestry containing prior automation execution identities. The maximum ancestry depth is `16`.

The runtime must suppress an execution when:

- the same automation already exists in the active ancestry;
- the ancestry is malformed, duplicated, or exceeds the limit;
- tenant identity changes across ancestry;
- required ancestry evidence is unavailable for an internally generated event.

Suppression must be persisted as an auditable terminal outcome. Ancestry is a causal safety boundary, not a replacement for idempotency or cooldown.

## Execution State Contract

A future execution record must use forward-only transitions:

- `RESERVED`;
- `DISPATCHING`;
- `SUCCEEDED`;
- `FAILED`;
- `PARTIALLY_FAILED`;
- `SUPPRESSED_COOLDOWN`;
- `SUPPRESSED_LOOP`.

A future action record must use forward-only transitions:

- `PENDING`;
- `DISPATCHING`;
- `SUCCEEDED`;
- `FAILED`;
- `SKIPPED`.

Terminal records are immutable except for explicitly versioned operational metadata. Actions are dispatched sequentially in persisted position order. On the first dispatch failure, remaining actions become `SKIPPED`, and the execution becomes `FAILED` when no action succeeded or `PARTIALLY_FAILED` when at least one action succeeded.

## Command Dispatch Boundary

Future automation action dispatch must call the existing `CommandService`. Direct MQTT publication is forbidden.

Each action command must use a deterministic idempotency key derived from:

`automation execution identity + actionId`

The runtime must persist the returned device-command identity. A command idempotency conflict, invalid capability, revoked device, publication failure, or unexpected error must be recorded and must not be silently retried.

Retry policy is not introduced by this contract. Any later retry slice must preserve the same action idempotency key.

## Audit and Data-Minimization Requirements

Execution history must contain the minimum immutable facts needed to explain what happened:

- tenant, automation, and revision identity;
- trigger telemetry and normalized event identity;
- evaluation outcome and reason;
- cooldown or loop suppression reason;
- ordered action snapshot;
- command identity when dispatch occurs;
- timestamps sourced from PostgreSQL;
- structured bounded error code, never raw secrets.

Do not persist JWTs, credentials, arbitrary request headers, full MQTT packets, or unbounded exception objects.

## Explicit Non-Scope

This slice adds no Prisma model, migration, repository implementation, controller, API, telemetry subscription, dispatcher, worker, queue, scheduler, `CommandService` invocation, MQTT publication, Redis state, cooldown configuration, execution row, action row, retry behavior, activation endpoint, frontend, mobile behavior, Scene, Scheduler module, Notification module, Module 12 activation, push approval, or production deployment approval.

The next implementation slice must be separately approved and must preserve this contract through exact schema, repository, integration, concurrency, and transition-safety tests.
