# Rescue Workflow

This workflow replaces numbered Module/Slice progression for current product work.

## Mandatory Start

Before changing code:

1. Read `CURRENT-STATE.md`.
2. Read `PROJECT-HANDOFF.md`.
3. Read `docs/UI-ROUTE-MAP.md` for the product surface being changed.
4. For device/MQTT work, read `docs/RESCUE-02-RUNTIME-RUNBOOK.md`.
5. Confirm the request belongs to this IoT project only.
6. Prefer source/runtime evidence over historical roadmap statements.

## Change Loop

For each bounded change:

1. Identify the real user flow and backend/device contract.
2. Change the smallest safe surface.
3. Never add fake data to make a page look finished.
4. Run `npm run rescue:validate` or `node scripts/validate-rescue-baseline.mjs`.
5. When dependencies/services are available, run relevant typecheck/build/tests.
6. Record fresh PASS/FAIL separately from historical evidence.
7. Never package stale generated `dist/`; regenerate it only from a successful fresh build.
8. After any local backend/web build and before sealing or `rescue:validate`, run `npm run baseline:hygiene:clean`. The validator remains non-mutating and must continue to fail if generated build output is present.
8. Update `CURRENT-STATE.md`, `PROJECT-HANDOFF.md`, and the paste-to-next-chat file when the baseline changes.

## Rescue Gates

### RESCUE-01 — Rebaseline and navigation cleanup
Status: **DONE** on 2026-09-11.

Goal: create one source of truth, select canonical surfaces, remove obvious demo behavior, and quarantine incomplete routes.

### RESCUE-02A — Core source-contract repair
Status: **DONE** on 2026-09-11.

Goal: trace the real device vertical flow through Admin Web, backend, MQTT contracts, and ESP32 SDK; repair proven contract mismatches without pretending runtime services are green.

Result: core command/pairing/capability/scene/schedule contracts aligned, ESP32 stale API/topic contract repaired, webhook fail-open fixed, stale `dist/` removed, and source guardrails green.

### RESCUE-02B — Runtime integration and vertical acceptance
Status: **RUNTIME-READINESS R7 COMPLETE / RUNTIME EXECUTION STILL PENDING**.

Preparation now includes broker identities/ACL, optional local PostgreSQL/Redis/EMQX compose infrastructure, topology-neutral protocol-aware service probes, secret-safe local env initialization, corrected run-owned-schema database test topology, full-suite NODE_ENV test wiring plus synthetic orchestrator regression coverage, environment-aware broker bootstrap helper, mobile/backend contract parity cleanup, scheduler runtime safety, command/ACK idempotency hardening, dependency-free runtime checks, source-fingerprinted automated acceptance reports, schema-v2 SHA-bound live evidence artifacts, exact-set release verification, and a separate production-approval gate requiring OTA proof. The actual runtime evidence is still pending.

Goal: install dependencies, build fresh, bring up PostgreSQL/Redis/API/EMQX, wire broker HTTP auth/authz/webhooks, and execute the complete vertical flow including a physical ESP32 boundary.

Runbook: `docs/RESCUE-02-RUNTIME-RUNBOOK.md`.

### RESCUE-03 — Product consolidation
Status: **STATIC CONSOLIDATION R6 ACTIVE / RUNTIME EXECUTION STILL PENDING**.

Goal: remove dead components/routes only after static and runtime references prove they are unused. Rebuild or deliberately retire quarantined features.

Because this execution environment cannot currently run the RESCUE-02B service stack, low-risk static consolidation may proceed in parallel **without treating RESCUE-02B as passed**. This exception is limited to route/shell cleanup, removal of proven-unreferenced UI, canonical navigation, permission/tenant-boundary hardening, and replacing placeholders with already-existing real APIs. No production approval or runtime-completion claim is granted by RESCUE-03 static work.

### RESCUE-04 — Production gate
Status: pending.

Goal: fresh clean install, production builds, unit/contract/e2e tests, DB/MQTT integration, security review, recovery drill, hardware acceptance, and environment-specific deployment approval.

## Definition of Done for a Product Feature

A feature is available only when its visible UI is backed by a real API/domain/device path, failures are fail-closed, permissions are enforced server-side, and a fresh test or runtime validation has been executed. A placeholder, preview, static row, historical closure document, or stale compiled artifact is not completion evidence.

---

## GitHub-hosted heavy validation

Heavy build/integration validation is restored to the existing GitHub Actions path instead of being repeatedly executed on the Windows/WSL developer host. The original `test` job remains intact. A new `rescue-live-emqx` job runs after core CI on `ubuntu-latest`, generates an ephemeral rescue `.env`, brings up the source-controlled `docker-compose.rescue.yml` with Docker Compose, performs a targeted PostgreSQL integration stability gate, executes a real EMQX broker smoke (device/publisher auth, wrong-secret denial, ACLs, telemetry webhook/idempotency, command/ACK correlation, cross-device denial, revocation, wrong-webhook-secret denial), revalidates Gate 1, then runs exactly one full automated acceptance. Reports and Compose logs are uploaded even on failure; runner volumes are removed only at final CI teardown.

The dedicated rescue host MQTT endpoint remains `127.0.0.1:18884`. The old host `127.0.0.1:1883` Mosquitto diagnosis is closed and must not be reopened without new evidence against `18884`. Physical ESP32/OTA proof remains a separate non-GitHub-hosted hardware gate.
