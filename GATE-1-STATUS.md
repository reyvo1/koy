# Gate naming clarification — 2026-09-15

This file is historical Rescue Gate 1 evidence and must not be confused with the enterprise Wave 1–13 master roadmap. The active roadmap is `docs/ENTERPRISE-WAVE-ROADMAP.md`. Wave 1 software/CI is closed green; Wave 2 Core Runtime Closure is ACTIVE at V7 first-heavy-integration recovery; production approval still requires later physical and certification waves.

---

# GATE 1 STATUS — RR29

Status: **REVALIDATION REQUIRED ON OPERATOR PC**

## Live RR28 proof

- Local recovery: PASS.
- Runtime status: `CORE_RUNTIME_READY_LIVE_BROKER_EVIDENCE_PENDING`.
- Dedicated rescue MQTT endpoint: `mqtt://127.0.0.1:18884`.
- Infra protocol probe: READY / 0 blockers.
- Full protocol probe: READY / 0 blockers.
- `rescue:gate1`: LIVE PASS and PASS receipt generated.
- `rescue:gate1:validate`: failed only with `ReferenceError: currentState is not defined`.

## RR29 change

The validator's `currentState` variable is now outer-scoped so it remains available when building `RESCUE_MQTT_HOST_PORT` / `RESCUE_MQTT_BROKER_URL` for the live recheck. A dependency-free end-to-end validator regression test locks both scope and endpoint propagation. No runtime/business logic is changed.

Because RR29 changes sealed source, obtain a fresh source-bound local runtime/Gate 1 PASS once before entering Gate 2. Production remains **NOT APPROVED**.

## Wave 2 V6 note
V5 advanced through Prisma validate/generate and into targeted Jest compilation. V6 closes the two compile-time contract drifts exposed there (retry metric event union and notification numeric lease parameter). This does not alter Gate 1 physical-production evidence requirements.

## Wave 2 V7 note
The first Wave 2 GitHub heavy run passed the full unit/E2E layers and most PostgreSQL integration suites, then exposed a real automation retry transition-shape violation plus a Notification integration DTO adapter mismatch. V7 fixes those two Wave 2 integration contracts without altering historical Rescue Gate 1 physical-production evidence requirements.
