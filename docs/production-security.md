# Production Security Boundary Hardening

## Status

Completed.

This slice closes the application-level HTTP security boundary identified by `PR-003`. It does not declare the platform ready for production deployment, does not implement the production MQTT publisher, and does not activate Module 09.

## CORS Allowlist Contract

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact origins.

The validation contract:

- rejects wildcard origins;
- rejects credentials, paths, query strings, and fragments;
- permits only HTTP and HTTPS origins outside production;
- requires a non-empty HTTPS-only allowlist in production;
- deduplicates configured origins before application bootstrap.

The shared application bootstrap passes the validated list to NestJS Fastify CORS with explicit methods and headers. Credentials are disabled because the current API uses explicit bearer and device credentials rather than browser cookies.

## Trusted Proxy and Request Boundary

The production Fastify adapter applies fixed application-level limits:

- trusted proxies: loopback only (`127.0.0.1` and `::1`);
- request body limit: `262144` bytes (256 KiB);
- request receive timeout: `30000` milliseconds.

Forwarded client addresses are accepted only when the direct peer is loopback. Deployment and Recovery Foundation must keep the reverse proxy on the same host or propose a reviewed proxy-range change.

The global body limit is a transport boundary. Existing domain payload validation remains authoritative for capability, telemetry, and command semantics.

## Sensitive Authentication Rate Limit

The following public authentication routes are rate-limited per route and resolved client IP:

- `/auth/register`
- `/auth/verify-email`
- `/auth/login`
- `/auth/refresh`
- `/auth/forgot-password`
- `/auth/reset-password`

Configuration:

- `SENSITIVE_RATE_LIMIT_MAX`
- `SENSITIVE_RATE_LIMIT_WINDOW_MS`

The limiter uses Redis with an atomic increment-and-expiry script. Redis keys contain a SHA-256 digest rather than a raw client IP. Exceeded requests return HTTP `429` with the stable `AUTH_RATE_LIMIT_EXCEEDED` code and a `Retry-After` header.

The limiter fails closed for protected authentication routes when Redis cannot enforce the boundary. Non-sensitive routes do not access the limiter.

## Metrics Access Boundary

Production requires `METRICS_ACCESS_TOKEN`.

`GET /metrics` requires:

```text
Authorization: Bearer <METRICS_ACCESS_TOKEN>
```

The guard compares tokens with a constant-time comparison and returns the stable `METRICS_ACCESS_DENIED` error code for missing or invalid credentials. Local development and tests may omit the token; production configuration validation may not.

Deployment and Recovery Foundation must additionally restrict `/metrics` at the reverse proxy or monitoring network boundary. The application token is defense in depth, not a replacement for network policy.

## Validation Evidence

The slice includes focused tests for:

- production configuration validation;
- exact CORS parsing;
- CORS response and strict preflight behavior;
- loopback-only forwarded IP trust;
- payload-size rejection;
- Redis-backed authentication rate limiting;
- fail-closed rate-limit behavior;
- metrics bearer-token authorization;
- stable readiness and architecture boundaries.

Full unit, contract, E2E, PostgreSQL integration, MQTT integration, build, and coverage gates remain required before commit.

## Explicit Non-Goals

This slice does not:

- define Nginx, systemd, TLS, or VPS file ownership;
- implement PostgreSQL backup or restore procedures;
- add a dependency audit or release artifact gate;
- configure production MQTT transport;
- redesign tenant, device, capability, telemetry, or command behavior;
- activate Module 09.

## Next Slice

Production Security Boundary Hardening, Deployment and Recovery Foundation, MQTT Production Transport Architecture Proposal, and MQTT Production Transport Implementation are complete. Production Readiness Completion Review is active. The platform remains **NOT READY FOR PRODUCTION DEPLOYMENT**.
