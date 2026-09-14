# MQTT Production Transport Architecture Proposal

## Approval Status

**APPROVED — JULY 17, 2026**

This proposal was explicitly approved on July 17, 2026. The approved implementation is documented in `docs/mqtt-production-transport.md`.

## Scope

This proposal closes the design decision for PR-001 without redesigning Module 08.

It covers only the application-side MQTT command publisher:

- production broker connectivity;
- TLS and credential handling;
- connection lifecycle and reconnect behavior;
- publish confirmation semantics;
- application publisher ACL;
- readiness and observability;
- graceful shutdown;
- focused implementation and validation boundaries.

It does not change:

- Tenant, User, Device, Capability, Telemetry, or Command domain models;
- command idempotency, acknowledgement, or timeout behavior;
- device authentication or existing webhook contracts;
- database schema or migrations;
- Module 09 activation;
- vendor-neutral or protocol-neutral core boundaries.

## Existing Boundary

`CommandService` currently creates and validates commands, delegates command delivery to `MqttService.publish()`, marks a command `SENT` after the publish call succeeds, marks it `FAILED` when publishing fails, and preserves device acknowledgement as the authoritative transition to `ACKNOWLEDGED`.

`MqttService.publish()` now delegates to the approved `MqttPublisherTransport` adapter. Development and test processes without publisher configuration may still report `publisher_not_configured`, while configured production processes expose real connection readiness.

## Proposed Decision

Approved decision:

1. `MqttService` remains the public application facade used by `CommandService`.
2. A transport interface is introduced inside the MQTT adapter boundary.
3. A single long-lived MQTT.js publisher adapter is created per NestJS process.
4. MQTT.js moves from development-only tooling to an exact production dependency.
5. The normalized command service and Module 08 lifecycle remain unchanged.
6. Production uses MQTT 5 over verified TLS.
7. Command publication uses QoS 1, `retain=false`, and a bounded confirmation timeout.
8. Broker acknowledgement confirms broker acceptance only. Device acknowledgement remains the authoritative execution acknowledgement.
9. The adapter rejects publish attempts while disconnected instead of hiding them in an unbounded offline queue.
10. No automatic application-level retry or outbox is introduced in the first implementation slice.

## Component Boundary

The proposed internal shape is:

```text
CommandService
    |
    v
MqttService facade
    |
    v
MqttPublisherTransport interface
    |
    v
MqttJsPublisherAdapter
    |
    v
Production MQTT broker
```

`CommandService` must not import MQTT.js or broker-specific configuration.

The first implementation may add internal files under `src/mqtt/`, but the existing `MqttService.publish(topic, message)` application-facing contract should remain stable.

This keeps protocol implementation details inside the adapter layer and avoids reopening Module 08.

## Production Configuration

The implementation proposal requires the following production configuration:

- `MQTT_BROKER_URL`: required and must use `mqtts://`;
- `MQTT_CLIENT_ID_PREFIX`: required, sanitized, and combined with process-unique identity;
- `MQTT_USERNAME`: required application publisher credential;
- `MQTT_PASSWORD`: required application publisher secret;
- `MQTT_CA_FILE`: optional path for a private certificate authority;
- `MQTT_CONNECT_TIMEOUT_MS`: bounded positive value, default 10000;
- `MQTT_PUBLISH_TIMEOUT_MS`: bounded positive value, default 10000;
- `MQTT_KEEPALIVE_SECONDS`: bounded positive value, default 30;
- `MQTT_RECONNECT_PERIOD_MS`: bounded positive value, default 5000.

Production must reject:

- plaintext `mqtt://` broker URLs;
- missing publisher credentials;
- empty or unsafe client identifiers;
- `rejectUnauthorized=false`;
- credentials embedded in the release artifact;
- logging of usernames, passwords, certificates, command payloads, or broker URLs containing credentials.

Secrets remain in the restrictive production environment file defined by the deployment foundation.

## TLS and Broker Identity

TLS server certificate verification is mandatory.

The adapter must use the hostname from `MQTT_BROKER_URL` for server identity verification. A custom CA may be loaded from `MQTT_CA_FILE`, but certificate verification must remain enabled.

Mutual TLS is an allowed future extension, not a requirement for the first implementation. The initial credential contract uses a dedicated application username and password over verified TLS.

## Client and Session Policy

The application publisher uses:

- one client per NestJS process;
- a unique client ID derived from the configured prefix and runtime instance identity;
- MQTT 5;
- clean start enabled;
- session expiry interval zero;
- keepalive enabled;
- no subscriptions;
- no retained Last Will payload containing sensitive data.

A clean publisher-only session is selected because the application does not consume broker messages through this client. Existing inbound telemetry, authentication, ACL, and acknowledgement webhooks remain unchanged.

Multiple application instances may connect concurrently because each instance receives a unique client ID.

## Reconnect and Availability

The publisher owns a small connection state machine:

```text
DISCONNECTED -> CONNECTING -> CONNECTED -> STOPPING
```

Reconnect is transport-level availability recovery only. It must not replay application commands silently.

Rules:

