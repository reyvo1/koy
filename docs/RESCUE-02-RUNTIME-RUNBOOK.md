# RESCUE-02 Runtime Runbook — Core Device Flow

> Status: **SOURCE CONTRACT REPAIRED / RUNTIME ACCEPTANCE PENDING**
>
> This runbook is the runtime gate for RESCUE-02. Do not mark the IoT core flow production-ready from static validation alone.

## Canonical Flow

`login -> tenant context -> register device -> pair -> capability -> heartbeat -> MQTT auth/ACL -> telemetry -> dashboard/realtime -> command -> device ACK -> history -> scene/schedule -> notification/report`

## Canonical Device Contract

### Pairing

1. Admin creates a device.
2. UI shows one-time pairing code `<deviceId>:<provisioningToken>`.
3. Device generates its own random secret.
4. Device calls `POST /devices/<deviceId>/pair` with:

```json
{
  "token": "<one-time-token>",
  "password": "<device-generated-secret>"
}
```

5. Backend returns trusted `deviceId`, `tenantId`, `mqttUri`, and `mqttUsername`.
6. The provisioning token is cleared and the credential is upserted server-side.

Pairing must fail closed when `MQTT_BROKER_URL` is not configured.

### Heartbeat

Device calls `PATCH /devices/<deviceId>/heartbeat` with:

- `X-Device-Id: <deviceId>`
- `X-Device-Secret: <device-secret>`

A successful heartbeat updates `lastHeartbeatAt` and marks the device ACTIVE.

### MQTT Topics

For tenant `<tenantId>` and device `<deviceId>`:

- Telemetry publish: `tenants/<tenantId>/devices/<deviceId>/telemetry`
- Command subscribe: `tenants/<tenantId>/devices/<deviceId>/commands`
- ACK publish: `tenants/<tenantId>/devices/<deviceId>/commands/ack`

Device credentials must not authorize any other tenant/device topic.

### Telemetry Envelope

Device MQTT payload:

```json
{
  "eventId": "<unique-event-id>",
  "payload": {
    "temperature": 27.2
  }
}
```

The broker HTTP integration must forward the decoded values to:

`POST /mqtt/webhook/telemetry`

with header `X-Webhook-Secret: <MQTT_WEBHOOK_SECRET>` and body:

```json
{
  "topic": "tenants/<tenantId>/devices/<deviceId>/telemetry",
  "eventId": "<unique-event-id>",
  "payload": {
    "temperature": 27.2
  }
}
```

Capability keys must already exist for that device. The server deliberately rejects unknown capability keys.

### Command + ACK

Backend publishes a command to the command topic as:

```json
{
  "commandId": "<correlation-id>",
  "payload": {
    "switch.power": true
  }
}
```

Device publishes ACK to the ACK topic. Duplicate QoS-1 command delivery must not execute the actuator twice; the SDK suppresses an in-flight duplicate commandId and replays the cached terminal ACK/FAILED for a completed duplicate (RAM cache only):

```json
{
  "commandId": "<correlation-id>",
  "status": "ACK",
  "reason": ""
}
```

The broker HTTP integration must forward the decoded ACK to:

`POST /mqtt/ack`

with header `X-Webhook-Secret: <MQTT_WEBHOOK_SECRET>` and body:

```json
{
  "topic": "tenants/<tenantId>/devices/<deviceId>/commands/ack",
  "payload": {
    "commandId": "<correlation-id>",
    "status": "ACK",
    "reason": ""
  }
}
```

## EMQX 5.9.2 Wiring Gate

The repository now includes `docker-compose.rescue.yml` for the **complete local rescue runtime**. PostgreSQL, Redis, EMQX 5.9.2, and the API share one Compose network. Broker auth/webhook callbacks use the internal service address `http://api:3000`, so local acceptance does not depend on Windows/WSL/Podman host-loopback routing. The rescue broker persists `/opt/emqx/data` in a named volume so Dashboard/API configuration survives ordinary container recreation. This still does not prove production TLS, backup/restore policy, or hardware acceptance.

