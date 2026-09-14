# Module 11 Slice 11.1 - Automation Domain Contract

## Status

This document is the binding repository contract for the closed Module 11 Slice 11.1. The implementation is remote-green at commit `af9a9978b8a9ae56c040f00178c992c65c109aa5` and GitHub Actions run `83397563006`. It defines a bounded, versioned, tenant-safe trigger-condition-action vocabulary and does not persist, evaluate, schedule, or execute automations.

## Purpose

The platform needs one normalized automation definition that can react to capability reports without coupling the core domain to a vendor, MQTT topic, frontend, or device-specific payload. The contract must be small enough to validate completely before later persistence and runtime slices are approved.

## Versioned Aggregate Input

`AutomationDefinitionContract` contains exactly five fields:

- `schemaVersion`, fixed to `1.0.0`;
- `name`, trimmed and limited to 120 characters;
- `trigger`, one approved event source;
- `condition`, one bounded boolean tree;
- `actions`, one to sixteen approved commands.

Unknown or missing fields are rejected. The input cannot carry tenant identifiers, membership identifiers, device credentials, MQTT topics, scripts, URLs, SQL, templates, or arbitrary nested JSON. Trusted tenant context remains server-derived at the future API and repository boundaries.

## Trigger Contract

Slice 11.1 approves only `CAPABILITY_REPORTED`:

```json
{
  "kind": "CAPABILITY_REPORTED",
  "deviceId": "11111111-1111-4111-8111-111111111111",
  "capabilityKey": "temperature"
}
```

The trigger identifies a normalized platform device capability, not a vendor event or MQTT topic. A later tenant-aware resolver must prove that the device belongs to the trusted tenant and that the capability is reportable before the definition can be persisted or enabled.

Schedule, countdown, cron, scene, notification, webhook, command-acknowledgement, camera, barcode, and infrastructure triggers are not approved in this slice.

## Condition Tree

The approved condition nodes are:

- `ALWAYS` for an explicit unconditional branch;
- `ALL` for conjunction;
- `ANY` for disjunction;
- `NOT` for negation;
- `COMPARE` for a primitive comparison.

A `COMPARE` node reads either:

- `TRIGGER_VALUE`; or
- `LATEST_CAPABILITY_VALUE` identified by `deviceId` and `capabilityKey`.

The approved operators are `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, and `LESS_THAN_OR_EQUAL`. Ordered comparisons require a finite numeric right operand. Equality comparisons accept only a string, finite number, or boolean.

The validator enforces all of the following bounds:

- maximum depth: 5;
- maximum total nodes: 32;
- maximum children per `ALL` or `ANY`: 8;
- no empty `ALL` or `ANY` node;
- no unsupported node, source, operator, or hidden field.

This slice defines structure only. Runtime value-type compatibility, latest-state availability, stale-state policy, and evaluation outcomes remain fail-closed work for a later evaluator slice.

## Action Contract

Slice 11.1 approves only `DEVICE_COMMAND`:

```json
{
  "actionId": "ventilation-on",
  "kind": "DEVICE_COMMAND",
  "deviceId": "22222222-2222-4222-8222-222222222222",
  "capabilityKey": "power",
  "value": true
}
```

Each action has a stable definition-local `actionId`. Action identifiers and device-capability targets must be unique within one automation. Values are limited to a string of at most 1024 characters, a finite number, or a boolean. Structured command payloads are not accepted by this contract.

A future tenant-aware resolver must prove that every target device belongs to the trusted tenant and every target capability is writable before persistence or execution. Runtime publication must reuse the existing `CommandService`; automation code must not publish directly to MQTT.

## Immediate Loop Boundary

The validator rejects a direct feedback edge where a `DEVICE_COMMAND` targets the same `deviceId` and `capabilityKey` that produced the trigger. This prevents the simplest self-triggering loop at definition time.

This does not claim complete causal loop prevention. Cross-automation cycles, execution ancestry, cooldown, deduplication, retry, and idempotency require persisted execution identity and remain deferred.

## Security and Tenant Isolation

All device references are UUIDs and all capability keys use the bounded capability identifier grammar. These syntactic checks are not authorization. Future persistence and runtime boundaries must resolve every referenced device and capability under trusted authenticated tenant context and must reject cross-tenant references.

The contract never accepts or returns credentials, raw MQTT topics, vendor secrets, camera stream URLs, infrastructure addresses, executable content, or arbitrary metadata.

## Error Contract

Invalid definitions fail with HTTP 400 semantics and the stable domain code:

`AUTOMATION_CONTRACT_INVALID`

Messages identify only the rejected contract path or bound. They do not echo supplied values or secrets.

## Implemented Files

- `src/automation/automation-domain.types.ts`;
- `src/automation/automation-domain.validator.ts`;
- `src/automation/automation-domain.validator.spec.ts`;
- `src/common/errors/error-code.ts`;
- `test/module-11-automation-domain-contract.contract.spec.ts`.

## Explicitly Deferred

This slice adds no Prisma model, migration, repository, controller, public API, worker, queue, Redis state, MQTT subscription, command publication, cooldown, execution log, retry, runtime idempotency, cross-automation loop graph, Scene, Scheduler, Notification, frontend, mobile behavior, Module 12 activation, or production deployment approval.

Those capabilities require separate bounded slices and remote-green evidence. Production deployment remains **NOT APPROVED**.

## Slice 11.2 relationship

Slice 11.2 persists this exact bounded contract through the separate record `docs/module-11-automation-persistence-foundation.md`. The domain syntax and validator remain authoritative; persistence does not widen trigger, condition, value, or action semantics.
