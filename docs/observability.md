# Observability Foundation

## Status

The Observability workstream is completed.

Completed slices:

1. Health and Readiness Foundation
2. Basic Operational Metrics
3. Completion Review

Error Handling Consistency is now the active reliability workstream.

Module 08 remains completed. Module 09 remains inactive.

## Scope

The Observability foundation introduces operational health and metrics contracts without changing the platform domain or adapter architecture.

Implemented endpoints:

* `GET /health`
* `GET /health/live`
* `GET /health/ready`
* `GET /metrics`

## Liveness Contract

`GET /health` is retained for backward compatibility.

`GET /health/live` is the explicit liveness endpoint.

Both endpoints verify only that the application process can respond. They do not call PostgreSQL, Redis, MQTT, or another remote dependency.

Successful response:

```json
{
  "status": "ok"
}
```

## Readiness Contract

`GET /health/ready` checks whether the application dependencies required by the current platform foundation are available.

Checks run concurrently and are isolated from one another:

* PostgreSQL through a constant Prisma `SELECT 1` query
* Redis through `PING`
* MQTT through the transport readiness contract

Each dependency check has an independent timeout controlled by:

```text
HEALTH_CHECK_TIMEOUT_MS=1000
```

The endpoint returns HTTP `200` only when every dependency is up.

The endpoint returns HTTP `503` when one or more dependencies are down or time out.

Example response:

```json
{
  "status": "not_ready",
  "timestamp": "2026-07-16T00:00:00.000Z",
  "checks": {
    "postgres": {
      "status": "up",
      "latencyMs": 3
    },
    "redis": {
      "status": "up",
      "latencyMs": 2
    },
    "mqtt": {
      "status": "down",
      "latencyMs": 0,
      "reason": "publisher_not_configured"
    }
  }
}
```

## MQTT Readiness Truth

The repository currently contains a placeholder MQTT publisher rather than a production broker client.

The readiness contract therefore reports:

```text
publisher_not_configured
```

This is intentional. The platform must not report command-delivery readiness until a real MQTT transport adapter is configured and verified.

This observability behavior does not reopen Module 08 and does not redesign the MQTT boundary. Actual MQTT transport implementation remains a separately approved production-readiness task.

## Stable Failure Reasons

Health responses use stable, non-sensitive reason codes:

* `check_failed`
* `timeout`
* `unexpected_response`
* `publisher_not_configured`
* `transport_unavailable`

Raw exception messages, connection strings, credentials, payloads, and stack traces are not returned by health endpoints.

## Failure Isolation

A failed or stalled dependency check does not prevent the other dependency results from being returned.

This allows operators to distinguish PostgreSQL, Redis, and MQTT failures in a single readiness response.

## Metrics Contract

`GET /metrics` exposes the Prometheus text exposition format:

```text
text/plain; version=0.0.4; charset=utf-8
```

The registry is process-local and resets when the application process restarts. It is intended for scraping by an external metrics system.

The metrics endpoint is excluded from HTTP request instrumentation so each scrape does not mutate the response being collected.

Production requires a bearer token for `/metrics`, validated by `MetricsAccessGuard` with a constant-time comparison. Deployment must also restrict `/metrics` to the internal monitoring network or an authenticated reverse-proxy boundary; the application token is defense in depth rather than a replacement for network policy.

### HTTP Metrics

* `iot_http_requests_total`
* `iot_http_request_duration_seconds`

HTTP labels are bounded to:

* `method`
* route template
* status code

The interceptor uses the registered route template, such as `/devices/:id`, rather than the raw request URL. Tenant IDs, device IDs, command IDs, query values, and other user-controlled identifiers are not used as metric labels.

### Telemetry Metrics

`iot_telemetry_ingestion_total` records these bounded outcomes:

* `accepted`
* `duplicate`
* `rejected`
* `failed`

Telemetry payloads, event IDs, tenant IDs, and device IDs are not exported as labels.

### Command Metrics

`iot_device_command_lifecycle_total` records these bounded events:

* `created`
* `idempotent_replay`
* `sent`
* `publish_failed`
* `acknowledged`
* `acknowledgement_rejected`
* `timed_out`
* `stale_pending`

Command payloads and identifiers are not exported as labels.

### Readiness Metrics

* `iot_dependency_readiness_checks_total`
* `iot_dependency_readiness_duration_seconds`
* `iot_readiness_results_total`

Dependency labels are restricted to `postgres`, `redis`, and `mqtt`. Status labels are restricted to stable readiness states.

### Static Service Metric

`iot_platform_info` exposes the service name and repository version as a static gauge.

## Cardinality and Data-Safety Rules

Metrics must not contain:

* Tenant IDs
* User IDs
* Device IDs
* Command IDs
* Telemetry event IDs
* Raw request URLs
* Query strings
* Payload values
* Credentials, tokens, or secrets
* Raw exception messages

Only bounded operational dimensions may be introduced as labels.

## Non-Goals

The completed slices do not introduce:

* Distributed tracing
* Dashboards or alert definitions
* External monitoring deployment
* Persistent in-application metrics storage
* MQTT broker implementation
* Domain refactoring
* Module 09 activation

## Validation

The Observability foundation is validated through:

* Configuration validation tests
* Health controller and service tests
* Dependency timeout and failure-isolation tests
* Metrics registry tests
* HTTP interceptor tests
* Metrics endpoint tests
* Telemetry and command instrumentation tests
* Metric cardinality and label escaping tests
* Prisma schema validation
* Application build
* Full Jest test suite
* Git diff validation

## Completion Review

The Observability Completion Review adds an automated contract gate covering:

* Backward-compatible `GET /health` behavior
* Explicit `GET /health/live` and `GET /health/ready` routes
* Concurrent, independently timed PostgreSQL, Redis, and MQTT readiness checks
* Honest MQTT publisher readiness for unconfigured, connecting, connected, disconnected, error, and stopping states
* Prometheus content type and the `iot_` metric namespace
* Counter naming with the `_total` suffix
* Required HTTP, telemetry, command, and readiness metric families
* Route-template labels instead of raw request URLs
* Bounded `unmatched` route handling
* Exclusion of `/metrics` from self-instrumentation
* Rejection of tenant, user, device, command, correlation, event, topic, URL, and payload labels
* Production protection requirements for the metrics endpoint

This review is a validation gate. It does not introduce tracing, dashboards, or a new domain module.

## Current Checkpoint

Observability, Error Handling Consistency, and Integration and End-to-End Testing are completed. Production Readiness Review is completed with a NOT READY deployment decision. Production Configuration and Process Lifecycle Foundation, Production Security Boundary Hardening, Deployment and Recovery Foundation, MQTT Production Transport Architecture Proposal, and MQTT Production Transport Implementation are completed. Production Readiness Completion Review is active. Module 09 remains inactive.


The native Nginx deployment template additionally restricts `/metrics` to loopback. The bearer token remains defense in depth.
