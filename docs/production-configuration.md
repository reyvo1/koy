# Production Configuration and Process Lifecycle

## Scope

This document records the Production Configuration and Process Lifecycle Foundation. It resolves the process lifecycle finding from the Production Readiness Review and completes the configuration subset that precedes HTTP security boundary hardening.

The platform remains **NOT READY FOR PRODUCTION DEPLOYMENT**. Production MQTT transport, HTTP boundary controls, deployment and recovery, and release security gates remain separate work.

Module 09 remains inactive.

## Runtime Binding Contract

The production process consumes validated configuration rather than hardcoded listener values:

- `HOST` selects the bind address and defaults to `0.0.0.0`.
- `PORT` selects the listener port, defaults to `3000`, and must be between `1` and `65535`.
- Startup resolves both values through NestJS `ConfigService` before calling Fastify `listen()`.
- Missing or invalid configuration prevents the process from listening.

This contract supports native Windows development and future native VPS deployment without requiring local Docker.

## Swagger Policy

`SWAGGER_ENABLED` is a strict boolean configuration value.

- Development and test environments default to enabled unless explicitly disabled.
- Production defaults to disabled.
- Production configuration that attempts to enable Swagger is rejected before the application starts.

Production Security Boundary Hardening may define additional documentation exposure controls later. This foundation does not expose production Swagger.

## Secret Placeholder Policy

`MQTT_WEBHOOK_SECRET` and `JWT_SECRET` remain required and non-blank in every environment.

Production startup additionally rejects known example and replacement values, including the repository-documented `change_me_in_production` placeholder. Real secret storage, rotation, ownership, and deployment injection remain part of later deployment and security work.

## Application Lifecycle Contract

The production bootstrap:

1. Creates the NestJS Fastify application.
2. Resolves validated runtime settings.
3. Applies the shared application configuration.
4. Enables NestJS shutdown hooks.
5. Starts the listener on the validated host and port.

A startup failure is logged as the structured event `application.startup.failed`, sets a non-zero process exit code, and does not silently continue.

## Resource Shutdown Contract

Application shutdown is explicit and idempotent:

- Prisma implements the NestJS application shutdown hook and calls `$disconnect()`.
- Redis has a lifecycle provider registered in `RedisModule`.
- Redis first attempts `quit()` for graceful shutdown.
- Redis shutdown is bounded to five seconds.
- A failed or timed-out Redis quit falls back to `disconnect(false)`.
- Repeated Redis shutdown notifications share one shutdown promise and do not close the client repeatedly.

NestJS shutdown hooks make these cleanup contracts available for application close operations and supported process termination signals.

## Validation Evidence

The foundation is covered by:

- Configuration validation unit tests.
- Production bootstrap startup tests.
- Prisma shutdown unit tests.
- Redis graceful, failed, timed-out, already-closed, and repeated shutdown tests.
- Repository contract tests that preserve the production readiness boundary.
- Existing build, E2E, PostgreSQL integration, MQTT integration, full Jest, and coverage gates.

## Explicit Non-Goals

This slice does not:

- Implement the production MQTT publisher.
- Change Module 08 command behavior.
- Add CORS, trusted proxy, request-size, rate-limit, or metrics access controls.
- Define VPS deployment, TLS, service-manager, backup, or restore procedures.
- Upgrade Prisma or other major dependencies.
- Activate Module 09.

## Next Slice

Production Configuration and Process Lifecycle Foundation is complete. **Production Security Boundary Hardening** is the active slice.
