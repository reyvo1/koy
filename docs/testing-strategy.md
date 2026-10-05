# Integration and End-to-End Testing Strategy

## Purpose

This document defines the testing boundaries for the IoT Platform reliability phase.

It establishes a repeatable foundation for integration and end-to-end tests without changing the normalized Tenant, User, Device, Capability, Telemetry, or Command architecture.

The strategy remains vendor-neutral and protocol-neutral. PostgreSQL, Redis, and MQTT are treated as infrastructure boundaries, not as domain concepts.

## Current Foundation

Testing Strategy Foundation provides:

- Separate Jest execution for unit, integration, and E2E tests
- A shared application configuration function used by production and E2E bootstrap
- Fastify-native request injection without opening a network port
- A hermetic application bootstrap smoke test
- Stable per-run names for PostgreSQL, Redis, and MQTT resources
- Deterministic cleanup rules for service-backed tests

Database Integration Test Foundation adds:

- A dedicated database integration Jest configuration and runner
- An explicitly enabled, run-owned PostgreSQL schema
- Committed Prisma migration deployment into the isolated schema
- A Prisma persistence and transaction rollback proof
- Guaranteed schema cleanup from a `finally` path
- A required CI database integration gate

MQTT Workflow Integration Test Foundation adds:

- A runner-owned MQTT broker bound only to loopback on an ephemeral port
- Dedicated MQTT integration Jest configuration and explicit safety opt-in
- Non-retained publish and subscribe proof below the run-owned topic prefix
- broker-to-webhook telemetry persistence proof
- broker-to-webhook command acknowledgement proof
- Deterministic MQTT client, broker, application, Prisma, and schema teardown
- A required CI MQTT workflow integration gate

Integration and End-to-End Testing Completion Review confirms that the unit, contract, Fastify E2E, PostgreSQL, and MQTT workflow layers form one coherent reliability gate with deterministic cleanup and ordered CI execution.

## Test Layers

### Unit and contract tests

Location:

- `src/**/*.spec.ts`
- `test/**/*.spec.ts`

Purpose:

- Test one service, controller, helper, or contract at a time
- Replace infrastructure dependencies with controlled test doubles
- Run quickly in the default `npm test` suite

E2E files are explicitly excluded from the unit Jest configuration.

### Integration tests

Location:

- `test/integration/**/*.integration-spec.ts`

Purpose:

- Exercise real PostgreSQL, Redis, or MQTT infrastructure
- Validate repository, transaction, idempotency, and messaging behavior
- Use isolated per-run resources
- Avoid replacing the infrastructure boundary under test

The PostgreSQL and MQTT workflow foundations are implemented. Redis behavior integration and broader critical-platform scenarios remain future work.

### End-to-end tests

Location:

- `test/**/*.e2e-spec.ts`

Purpose:

- Exercise the NestJS and Fastify HTTP boundary through the shared production application configuration
- Verify routing, validation, exception normalization, interceptors, and response contracts
- Use `app.inject()` instead of opening a TCP listener

Command:

```text
npm run test:e2e
```

E2E tests run sequentially to keep setup and cleanup deterministic.

## Shared Application Bootstrap

`src/bootstrap/configure-application.ts` owns the cross-cutting application configuration shared by production and E2E tests:

- Global exception filter
- Global validation pipe
- Validation exception factory
- Optional application logger
- Optional Swagger registration

`src/main.ts` uses the shared configuration with Swagger enabled.

The E2E helper uses the same configuration with Swagger disabled. Disabling Swagger in tests avoids unrelated document-generation work while preserving HTTP runtime behavior.

Production behavior must not be duplicated in a separate test-only bootstrap.

## Test Run Identity

External test resources must be scoped by `TEST_RUN_ID`.

CI uses:

```text
ci-<github-run-id>-<github-run-attempt>
```

Local execution defaults to a process-scoped value when `TEST_RUN_ID` is not provided.

