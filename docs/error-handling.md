# Error Handling Contract

## Purpose

This document defines the HTTP error contract established during the Error Handling Consistency workstream.

The contract applies to application controllers, validation failures, guards, services that raise NestJS HTTP exceptions, and unexpected request-processing failures.

It does not change the core domain model or the existing business rules.

## Standard Error Envelope

Every HTTP error response uses the following shape:

```json
{
  "statusCode": 400,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request"
  },
  "requestId": "request-123",
  "timestamp": "2026-07-16T00:00:00.000Z",
  "path": "/devices"
}
```

The HTTP response status remains authoritative.

The envelope fields are:

* `statusCode`: numeric HTTP status
* `error.code`: stable machine-readable code
* `error.message`: human-readable summary
* `error.details`: optional sanitized validation details
* `requestId`: request correlation identifier
* `timestamp`: UTC ISO-8601 response timestamp
* `path`: request path without query parameters

## Stable Status-Based Codes

The foundation maps common HTTP statuses to stable codes:

| HTTP status | Error code |
| --- | --- |
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_ERROR` |
| 503 | `SERVICE_UNAVAILABLE` |

Uncommon HTTP statuses use `HTTP_ERROR` until a stable mapping is explicitly added.

Domain-specific error codes are assigned by the application boundary while HTTP status remains authoritative.

## Domain Error Codes

Domain Error Code Normalization introduces stable machine-readable codes for the current application boundaries.

The normalized domains are:

* Authentication and token lifecycle
* Tenant context and membership
* Device identity, provisioning, credentials, and ownership assignment
* Capability schema and value validation
* Telemetry validation, authorization, and idempotency conflicts
* Command validation, idempotency, publish, and acknowledgement lifecycle
* MQTT webhook, topic, acknowledgement payload, and command identifier validation
* Dashboard persistence, tenant isolation, revision, binding, and shared authorization

Representative codes include:

| Domain | Representative codes |
| --- | --- |
| Authentication | `AUTH_CREDENTIALS_INVALID`, `AUTH_REFRESH_TOKEN_EXPIRED`, `AUTH_USER_ALREADY_EXISTS` |
| Tenant | `TENANT_CONTEXT_INVALID`, `TENANT_MEMBERSHIP_INVALID` |
| Device | `DEVICE_NOT_FOUND`, `DEVICE_CREDENTIALS_INVALID`, `DEVICE_IDENTITY_MISMATCH` |
| Capability | `CAPABILITY_VALIDATION_FAILED`, `CAPABILITY_NOT_DEFINED`, `CAPABILITY_NOT_REPORTABLE` |
| Telemetry | `TELEMETRY_PAYLOAD_INVALID`, `TELEMETRY_DEVICE_UNAUTHORIZED`, `TELEMETRY_EVENT_CONFLICT` |
| Command | `COMMAND_IDEMPOTENCY_CONFLICT`, `COMMAND_PUBLISH_FAILED`, `COMMAND_ACKNOWLEDGEMENT_INVALID` |
| MQTT boundary | `MQTT_WEBHOOK_UNAUTHORIZED`, `MQTT_TOPIC_INVALID`, `MQTT_PAYLOAD_INVALID` |
| Dashboard | `DASHBOARD_NOT_FOUND`, `DASHBOARD_REVISION_CONFLICT`, `DASHBOARD_SHARED_ADMIN_REQUIRED` |

Domain exceptions preserve the existing NestJS HTTP exception hierarchy. Existing HTTP statuses and business decisions are unchanged.

Error codes must not contain tenant IDs, user IDs, device IDs, command IDs, event IDs, payload values, credentials, or other request-specific data.

## Validation Errors

Validation failures use:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "messages": [
          "email must be an email"
        ]
      }
    ]
  },
  "requestId": "request-123",
  "timestamp": "2026-07-16T00:00:00.000Z",
  "path": "/auth/register"
}
```

Validation details contain only field paths and validator messages.

DTO target objects, rejected values, credentials, tokens, payload bodies, and other untrusted request data are not copied into the response.

## Request Correlation

The response includes the same request identifier used by the HTTP logging layer.

The identifier is also returned in the `x-request-id` response header.

This allows operators and API clients to correlate an error response with structured request logs.

## Unexpected Errors

Unexpected exceptions return:

```json
{
  "statusCode": 500,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  },
  "requestId": "request-123",
  "timestamp": "2026-07-16T00:00:00.000Z",
  "path": "/devices"
}
```

Internal exception messages and stack traces are never returned to clients.

Unexpected errors are recorded as the structured event `http.error.unhandled` with request context and safe error classification. Raw exception messages and stack traces are not copied into this global event.

## Security Rules

Error responses must not expose:

* Passwords or password hashes
* Tokens or token hashes
* Device credentials
* Webhook secrets
* Authorization headers or cookies
* Database connection details
* Stack traces
* Raw telemetry or command payloads
* Tenant, user, device, or command context not already authorized for the request

## Compatibility

Generic NestJS HTTP exceptions remain supported for framework and non-normalized boundaries.

Normalized domain boundaries use domain exception subclasses carrying a stable code and message. The global exception filter preserves the code without changing the HTTP status or current business decision.

## Current Scope

Completed in Error Handling Consistency:

* Global exception filter
* Standard HTTP error envelope
* Stable status-based error codes
* Request ID propagation in error responses
* Normalized validation error details
* Internal exception detail masking
* Automated error contract tests
* Stable domain error-code catalog
* Domain exception subclasses preserving HTTP semantics
* Normalized error codes across auth, tenant, device, capability, telemetry, command, MQTT, and dashboard boundaries
* Automated source and runtime domain error-code contract tests
* Automated Error Handling Completion Review contract gate

## Completion Review Gate

The completion review verifies:

* Global bootstrap registration of the approved exception filter and validation exception factory
* Stable error-envelope fields and request-ID response correlation
* Query-string removal from the response path
* Preservation of approved domain codes and HTTP status semantics
* Safe fallback behavior for malformed or uncommon HTTP error codes
* Masking of server-side HTTP exception details and unexpected exception details
* Structured validation details without rejected values or payload data
* Unique, static, convention-compliant error-code values
* Continued domain-exception use across normalized auth, tenant, device, capability, telemetry, command, MQTT, and dashboard boundaries

Error Handling Consistency is complete.

Not included in this workstream:

* Localization
* Client-facing error catalogs
* Retry metadata
* Distributed tracing
* Swagger error schema coverage
* Integration or end-to-end error-path tests

## Next Workstream

Integration and End-to-End Testing is completed. Production Readiness Review is completed with a NOT READY deployment decision. Production Configuration and Process Lifecycle Foundation, Production Security Boundary Hardening, Deployment and Recovery Foundation, MQTT Production Transport Architecture Proposal, and MQTT Production Transport Implementation are completed. Production Readiness Completion Review is active.

Module 09 remains inactive.

## Dashboard Widget Resolution and Query Errors

Capability-driven widget validation uses `DASHBOARD_WIDGET_RESOLUTION_INVALID` for incompatible widget kind, binding mode, intent, capability permission, data type, bounds, or bounded configuration. A widget selector that is not present in an otherwise authorized dashboard uses `DASHBOARD_WIDGET_NOT_FOUND`. Cross-tenant and ownership failures continue to use the existing safe dashboard errors without leaking resource existence.
