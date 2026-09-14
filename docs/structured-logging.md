# IoT Platform - Structured Logging Contract

## Purpose

This document defines the structured logging contract for the IoT Platform reliability phase.

The contract applies across HTTP requests, application services, schedulers, MQTT workflows, telemetry processing, and future adapters.

Structured logging must improve operational visibility without exposing credentials, tokens, secrets, or device payloads.

## Current Implementation Status

The Structured Logging workstream is completed.

Completed slices:

* Logging Foundation
* Domain Event Normalization
* Completion Review

Implemented foundations:

* Centralized `nestjs-pino` and `pino-http` configuration
* Environment-aware log levels
* Optional validated `LOG_LEVEL` override
* Trusted `x-request-id` propagation
* UUID request ID generation when the incoming value is absent or invalid
* Response request ID propagation
* Sensitive-field redaction
* HTTP outcome-based log levels
* Stable HTTP completion and failure messages
* Focused unit tests for logger behavior and redaction
* Normalized command publish and acknowledgement events
* Normalized command timeout and stale-command scheduler events
* Normalized MQTT publish, acknowledgement, authentication, and ACL events
* Normalized telemetry success, duplicate, rejection, and failure events
* Shared structured error serialization
* Payload-leakage assertions for command, MQTT, and telemetry logs

The completion review confirmed that application logger calls are structured, event names follow the contract, application source does not use console logging, and notification logs do not expose email addresses or token values.

Observability is now the active reliability workstream.

## Standard Request Context

Every HTTP request must have a request ID.

Header:

`x-request-id`

Rules:

* A valid incoming request ID may be propagated.
* Accepted request IDs contain only letters, numbers, `.`, `_`, `:`, or `-`.
* Maximum request ID length is 128 characters.
* Missing or invalid values are replaced with a UUID.
* The final request ID is returned in the response header.
* Request-scoped application logs use the normalized `requestId` field.

## Standard Log Fields

Domain and operational logs should use structured objects.

Recommended fields:

```text
{
  event,
  requestId?,
  tenantId?,
  userId?,
  deviceId?,
  commandId?,
  correlationId?,
  telemetryId?,
  outcome?,
  durationMs?,
  error?
}
```

Field rules:

* `event` uses lowercase dotted notation.
* Tenant, user, and device identity must come from trusted application context.
* Domain identifiers should be included only when operationally useful.
* Raw telemetry and command payloads must not be logged by default.
* Error objects must not expose secrets or credentials.

Current event catalog:

```text
http.request.completed
http.request.failed
command.publish.succeeded
command.publish.failed
command.acknowledge.succeeded
command.acknowledge.rejected
command.timeout.applied
command.pending.stale.detected
command.timeout.scan.failed
mqtt.publish.requested
mqtt.ack.received
mqtt.ack.rejected
mqtt.auth.succeeded
mqtt.auth.denied
mqtt.acl.allowed
mqtt.acl.denied
telemetry.ingest.succeeded
telemetry.ingest.duplicate_replayed
telemetry.ingest.rejected
telemetry.ingest.failed
notification.verification.requested
notification.password_reset.requested
```

## Log Level Policy

### `debug`

Development diagnostics that are not required during normal production operation.

### `info`

Successful lifecycle events and normal HTTP responses.

### `warn`

Rejected input, authorization denial, recoverable conditions, stale state, and HTTP 4xx responses.

### `error`

Unexpected operation failure, dependency failure, and HTTP 5xx responses.

### `fatal`

Process-level failure where safe operation cannot continue.

## Environment Defaults

* Development: `debug`
* Production: `info`
* Test: `silent`

A valid `LOG_LEVEL` environment variable overrides the default.

Supported values:

* `fatal`
* `error`
* `warn`
* `info`
* `debug`
* `trace`
* `silent`

## Sensitive Data Redaction

The logger must redact known sensitive fields before serialization.

Protected categories include:

* Passwords and password hashes
* Access and refresh tokens
* Token hashes and token lookups
* Secrets and credential objects
* Authorization headers
* Cookies
* MQTT webhook secrets
* Device secrets

The replacement value is:

`[REDACTED]`

Adding a new credential or secret field requires updating the centralized redaction contract and its tests.

## HTTP Logging Behavior

HTTP logs use the following operational levels:

* Status below 400: `info`
* Status 400 through 499: `warn`
* Status 500 or higher: `error`
* Request error object present: `error`

Stable messages:

* Success: `http.request.completed`
* Failure: `http.request.failed`

Response duration is logged as `durationMs`.

## Architecture Boundaries

Structured logging is a cross-cutting reliability concern.

It must not:

* Change the core domain model
* Introduce vendor-specific logic into the domain layer
* Override tenant isolation
* Log untrusted tenant or device identity as authoritative context
* Log raw telemetry or command payloads by default
* Activate Module 09

Protocol and vendor adapters must follow this same logging contract.

## Domain Event Level Decisions

* Telemetry success and identical duplicate replay use `debug` to avoid high-volume production noise.
* Command publish and acknowledgement lifecycle success use `info`.
* MQTT publish request and valid acknowledgement receipt use `info`.
* Authentication denial, ACL denial, malformed acknowledgement, rejected command acknowledgement, rejected telemetry, and stale pending commands use `warn`.
* Command publish failure, timeout scan failure, and unexpected telemetry persistence failure use `error`.
* MQTT publish uses `mqtt.publish.requested` because the current implementation accepts a publish request but does not yet provide a production broker delivery guarantee.

## Structured Error Contract

Unexpected failures use:

```text
{
  type,
  message,
  stack?,
  code?
}
```

Rules:

* `type` and `message` are always present.
* `stack` is included for Error instances at `error` level.
* A stable dependency error `code` is included when available.
* Callers must not place credentials, secrets, or raw payloads inside errors or log context.

## Completion Review Evidence

The completion review adds regression tests that:

* Reject direct `console` logging in application source.
* Reject non-structured application logger calls.
* Require a valid event name on each structured logger call.
* Reject sensitive payload keys inside structured log objects.
* Verify notification logs exclude email addresses and token values.

The existing runtime tests continue to verify centralized redaction and payload exclusion for command, MQTT, and telemetry workflows.

## Workstream Status

Structured Logging is completed.

The next reliability workstream is Observability, beginning with Health and Readiness Foundation.