EMQX 5.9.2 supports ACL rules embedded directly in a successful HTTP authentication response. The canonical rescue path now uses that capability: backend `POST /mqtt/auth` returns exact device-bound publish/subscribe permissions and a deny-all fallback. The older `POST /mqtt/acl` endpoint remains available for compatibility and independent checks, but a second HTTP authorizer is not required for the canonical 5.9.2 flow.

Full runtime readiness is fail-closed on broker authentication: `scripts/check-rescue-runtime.mjs --probe-scope=full` must prove both a valid publisher CONNECT and rejection of the same username with a freshly generated wrong password. A broker that accepts both credentials is a security blocker and cannot produce Gate 1 PASS.

Before runtime acceptance, configure and test all of these:

1. HTTP password authentication -> backend `POST /mqtt/auth` with `X-Webhook-Secret`.
2. The same authenticator accepts two deliberately separated identities:
   - a device username/password, returning only that device's telemetry/ACK publish + command subscribe ACL;
   - the API publisher service account from `MQTT_USERNAME` / `MQTT_PASSWORD`, returning only `tenants/+/devices/+/commands` publish permission.
3. Broker authorization fallback -> `no_match=deny`; successful auth supplies the exact ACL and all unmatched operations stay denied.
4. Telemetry rule/webhook -> backend `POST /mqtt/webhook/telemetry` with decoded `eventId` and `payload`.
5. Command ACK rule/webhook -> backend `POST /mqtt/ack` with decoded ACK under `payload`.
6. Add `X-Webhook-Secret` to every backend auth/webhook request.
7. Verify an invalid device secret is denied.
8. Verify a revoked device is denied.
9. Verify a device cannot publish/subscribe to another device or tenant topic.
10. Verify the API publisher can publish command topics but cannot publish telemetry/ACK or subscribe as a device.

Helpers:

- `npm run rescue:runtime:check` is strict by default and reports missing runtime prerequisites without loading project dependencies. Container tooling is **not** a runtime acceptance requirement by itself; Docker/Podman is informational unless `--require-container-runtime` is explicitly requested for the local-compose path.
- `npm run rescue:runtime:check -- --probe` is protocol-aware: PostgreSQL must answer its wire-protocol negotiation, Redis must answer `PING` with `PONG`, MQTT must accept an authenticated MQTT 3.1.1 CONNECT, EMQX Dashboard credentials must return a login token, and the API must return `200` with `status=ready` from `/health/ready`. A listening TCP port alone is not PASS.
- `npm run rescue:runtime:self-test` exercises the dependency-free probe implementation against temporary valid and deliberately-invalid protocol fixtures. It is a checker regression test only, never live runtime evidence.
- `npm run rescue:acceptance:self-test` exercises the acceptance orchestrator in a temporary copied source tree with protocol-valid synthetic service fixtures and a fake npm recorder. The copier excludes generated `.next`, `node_modules`, `dist`, `coverage`, and `.git` directory segments at any depth before `cpSync`, so a prior Windows Next build cannot inject symlink forests into the synthetic fixture. It proves the runner can reach every full-suite slot and that build/test execution modes are isolated; it never executes the real dependency-resolved suite and is never runtime evidence.
- `npm run rescue:unit-types:self-test` verifies the root Jest boundary: test discovery is limited to backend `src`, root `test`, and canonical Mobile unit-test source; ts-jest uses `tsconfig.jest.json`; Admin/User Web Next declarations are excluded; and automation runtime policy injection remains independent of ambient `NodeJS.ProcessEnv` augmentation.
- `npm run rescue:emqx:configure` configures the EMQX HTTP authenticator and fail-closed authorization fallback after EMQX and the API are reachable.
- `npm run rescue:emqx:webhooks:configure` then validates the live EMQX OpenAPI surface plus `bridges_probe` compatibility before idempotently configuring the telemetry and ACK webhook/rule pair. It fails before mutation when the broker contract is unsupported.
- `npm run rescue:emqx:webhooks:self-test` regression-tests OpenAPI/probe fail-closed behavior with synthetic fixtures only; it is never live broker evidence.
- `ops/emqx/README.md` contains the exact telemetry and ACK webhook contract and manual fallback.

Do not expose the broker as production-ready while those checks are missing.