`test/support/test-resource-names.ts` produces bounded names for:

- PostgreSQL schema: `test_<run_id>`
- Redis key prefix: `iot:test:<run-id>:`
- MQTT topic prefix: `tests/<run-id>`

Run identifiers are sanitized and length-bounded before they are used in infrastructure identifiers.

## PostgreSQL Isolation

Each service-backed test run must use an isolated PostgreSQL database or schema derived from the approved test run identity.

Database Integration Test Foundation uses a run-owned PostgreSQL schema inside an explicitly approved test database. `test/scripts/run-database-integration.ts` creates the schema, applies committed migrations, runs the integration suite, and drops the schema from a `finally` path.

The runner requires `NODE_ENV=test` and `DATABASE_INTEGRATION_TESTS_ALLOWED=true`. Local execution is limited to a loopback PostgreSQL host unless CI explicitly owns the environment. `TEST_DATABASE_URL` is preferred; when it is absent, the runner may read `DATABASE_URL` from the process or local `.env`, but it still creates and drops only the run-owned schema.

Local PowerShell execution:

```powershell
$env:NODE_ENV = "test"
$env:DATABASE_INTEGRATION_TESTS_ALLOWED = "true"
npm run test:integration:db
```

Rules:

- Never use a development or production database
- Apply committed Prisma migrations with `prisma migrate deploy` before tests
- Do not use `prisma db push` as the CI migration contract
- Do not share mutable rows between test cases
- Delete the run-owned schema or database during teardown
- Cleanup must be safe to repeat after partial failure
- Integration tests that mutate the same resource run sequentially unless isolation is proven

## Redis Isolation

Redis integration tests must prefix every key with the run-owned prefix from `createTestResourceNames`.

Rules:

- Never use `FLUSHALL` or `FLUSHDB`
- Delete only keys owned by the current test run
- Use bounded `SCAN` plus `UNLINK` or `DEL` during cleanup
- Do not rely on a developer's existing Redis data
- Use test-specific expiry values when expiry behavior is under test
- Cleanup must run in `afterAll` and remain safe after a failed assertion

## MQTT Isolation

MQTT integration tests publish and subscribe only below the run-owned topic prefix. MQTT Workflow Integration Test Foundation starts a runner-owned MQTT broker on `127.0.0.1` with an ephemeral port, so local and CI execution do not depend on a developer broker or production topic root.

The runner requires `NODE_ENV=test`, `DATABASE_INTEGRATION_TESTS_ALLOWED=true`, and `MQTT_INTEGRATION_TESTS_ALLOWED=true`. It creates the run-owned PostgreSQL schema, applies committed migrations, starts the broker, runs the MQTT workflow suite, then closes the broker and drops the schema from a `finally` path.

Local PowerShell execution:

```powershell
$env:NODE_ENV = "test"
$env:DATABASE_INTEGRATION_TESTS_ALLOWED = "true"
$env:MQTT_INTEGRATION_TESTS_ALLOWED = "true"
npm run test:integration:mqtt
```

Rules:

- Never publish to production or normal device topic roots
- Use unique client identifiers per test process
- Default to non-retained messages
- When retained-message behavior is tested, clear retained messages during teardown
- Unsubscribe and disconnect clients during teardown
- Await acknowledgement or timeout explicitly; do not depend on arbitrary sleep intervals
- Type timer handles with `ReturnType<typeof setTimeout>` so integration tests remain portable across Node and workspace-provided ambient typings
- Preserve protocol-neutral domain assertions even when MQTT is the transport under test
- Keep the runner-owned broker test-only; do not wire it into production dependency injection

The existing webhook workflow remains isolated from the production publisher. Production command publishing is implemented through the approved MQTT adapter boundary without reopening Module 08.

## Deterministic Cleanup

Every service-backed test suite owns the resources it creates.

Cleanup requirements:

1. Register cleanup immediately after resource creation.
2. Delete only resources inside the current run namespace.
3. Make cleanup idempotent.
4. Execute cleanup from `finally` or `afterAll` paths.
5. Close Nest applications, Prisma clients, Redis clients, and MQTT clients.
6. Do not hide cleanup failures when they can leave shared CI infrastructure contaminated.

Tests must not depend on execution order, wall-clock sleeps, existing developer data, or resources created by another suite.

## CI Contract

The current GitHub Actions job runs:

1. Lifecycle-isolated dependency installation and explicit Prisma Client generation
2. Prisma schema validation
3. Prisma migration deployment
4. Application build
5. Unit and contract tests
6. E2E smoke test
7. Database integration test
8. MQTT workflow integration test
9. MQTT production publisher verified-TLS integration test
10. Coverage execution

The E2E smoke test is hermetic and runs on every push and pull request.

The PostgreSQL integration gate uses the existing PostgreSQL service container and a run-owned schema. The MQTT integration gate uses the same isolated database contract plus a runner-owned loopback broker, avoiding a shared broker and normal device topic roots. Future Redis integration gates must follow the same isolation and cleanup rules.

### CI Dependency Bootstrap

GitHub Actions installs the lockfile with `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`. This prevents unrelated package lifecycle scripts from running concurrently inside npm's clean-install phase.

The bootstrap then:

- verifies the bundled `argon2` native binary and rebuilds only that package when the probe fails;
- generates Prisma Client explicitly through the repository-local Prisma CLI;
- limits each Prisma generation attempt to 90 seconds;
- retries Prisma generation at most three times with bounded backoff;
- caches `~/.cache/prisma` across compatible runner, lockfile, and schema revisions;
- fails with a direct Prisma connectivity diagnostic instead of allowing npm to hang indefinitely.

Prisma validation and migration deployment also use the repository-local CLI directly rather than `npx`. This is a CI orchestration change only; dependency versions and runtime application behavior are unchanged.

## Current Database Proof

`test/integration/database.integration-spec.ts` proves that:

- The Prisma migration history can be deployed into a run-owned PostgreSQL schema
- Prisma resolves the expected schema through `DATABASE_URL`
- A representative `SystemMetadata` record can be written and read
- Prisma transaction rollback semantics are preserved
- Test-created rows are removed and the complete schema is dropped after the suite

Cleanup uses `DROP SCHEMA IF EXISTS <run-owned-schema> CASCADE`. The lifecycle does not use `DROP DATABASE`, `prisma db push`, global truncation, or any schema outside the run-owned namespace.

## Current MQTT Workflow Proof

`test/integration/mqtt.workflow.mqtt-integration-spec.ts` proves that:

- MQTT clients connect to a runner-owned broker over a real TCP MQTT connection
- A non-retained message round-trips below `tests/<run-id>`
- A telemetry message is received from the broker, translated through the existing telemetry webhook boundary, and persisted by Prisma
- A command acknowledgement is received from the broker, translated through the existing acknowledgement webhook boundary, and changes a `SENT` command to `ACKNOWLEDGED`
- All published test topics remain below the run-owned prefix; normal platform topics exist only inside the webhook payload after the test bridge strips the prefix
- MQTT clients, the Nest application, Prisma clients, the broker, and the PostgreSQL schema are closed or removed deterministically
- The application uses a Redis test double for this MQTT workflow proof, so no developer Redis process is contacted and no Redis retry handle can keep Jest alive
- The integration runner applies a bounded child-process timeout and still executes broker and database cleanup from `finally`

The bridge is test infrastructure that represents the external broker webhook integration boundary. It does not add a production subscriber or alter the protocol-neutral core domain.

## Current Smoke Proof

`test/application.smoke.e2e-spec.ts` proves that:

- A NestJS application can start through the shared Fastify test bootstrap
- Fastify request injection returns a successful response
- The production validation pipe is active
- The standard error envelope is active
- Error paths exclude query parameters
- Request correlation is present

