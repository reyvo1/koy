# MQTT Contract

## Current Topic Namespace

The current repository uses tenant-scoped device topics:

- Telemetry publish: `tenants/{tenantId}/devices/{deviceId}/telemetry`
- Command subscription: `tenants/{tenantId}/devices/{deviceId}/commands`
- Command acknowledgement publish: `tenants/{tenantId}/devices/{deviceId}/commands/ack`

Tenant and device identifiers from the validated topic or authenticated device registry are authoritative.
Payload fields must not override trusted tenant or device identity.

## Current Payload Contracts

Telemetry webhook input requires:

- `topic`
- `eventId`
- non-empty object `payload`

Command delivery currently uses:

- `commandId`
- normalized command `payload`

Command acknowledgement requires:

- `commandId`

Command correlation, lifecycle, acknowledgement, timeout, and idempotency are handled by the normalized command domain.

## Delivery Semantics

QoS, retain, Last Will and Testament, broker TLS, and production broker-client delivery must be selected and implemented according to message semantics during the Production Readiness workstream.

The current repository defines the MQTT authentication, authorization, webhook, topic, command publish boundary, and acknowledgement contracts. Production broker-client delivery remains a tracked reliability task.