## Local Bring-up Order

For the local Docker/Podman rescue topology, the canonical path is now the fail-closed orchestrator. It configures telemetry/ACK webhooks only after the live broker proves the required OpenAPI + probe contract, but it still does **not** claim RESCUE-02B acceptance.

1. Initialize a real gitignored local environment with `npm run rescue:env:init`. The helper generates local-only secrets without printing them and refuses overwrite unless `--force` is explicit. Do not pass `ops/env/rescue-local.env.example` to the runtime orchestrator.
2. Run `npm ci --ignore-scripts --prefer-offline --no-audit --fund=false --progress=false` successfully. A partial install is a failure; remove partial `node_modules` before retrying. If dependency bootstrap fails or stalls, run `npm run rescue:bootstrap:doctor -- --json=reports/rescue-bootstrap-diagnostic.json`.
3. Require `npm run rescue:bootstrap:doctor` to report `READY`.
4. Review the no-mutation execution order with `npm run rescue:local:plan`.
5. Run `npm run rescue:local:up`. The orchestrator:

   **RR28 host-broker isolation:** local rescue EMQX keeps its canonical container-network endpoint at `emqx:1883`, but it is exposed to the Windows host on dedicated `RESCUE_MQTT_HOST_PORT` (default `18884`). This is deliberately separate from generic/local `MQTT_PORT=1883`, because a developer may already run Mosquitto or another broker there. The local orchestrator refuses an occupied rescue host port instead of silently probing the wrong broker. The exact `mqttHostPort`/`mqttHostUrl` that reaches protocol readiness is persisted in `reports/local-runtime/state.json`; Gate 1, Gate 1 validation, and local automated acceptance re-use that source-bound endpoint. Do not stop an unrelated broker merely to make rescue validation pass—choose a free `RESCUE_MQTT_HOST_PORT` instead.

   - requires Docker Compose or Podman Compose and a non-placeholder env;
   - runs the strict non-network preflight before mutation;
   - starts PostgreSQL, Redis, and EMQX from `docker-compose.rescue.yml`;
   - waits for the staged `--probe-scope=infra` checks (PostgreSQL protocol, Redis `PING/PONG`, authenticated EMQX Dashboard login);
   - builds the source-controlled rescue API image with Node 22 and npm 10;
   - starts the `api` Compose service; its container entrypoint applies committed `prisma migrate deploy` migrations and then starts `dist/main.js`;
   - waits for the host-published `/health/live` endpoint while all API dependency URLs remain internal service names (`postgres`, `redis`, `emqx`);
   - configures EMQX HTTP authentication/fail-closed authorization using `scripts/configure-emqx-http-auth.mjs`;
   - validates live EMQX OpenAPI/bridge-probe compatibility and idempotently configures telemetry/ACK webhook bridges + rules using `scripts/configure-emqx-webhooks.mjs`;
   - waits for `--probe-scope=full` (PostgreSQL/Redis/authenticated MQTT/EMQX/API readiness).
6. If any bring-up stage fails, the orchestrator brings the complete compose stack down by default. Use `--keep-on-failure` only for deliberate operator debugging.
7. `npm run rescue:local:status` reports compose-managed API state plus staged infra/full protocol readiness. `npm run rescue:local:down` stops the complete compose runtime while preserving named data volumes. Only `npm run rescue:local:down -- --volumes` deletes the local rescue volumes. After a Windows BSOD, forced reboot, Podman interruption, or an interrupted `rescue:local:up`, use `npm run rescue:local:recover` instead of manually guessing container state. Recovery preserves named volumes, tears down any possibly partial stack, reruns the complete bring-up, and returns only after full protocol readiness is reproved. `rescue:local:recover -- --volumes` is rejected by design.
8. **Boundary:** the orchestrator may finish with source-controlled telemetry/ACK webhook rules configured, but that is configuration state only. It stops at `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`; execute the live broker delivery/idempotency/ACK/ACL/wrong-secret evidence gate before any RESCUE-02B claim.

