# MQTT Production Transport

## Status

**IMPLEMENTED — PENDING PRODUCTION READINESS COMPLETION REVIEW**

The architecture recorded in `docs/mqtt-production-transport-proposal.md` was explicitly approved on July 17, 2026 and implemented without changing the Module 08 command domain or activating Module 09.

## Runtime Boundary

```text
CommandService
    -> MqttService facade
    -> MqttPublisherTransport
    -> MqttJsPublisherAdapter
    -> production MQTT broker
```

`CommandService` remains transport-neutral. MQTT.js is contained inside the MQTT adapter boundary and is an exact production dependency.

## Delivery Contract

The publisher:

- uses MQTT 5 over `mqtts://`;
- verifies the broker certificate and hostname;
- optionally trusts a private CA from `MQTT_CA_FILE`;
- keeps one long-lived client per NestJS process;
- uses a process-unique client identifier;
- publishes commands with QoS 1 and `retain=false`;
- waits for MQTT.js broker confirmation before resolving;
- sets message expiry from `COMMAND_ACK_TIMEOUT_MS`;
- rejects invalid command topics;
- rejects publishes while disconnected or stopping;
- does not add an offline queue, application retry, or persistent outbox.

Broker confirmation means the broker accepted responsibility for the message. The existing device acknowledgement webhook remains the authoritative execution acknowledgement.

## Required Production Configuration

- `MQTT_BROKER_URL`: required `mqtts://` broker authority without embedded credentials;
- `MQTT_CLIENT_ID_PREFIX`: required safe identifier prefix;
- `MQTT_USERNAME`: required publish-only application credential;
- `MQTT_PASSWORD`: required non-placeholder secret;
- `MQTT_CA_FILE`: optional private CA path;
- `MQTT_CONNECT_TIMEOUT_MS`: 1000–60000, default 10000;
- `MQTT_PUBLISH_TIMEOUT_MS`: 1000–60000, default 10000;
- `MQTT_KEEPALIVE_SECONDS`: 5–300, default 30;
- `MQTT_RECONNECT_PERIOD_MS`: 1000–60000, default 5000.

Production validation rejects plaintext MQTT, credentials embedded in the URL, unsafe client ID prefixes, missing credentials, and placeholder passwords. TLS certificate verification cannot be disabled.

## Readiness

MQTT readiness now reflects the real publisher state:

- `publisher_connecting`;
- `publisher_disconnected`;
- `publisher_error`;
- `publisher_stopping`.

A configured and connected publisher reports ready. Development and test processes without publisher configuration continue to report `publisher_not_configured` honestly.

## Reconnect and Shutdown

Reconnect is transport availability recovery only. It does not replay commands.

Shutdown is idempotent and performs the following sequence:

1. stop accepting new publishes;
2. wait for in-flight confirmations within a bounded timeout;
3. close the MQTT client gracefully;
4. force-close only if graceful close exceeds the bound;
5. prevent reconnect timers or unresolved publish promises from surviving shutdown.

## Broker ACL Requirement

The production publisher credential must be restricted at the broker to publish only:

```text
tenants/+/devices/+/commands
```

It must not subscribe or publish telemetry, acknowledgement, wildcard, or unrelated operational topics.

## Observability

Structured events cover connection, reconnect, disconnection, publish confirmation, publish failure, and shutdown. Logs omit command payloads, credentials, CA material, and broker URLs.

Metrics use bounded labels only:

- publisher state transitions;
- reconnect attempts;
- publish outcomes;
- publish confirmation duration.

Tenant ID, device ID, topic, command ID, and raw error messages are not metric labels.

## Validation Evidence

The implementation checkpoint includes:

- production configuration and TLS policy tests;
- disconnected publish rejection;
- QoS 1 broker confirmation;
- publish timeout handling;
- reconnect and readiness transitions;
- unique client ID behavior;
- graceful idempotent shutdown;
- a loopback verified-TLS MQTT 5 publish integration test;
- existing command lifecycle tests;
- existing MQTT workflow integration;
- build, lint, and production dependency audit gates.

The loopback TLS test uses a test-only certificate and a minimal MQTT 5 broker-confirmation harness. It does not require Docker, WSL, an installed broker, or a production topic namespace.

## Explicitly Deferred

The implementation does not include:

- automatic application retries;
- an offline publish queue;
- a persistent outbox;
- broker provisioning automation;
- mutual TLS;
- database migrations;
- command schema changes;
- Module 09 work.

Those changes require separate architecture decisions if they become necessary.