- startup begins connection establishment without blocking the process indefinitely;
- readiness is false until a broker connection is established;
- disconnect, offline, close, and error events update readiness;
- publishes are rejected while not connected or while stopping;
- reconnect attempts use the configured bounded period;
- logs must be low-cardinality and payload-safe;
- reconnect must not create additional client instances.

The initial implementation intentionally avoids persistent offline queues and automatic command retries. Those features would require a separate outbox and delivery-semantics proposal.

## Publish Semantics

Command publication uses:

- exact topic generated by the existing command workflow;
- QoS 1;
- `retain=false`;
- JSON serialization of the existing command envelope;
- a bounded publish confirmation timeout;
- MQTT 5 message expiry aligned with the command acknowledgement timeout.

The promise returned by `MqttService.publish()` resolves only after MQTT.js reports successful QoS 1 publication confirmation.

That confirmation means the broker accepted responsibility for the message. It does not mean the device executed the command.

Existing lifecycle meaning remains:

```text
PENDING
  -> broker-confirmed publish
SENT
  -> device acknowledgement webhook
ACKNOWLEDGED
  -> scheduler threshold without device acknowledgement
TIMED_OUT
```

A connection error, publish error, timeout, or shutdown rejection causes the existing command workflow to mark the command `FAILED`.

## Topic and ACL Policy

The application publisher credential must be broker-restricted to publishing command topics only:

```text
tenants/+/devices/+/commands
```

The application publisher must not be allowed to:

- subscribe to device topics;
- publish telemetry;
- publish acknowledgement topics;
- publish wildcard topic names;
- access another operational namespace.

Application-side topic validation remains defense in depth. Broker ACL is still mandatory.

Device authentication, device topic authorization, telemetry, and acknowledgement boundaries are not redesigned by this proposal.

## Readiness and Observability

MQTT readiness must reflect the real transport state.

Proposed stable reasons include:

- `publisher_connecting`;
- `publisher_disconnected`;
- `publisher_error`;
- `publisher_stopping`.

When connected, the MQTT dependency reports ready.

Minimum structured events:

- publisher connecting;
- publisher connected;
- publisher disconnected;
- reconnect scheduled;
- publish confirmed;
- publish failed;
- publisher stopped.

Logs must not contain command payloads or secrets.

Minimum operational measurements:

- publisher connection state;
- publish outcomes;
- publish confirmation duration;
- reconnect count.

Labels must remain bounded and must not include tenant ID, device ID, topic, command ID, or error message.

## Graceful Shutdown

On NestJS shutdown:

1. stop accepting new publishes;
2. wait for already-started publish confirmations within a bounded drain timeout;
3. close the MQTT client gracefully;
4. force-close only after the timeout;
5. make repeated shutdown calls safe and idempotent;
6. report readiness unavailable during shutdown.

Shutdown must not leave timers, reconnect loops, sockets, or unresolved promises.

## Implementation Slice After Approval

The first implementation checkpoint should remain small:

- production MQTT configuration validation;
- internal transport interface;
- MQTT.js publisher adapter;
- `MqttService` facade delegation;
- real readiness state;
- graceful shutdown;
- structured transport logs and bounded metrics;
- focused unit and loopback TLS integration tests;
- exact production dependency update;
- documentation update.

It must not add:

- database migrations;
- command schema changes;
- automatic retries;
- persistent outbox;
- broker provisioning automation;
- device protocol redesign;
- Module 09 work.

## Validation Plan

The implementation checkpoint requires:

- configuration and TLS policy unit tests;
- publish rejection while disconnected;
- QoS 1 broker-confirmation success;
- publish timeout and broker-error failure;
- reconnect state transition;
- unique client ID behavior;
- graceful and idempotent shutdown;
- readiness transition tests;
- loopback TLS MQTT integration without Docker;
- existing command lifecycle focused tests;
- existing MQTT workflow integration;
- build and non-mutating lint.

Full Jest, coverage, recovery, and unrelated database integration are deferred to Production Readiness Completion Review unless the implementation changes those boundaries.

## Rejected Alternatives

### MQTT client inside `CommandService`

Rejected because it couples normalized command business logic to a protocol library and reopens Module 08.

### One connection per publish

Rejected because it increases latency, TLS overhead, connection churn, and failure ambiguity.

### QoS 0 commands

Rejected because the application would not receive broker delivery confirmation.

### Retained commands

Rejected because a stale retained command could be delivered to a later subscriber.

### Hidden offline queue or automatic retry

Rejected because it changes delivery and duplicate semantics without a durable outbox contract.

### Disabling TLS certificate verification

Rejected because it removes broker identity assurance.

## Approval Decision Required

The following decisions were explicitly approved:

- MQTT 5 over verified `mqtts://`;
- one long-lived publisher per application process;
- `MqttService` remains the facade;
- MQTT.js adapter stays inside the MQTT boundary;
- QoS 1 and `retain=false`;
- broker confirmation is distinct from device acknowledgement;
- reject publishes while disconnected;
- no automatic retry or outbox in the first implementation;
- publish-only broker ACL;
- readiness and graceful shutdown contract;
- Module 08 and Module 09 boundaries remain unchanged.

Implementation is complete, but the production decision remains **NOT READY FOR PRODUCTION DEPLOYMENT** until the Production Readiness Completion Review and explicit deployment approval.