For **External/managed services** using approved PostgreSQL, Redis, and EMQX, do not use `rescue:local:up`. Point `DATABASE_URL`, `REDIS_URL`, `MQTT_BROKER_URL`, `EMQX_API_URL`, and `API_PROBE_URL` at those services, run `npm run rescue:runtime:check -- --probe`, and follow the same migration/API/EMQX/evidence contracts. Docker/Podman is not required when external services pass the protocol-aware probes.

`npm run rescue:runtime:check -- --probe-scope=infra` is a staged bootstrap probe only; it intentionally omits MQTT publisher authentication and API readiness. `--probe` (or `--probe-scope=full`) remains the acceptance preflight and requires all five protocol boundaries. A listening TCP port alone is never PASS.

## Automated Acceptance Evidence

Use the dependency-free orchestrator to prevent partial/manual PASS claims:

```bash
npm run rescue:acceptance -- --env=.env
```

This performs source validation, exact baseline-manifest verification, lifecycle validation, plus strict protocol-aware runtime preflight and writes a JSON evidence file under `reports/`. The acceptance report embeds a structured `runtimePreflight` object with `blockerCount`, blocker names/details, and every checked row; CI/operator tooling does not need to scrape the human table. It exits blocked if dependencies, secrets, or configured services are unavailable.

After prerequisites are genuinely green, run:

```bash
npm run rescue:acceptance -- --env=.env --full
```

`--full` additionally executes the backend production build, web/mobile validation, unit/contract tests, isolated database integration, and MQTT integration. Root unit/contract tests run behind a dedicated `tsconfig.jest.json`/Jest root boundary so Admin Web and User Web `next-env.d.ts` declarations cannot ambiently change backend test types. The selected `--env` values are propagated while execution mode is isolated per step: backend and web/mobile build validation are explicitly forced to `NODE_ENV=production`, and unit/contract plus integration steps are explicitly forced to `NODE_ENV=test`. This prevents a local rescue `.env` with `NODE_ENV=development` from leaking development React/Next semantics into `next build`, while retaining the explicit `DATABASE_INTEGRATION_TESTS_ALLOWED` / `MQTT_INTEGRATION_TESTS_ALLOWED` opt-ins for safe run-owned-schema tests. The runner also handles Windows `npm.cmd` explicitly. A green automated report still does **not** prove the live EMQX authenticator/ACL/webhook vertical flow or physical ESP32 behavior; both remain separate gates below.


### Auditable final RESCUE-02B evidence gate

A green `--full` report is intentionally **not** the final RESCUE-02B PASS. The
full report now carries SHA-256 fingerprints for `package-lock.json`,
`BASELINE-MANIFEST.sha256`, and `repository-tree.txt` so evidence from another
baseline cannot be silently reused.

After the automated full suite passes, initialize a runtime/hardware evidence
record from that exact report:

```bash
npm run rescue:evidence:init -- \
  --automated-report=reports/rescue-runtime-acceptance-<timestamp>.json
```

Then execute the Runtime Acceptance Checklist, the EMQX negative/ACL/webhook
checks, and the physical ESP32 boundary below. Every PASS row must be bound to
a real evidence artifact and its SHA-256; free-text-only evidence is rejected.
Use `npm run rescue:evidence:attach -- --file=<evidence.json>
--section=<runtimeFlow|liveBroker|physicalEsp32> --check=<id>
--artifact=<path> --note=<description>` to attach redacted logs, transcripts,
screenshots, or serial captures without manually calculating hashes. Do not put
passwords, pairing tokens, MQTT secrets, Dashboard credentials, private keys,
or other secret values in the JSON evidence or attached evidence artifact.

Validate the completed record with:

```bash
npm run rescue:evidence:validate -- \
  --file=reports/rescue-02b-evidence-<timestamp>.json
```

The validator fails closed unless all required runtime, broker, and physical
ESP32 rows are `PASS` with concrete evidence and the automated report fingerprint
matches the current source baseline. The source-controlled schema/example lives
under `ops/acceptance/`; generated evidence under `reports/` is intentionally
ignored by source packaging.

OTA digest verification remains **production-only** and may be `DEFERRED` in a
RESCUE-02B evidence record because the current SDK deliberately fails closed
until artifact-byte SHA-256 verification is implemented and hardware-proven.
`DEFERRED` is never interpreted as OTA PASS.

