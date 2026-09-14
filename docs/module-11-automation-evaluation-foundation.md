# Module 11 Slice 11.3 — Automation Evaluation Foundation

## Status

This document is the binding implementation record for the active Module 11 Slice 11.3 candidate. Remote-green evidence and slice closure remain separate gates.

## Purpose

Slice 11.3 adds a deterministic, fail-closed, read-only evaluator for the bounded automation definitions approved in Slice 11.1 and persisted in Slice 11.2. It evaluates one normalized capability report against one persisted disabled definition and returns a decision plus immutable action intents. It does not dispatch, persist, enqueue, retry, or execute those intents.

## Evaluation envelope

`AutomationEvaluationRequest` contains exactly:

- one `AutomationEvaluationCandidate` with automation ID, trusted tenant ID, persisted `enabled` state, positive revision, and the versioned domain definition;
- one normalized capability report with trusted tenant ID, device ID, capability key, and primitive value;
- zero to thirty-two normalized latest capability values resolved by a future trusted caller.

Unknown fields, malformed UUIDs, invalid capability keys, non-finite numbers, oversized strings, duplicate latest-value targets, invalid revisions, and invalid domain definitions are rejected without throwing from the evaluator boundary.

## Trigger applicability

The evaluator applies only when the normalized report device and capability exactly match the definition's `CAPABILITY_REPORTED` trigger. A different report returns `NOT_APPLICABLE` with `TRIGGER_MISMATCH` and no action intents.

Tenant identity is server-derived and must match across the persisted candidate, trigger report, and every latest-value input. Any mismatch returns `REJECTED` with `TENANT_MISMATCH`.

## Fail-closed condition semantics

Conditions use internal three-state evaluation:

- `TRUE`;
- `FALSE`;
- `UNKNOWN`.

`UNKNOWN` is produced when a latest value is unavailable or the compared primitive types differ. `NOT UNKNOWN` remains `UNKNOWN`; missing data can never be inverted into a match. `ALL` returns false when any branch is false and otherwise preserves unknown. `ANY` returns true when any branch is true and otherwise preserves unknown. This keeps evaluation deterministic and fail-closed.

Equality and inequality require matching primitive types. Ordered operators require numeric operands. The domain validator remains authoritative for tree depth, node count, fan-out, primitive bounds, and approved vocabulary.

## Read-only result

A match returns `MATCHED`, `CONDITION_MATCHED`, and a frozen copy of the ordered domain actions as `actionIntents`. These values are plans only. They are not `DeviceCommand` rows, are not passed to `CommandService`, and are not published to MQTT.

A false condition returns `NOT_MATCHED` and no intents. Missing values and type mismatches also return `NOT_MATCHED` with stable reason codes. Invalid input, invalid definitions, cross-tenant data, and attempted enabled evaluation return `REJECTED`.

## Activation gate

Persisted automations remain disabled. If a candidate has `enabled=true`, evaluation is rejected with `ACTIVATION_NOT_APPROVED`. Slice 11.3 does not create an activation API or change the Slice 11.2 repository write policy.

## Explicitly deferred

This slice adds no telemetry subscription, dispatcher, worker, controller, public API, database write, migration, command execution, `CommandService` invocation, MQTT publication, Redis state, cooldown, debounce, retry, execution log, ancestry tracking, runtime idempotency, cross-automation loop graph, Scene, Scheduler, Notification, Module 12 activation, or production deployment approval.

Production deployment remains **NOT APPROVED**.
