# Module 11 Slice 11.2 — Automation Persistence Foundation

## Status

Slice 11.2 is closed and remote-green at commit `4cb2f707714f9bb0f11ad4af1c2a6afe1509e6d0` and GitHub Actions run `83411702069`. This document remains the binding record for the approved persistence boundary. The closure starts no later Module 11 slice and does not approve production deployment.

## Purpose

Slice 11.2 persists the bounded automation definition approved in Slice 11.1 without activating evaluation or execution. The persistence boundary is tenant-scoped, owner-scoped, revision-controlled, and fail-closed.

## Aggregate model

`Automation` is the aggregate root. It stores tenant and owner membership identity, the schema version, name, optimistic `revision`, indexed trigger identity, bounded condition JSON, and an `enabled` flag that remains `false` in this slice.

`AutomationAction` is an aggregate-owned child. Actions are normalized to preserve deterministic order, definition-local `actionId`, target device and capability foreign keys, action kind, and primitive JSON value. Action rows cascade only when their owning automation is deleted.

## Tenant and target integrity

The database uses composite references for:

- owner membership through `Membership(id, tenantId)`;
- trigger device through `Device(id, tenantId)`;
- trigger capability through `Capability(id, deviceId)`;
- action ownership through `Automation(id, tenantId)`;
- action device through `Device(id, tenantId)`;
- action capability through `Capability(id, deviceId)`.

Membership, device, and capability deletion remains restrictive. The repository resolves all trigger, condition, and action references inside the trusted tenant scope before writing.

## Repository boundary

`AutomationRepository` provides owner-scoped create, find, list, replace, and delete operations. Create and replace run in one Prisma transaction. Replace and delete require an optimistic revision match. Stale writers receive the stable `AUTOMATION_REVISION_CONFLICT` error.

The repository reuses `AutomationDomainValidator`, verifies active membership, rejects revoked or cross-tenant devices, requires reportable trigger capabilities, requires readable and reportable condition sources, requires writable action capabilities, and verifies primitive action values against capability data types.

## Activation gate

Every persisted definition is written with `enabled=false`. Any request to persist `enabled=true` is rejected with `AUTOMATION_ACTIVATION_NOT_APPROVED`. This slice does not add an HTTP controller, does not evaluate triggers, does not enqueue actions, and does not publish MQTT messages.

## Explicitly deferred

The following remain outside Slice 11.2:

- automation API and authorization policy beyond owner-scoped repository methods;
- trigger subscription or telemetry event dispatch;
- condition evaluation;
- cooldown, debounce, retry, and execution idempotency;
- broader causal-loop prevention;
- execution attempts and audit logs;
- command invocation through `CommandService`;
- Redis or MQTT integration;
- Scene, Scheduler, and Notification features;
- Module 12 activation;
- production deployment approval.

Production deployment remains **NOT APPROVED**.