For a future production-only OTA `PASS`, record the exact firmware artifact
path, SHA-256 of those bytes, the digest observed/reported by the tested device,
physical device identity, execution timestamp, and a concrete evidence
reference. The validator requires the local artifact bytes and both digests to
match; a bare textual OTA PASS is rejected.

After `npm run release:build` and `npm run release:verify`, run the separate
production approval gate from the same sealed source baseline:

```bash
npm run release:approve -- \
  --release=artifacts/iot-platform-release \
  --evidence=reports/rescue-02b-evidence-<timestamp>.json
```

`release:verify` proves package integrity only. `release:approve` additionally
requires current-source RESCUE-02B evidence PASS, production OTA PASS, an exact
manifest-covered release file set, and a release source fingerprint matching
the sealed source tree. A successful approval writes `production-approval.json`
inside the release directory, binding the release-manifest SHA-256, evidence
SHA-256, source fingerprint, and OTA digests. The VPS installer invokes the
packaged verifier with `--require-approved` and refuses an absent, stale, or
tampered receipt **before** dependency install, migration, or symlink activation.
Do not deploy based only on a green release integrity check.

## Scheduler Runtime Activation

Schedule execution is deliberately opt-in. For RESCUE-02B runtime acceptance set:

```env
SCHEDULER_RUNTIME_ENABLED=true
SCHEDULER_CLAIM_TIMEOUT_MS=300000
```

`SCHEDULER_CLAIM_TIMEOUT_MS` must stay between **60000** and **3600000** milliseconds. A durable `ScheduleRun` is claimed with its database `claimedAt` timestamp as the ownership token. If an API/worker process dies and the claim exceeds this lease, the runtime worker returns the row to `PENDING`; settlement from the old worker is rejected because its `claimedAt` token no longer matches. Scene retries keep the stable `requestId=sched:<runId>`, so recovery reconciles through Scene idempotency rather than blindly redispatching device actions.

For missed runs, `SKIP_TO_NEXT` executes only the newest due activation and marks all older due activations skipped. `RUN_IMMEDIATELY` replays only the newest bounded catch-up window (`maxCatchUpPerSchedule`), skipping stale overflow.

## Automation Runtime Activation

Telemetry-driven automation execution is separately fail-closed. For
RESCUE-02B automation acceptance set:

```env
AUTOMATION_RUNTIME_ENABLED=true
```

This flag only makes the trusted post-ingestion coordinator reachable. Each
automation still defaults to `enabled=false` and must be activated explicitly
by its owning membership through the automation activation contract. Activation
revalidates the persisted trigger/action devices and capabilities before
changing state; a revoked device, missing capability, or changed
writable/reportable contract keeps the rule disabled. Deactivation does not
require the runtime flag and remains available as the rollback path.

Do not treat `AUTOMATION_RUNTIME_ENABLED=true` by itself as proof that an
automation executed on hardware. Runtime acceptance still requires accepted
telemetry, persisted execution evidence, command dispatch, broker delivery,
device ACK/telemetry reconciliation, and the applicable hardware proof.

## Runtime Acceptance Checklist

Record PASS/FAIL and evidence for every row:

| Gate | Expected result |
|---|---|
| Login | authenticated user receives valid session |
| Tenant context | API data is isolated to active tenant |
| Register device | platform creates PROVISIONING device and one-time pairing code |
| Pair | device becomes PAIRED; credentials stored hashed; broker config returned |
| Re-pair safety | valid new one-time token rotates/upserts credential safely |
| Capability | tenant can register at least one real capability |
| Heartbeat | heartbeat authenticates device and device becomes ACTIVE |
| MQTT auth | correct device secret allowed; wrong secret denied |
| MQTT publisher auth | API service account connects and can publish commands only |
| MQTT ACL | device: telemetry + ACK publish and command subscribe only; publisher: command publish only |
| Telemetry | event persists once; duplicate `eventId` handled idempotently |
| Realtime/dashboard | fresh telemetry appears on canonical tenant surface |
| Command | UI command becomes canonical backend payload and is published |
| ACK | device ACK resolves the correct command; identical QoS-1 ACK replay is idempotent |
| History | canonical device/tenant command history shows capability/status |
| Command replay safety | duplicate commandId does not invoke the device handler twice; completed duplicate replays ACK/FAILED |
| Scene | real scene action invokes device command path |
| Automation | owner activates a valid rule; accepted telemetry triggers persisted execution + command path only while `AUTOMATION_RUNTIME_ENABLED=true` |
| Schedule | worker enabled; stale CLAIMED lease recovers safely; distinct CRON/COUNTDOWN instants materialize; due run invokes intended scene/action once; SKIP_TO_NEXT chooses newest due activation |
| Notification/report | real event/report reflects persisted domain data |