This smoke proof is a foundation check, not complete critical-platform E2E coverage.

## Out of Scope for This Slice

MQTT Workflow Integration Test Foundation does not add:

- Broker authentication or ACL product configuration
- Retained-message behavior scenarios
- Redis behavior integration scenarios
- Broad authentication or user-journey E2E coverage
- Business logic changes
- Module 09 activation

## Completion Review

Integration and End-to-End Testing Completion Review verifies that:

- Unit and contract tests remain separated from E2E and service-backed integration suites
- Production and E2E application bootstrap share validation and global error configuration
- PostgreSQL tests deploy committed migrations inside a run-owned schema and clean it from a `finally` path
- MQTT tests own a loopback broker, publish only below `tests/<run-id>`, and close clients and infrastructure deterministically
- Telemetry persistence and command acknowledgement are exercised through the existing webhook boundaries
- GitHub Actions executes schema validation, migrations, build, unit tests, E2E, database integration, MQTT integration, and coverage in a stable order
- Node.js 22 remains the validated local and CI runtime
- Production `MqttService.publish()` delegates to the verified-TLS adapter and MQTT readiness reflects real transport state
- Module 09 remains inactive

The automated review is implemented in `test/integration-e2e-testing-completion.contract.spec.ts`. The Integration and End-to-End Testing workstream is complete. This closure confirms the approved testing foundations; it does not claim broad authentication journeys, Redis behavior integration, retained-message scenarios, or production broker configuration.

## Next Workstream

Production Readiness Review retains a NOT READY deployment decision until explicit environment approval. Production Configuration and Process Lifecycle Foundation, Production Security Boundary Hardening, Deployment and Recovery Foundation, MQTT Production Transport Architecture Proposal, and MQTT Production Transport Implementation are completed. Production Readiness Completion Review local gates passed. Two remote runs then failed before tests during npm lifecycle execution, so CI Dependency Bootstrap Stabilization is the active completion-review subtask. Module 09 remains inactive until the stabilized workflow is green remotely and activation is explicitly approved.

## CI environment isolation

- Tests that verify configuration defaults must clear and restore CI-provided environment overrides.
- The logger configuration contract specifically isolates `LOG_LEVEL` so GitHub Actions and local execution assert the same default behavior.

## Node Runtime Contract

- Local development and GitHub Actions use Node.js `22.23.1` with npm `10.9.8`.
- `.nvmrc` and `.node-version` pin the validated local and CI runtime.
- `package.json` accepts Node.js 22 only through `engines.node` and records the npm toolchain through `packageManager`.
- Native Windows development is supported; Docker is not required for local development.
- PostgreSQL, Redis, and MQTT may run as native local services. Containerized deployment remains optional for future staging or VPS production.
- Runtime major-version changes require a dedicated validation checkpoint before feature work continues.

## Risk-Based Validation Cadence

Validation depth follows the changed boundary:

- documentation or architecture-proposal changes: `git diff --check`, document contract checks, and focused tests only;
- application runtime changes: non-mutating lint, build, and focused unit or contract tests;
- PostgreSQL, MQTT, Redis, security, or deployment changes: add the relevant integration or operational gate;
- completion reviews and release checkpoints: full Jest, coverage, E2E, database integration, MQTT integration, recovery, release verification, and startup smoke as applicable.

A light validation slice must not skip a gate that directly covers the changed behavior. Unrelated heavy gates should not be repeated without a risk-based reason.

## Deployment and Recovery Validation

Deployment and Recovery Foundation adds repository-owned operational gates:

- `npm run lint:check` performs non-mutating TypeScript lint;
- `npm run security:audit:production` fails on unreviewed critical production dependencies and expired acceptances;
- `npm run test:recovery` provisions run-owned PostgreSQL source and target databases, applies committed migrations, dumps, restores, verifies marker data and migration history, and cleans up in `finally`;
- `npm run baseline:manifest:generate` writes the canonical source tree/hash manifest while excluding only runtime/build artifacts; `npm run baseline:manifest:verify` fails if source-set coverage or hashes drift;
- `npm run release:build` creates a source-free, secret-free production release directory and SHA-256 manifest;
- `npm run release:verify` verifies required files, exact manifest file-set coverage, symlink rejection, checksums, and packaged lockfile provenance;
- `npm run release:approve -- --release=<dir> --evidence=<file> --environment=<production-environment-evidence.json>` is the separate final approval evidence gate: current-source RESCUE-02B evidence must validate, simulated-hardware or genuine physical evidence must remain source-bound, the environment receipt must validate and match the exact release manifest, and the release source fingerprint must match the sealed baseline;
- `npm run release:verify` verifies required files and every manifest checksum;
- `npm run test:startup:production` starts the compiled release under production configuration, proves liveness, and confirms MQTT readiness remains honestly unavailable;
- CI validates deployment shell syntax and uploads the verified artifact with bounded retention.

Local Windows development remains native and does not require Docker. The recovery drill discovers standard PostgreSQL client installations or accepts `PG_BIN_DIR`.

## Production MQTT Publisher Proof

`test/mqtt-production-publisher.integration-spec.ts` proves that the production adapter:

- establishes a verified TLS connection using a trusted test CA;
- speaks MQTT 5;
- publishes a command with QoS 1 and `retain=false`;
- waits for broker PUBACK confirmation;
- sets bounded message expiry;
- closes without leaving sockets or reconnect timers.

The test uses a test-only TLS certificate and a minimal MQTT 5 confirmation harness. It does not require Docker, WSL, an installed broker, or production credentials.

<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:START -->

## CI Dependency Bootstrap Recovery Validation

This operational slice uses risk-based validation rather than repeating the complete application suite locally. Required local gates are Bash syntax validation, bootstrap `--validate-only`, workflow and contract formatting, focused ESLint, the dedicated CI dependency bootstrap contract test, and Git diff checks. The application source, Prisma schema, package manifests, lockfile, and production runtime are not changed.

The decisive acceptance gate is a complete successful remote GitHub Actions run. Module 09 remains inactive until that evidence exists.
<!-- CI-DEPENDENCY-BOOTSTRAP-STABILIZATION:END -->

## CI Lockfile Registry Provenance Recovery - 2026-07-18

GitHub Actions run 80140752022 showed that dependency bootstrap was blocked by package-lock.json resolved URLs referencing an environment-specific internal Artifactory host. GitHub-hosted runners could not reach that host and npm retried until the bounded bootstrap terminated.

This recovery normalizes only the affected resolved URL prefixes to https://registry.npmjs.org/, while preserving dependency versions and integrity values. CI now fails fast if private registry provenance returns and explicitly replaces registry hosts with the public npm registry. Application source, Prisma schema, package.json, system architecture, and Module 09 activation are unchanged. Module 09 remains inactive until the complete remote workflow succeeds.

<!-- CI-ORDERED-WORKFLOW-MARKER-REPAIR-20260718:START -->

## CI Ordered Workflow Marker Repair

Remote GitHub Actions run 80153444968 completed dependency bootstrap, the production dependency audit policy, non-mutating lint, deployment shell validation, Prisma validation and migration deployment, and the application build. Full Jest then failed only because the Integration and End-to-End Testing Completion Review contract retained commands from the former workflow.

The ordered contract now tracks the current commands for the bounded dependency bootstrap, production dependency audit policy, and direct Prisma CLI validation and migration steps. Application source, Prisma schema, package manifests, dependency lock data, architecture, and Module 09 activation are unchanged. Module 09 remains inactive until a complete remote GitHub Actions run reports success.
<!-- CI-ORDERED-WORKFLOW-MARKER-REPAIR-20260718:END -->