## Hardware Boundary

The ESP32 SDK source contract is aligned in RESCUE-02, but the following are still required before hardware-production approval:

- ESP-IDF compile using the supported ESP-IDF version.
- Real board provisioning and reboot persistence.
- TLS certificate validation against the actual API and MQTT broker.
- Wi-Fi loss/reconnect test.
- MQTT reconnect and duplicate delivery test, including RAM-cache commandId suppression and ACK replay.
- Reboot behavior is tested separately because command dedupe cache is intentionally not persisted across reboot.
- Telemetry/command/ACK/heartbeat test on a physical board.
- OTA digest verification proof on a physical board. OTA remains outside the RESCUE-02 production claim.

## Generated TypeScript incremental metadata

Admin Web and User Web use TypeScript incremental checking, but their `tsBuildInfoFile` is pinned under `.next/cache/`. The sealed-source manifest also ignores `*.tsbuildinfo` at any source depth because this is generated compiler metadata, not source. This exclusion does **not** relax ordinary source drift: the baseline-manifest self-test creates both a generated build-info file (must be ignored) and an ordinary untracked `.ts` file (must still fail verification).

Use `npm run baseline:manifest:self-test` when diagnosing baseline hygiene. A root/workspace `tsconfig.tsbuildinfo` left by an older checkpoint may remain on disk; RR18+ manifest verification must ignore it.

## Gate 1 closure and Gate 2 entry

Gate 1 is **Dependency & Core Runtime Bring-up**. It is not complete merely because the source/static validators pass. The machine gate is:

```bash
npm run rescue:gate1 -- --env=.env --topology=local --attempt-install
```

For local topology the runner has two fail-closed paths. If no tracked runtime exists, it performs `rescue:local:up` itself. If the operator already ran `rescue:local:up`, Gate 1 may reuse that still-live runtime **only** when the tracked state is `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`, the selected environment file matches, and the runtime state carries the exact current sealed-source fingerprint. Reuse never bypasses the fresh blocker-free `--probe-scope=full` check. After an OS/container-runtime interruption, an older/unbound state, different environment, unreadable state, or non-ready transient state must be normalized with `npm run rescue:local:recover`; recovery preserves named volumes and re-proves the full local runtime before Gate 1 is retried.

For approved external/managed PostgreSQL, Redis, EMQX, MQTT, and API topology use `--topology=external`; the same full protocol-aware preflight is required. A Gate 1 report is written under `reports/gate1/` and is source-fingerprinted to `package-lock.json`, `BASELINE-MANIFEST.sha256`, and `repository-tree.txt`. For local topology the receipt also embeds the source-bound runtime state used for the PASS decision.

A blocked dependency bootstrap, missing environment, failed local bring-up, or any full protocol blocker produces a `GATE1_BLOCKED_*` report and **must not** be relabeled PASS. Gate 2 may begin only when the PASS receipt is revalidated against the current live environment:

```bash
npm run rescue:gate1:validate

# Optional: validate a specific receipt explicitly
npm run rescue:gate1:validate -- --file=reports/gate1/gate1-....json
```

The validator re-checks the sealed source fingerprint, dependency doctor `READY`, and blocker-free `--probe-scope=full`. For local topology it also requires the current tracked `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING` state to use runtime-state schema v3, match the receipt/current sealed-source fingerprint, and belong to the same environment file. Registry/network reachability is not required after dependencies are already installed.
