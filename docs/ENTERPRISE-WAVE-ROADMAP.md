# Enterprise Wave Roadmap — Wave 1–13

Status date: 2026-10-03

This document is the authoritative post-foundation execution roadmap for the IoT Platform. The historical Module 1–30 roadmap remains valid as architecture/foundation evidence, but **30/30 foundation-complete does not mean enterprise-complete**.

## Execution policy — mandatory

1. Work is organized into **large waves**, not micro-RR patches.
2. One wave must close its whole declared class of work before a GitHub push.
3. Local validation is targeted/lightweight only: source invariants, syntax/type/unit tests, Prisma validation/generation, and other bounded checks that do not require the heavy runtime stack.
4. GitHub is authoritative for heavy build/Docker/PostgreSQL/Redis/EMQX/full acceptance.
5. If GitHub is red, collect the first failure plus all related failures in the same class and repair them inside the same active wave.
6. Do not weaken assertions, convert timeout/ambiguity to PASS, or change production contracts merely to make CI green.
7. Documentation, baseline manifest, repository tree, tests, and `chat-session.md` are part of every wave closure.
8. Missing physical hardware must not block software delivery. Automated production-readiness is driven to completion with SIMULATED-HARDWARE/LIVE-SERVICE evidence; any later site/HIL validation is tracked separately and must never be relabeled as simulated PASS.
9. Every PASS must declare the strongest evidence tier actually executed (STATIC/CONTRACT, UNIT, INTEGRATION, LIVE-SERVICE, PHYSICAL/EXTERNAL, or PRODUCTION CERTIFICATION) according to `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md`; a green source check cannot impersonate runtime evidence.

## Wave map

| Wave | Large gate | Exit criteria |
|---|---|---|
| 1 | Rescue / CI / EMQX hardening | Core GitHub tests and live rescue EMQX acceptance green; MQTT auth/ACL/command path and dashboard acceptance deterministic. **Closed green on V13.** |
| 2 | Core Runtime Closure | Automation delayed retry runtime is durable and truly republishes; scheduler activation cannot outpace its worker; Notification has leased multi-instance-safe delivery, auth email enqueue, bounded retry policy, and provider-neutral relay boundary. **Closed green on V9.** |
| 3 | ESP32 + OTA Automated Simulation | Real ESP-IDF compile, QEMU boot, live-service ESP32 digital twin, reconnect/cold-boot/MQTT/QoS1-dedupe/telemetry/command/ACK, and release-bound OTA SHA-256/failure/rollback simulation. Physical HIL is a separately labelled field-validation layer and does not block software closure. |
| 4 | Staging / VPS / UAT | Production-shaped staging, TLS/secrets/backups/restore/rollback, operator runbooks, and owner UAT baseline. |
| 5 | Enterprise Domain / API Closure | Sharing, Organization/Branch, advanced RBAC, public API/webhook runtime, SDK and contract gaps closed end-to-end. |
| 6 | Enterprise Management Plane | Capability template/version lifecycle, live MQTT management evidence, NOC, reports/audit/operational depth. |
| 7 | Mobile + Technician | Mobile parity for core controls/settings/notifications and technician commissioning/maintenance/log workflows with release evidence. |
| 8 | Billing + Integrations | Real payment-provider sandbox contract, metering/invoice lifecycle, and real external ecosystem provider adapters/sync. |
| 9 | CCTV + Location | ONVIF discovery, RTSP→WebRTC runtime, supported camera/vendor path, GPS/location model and map/NOC integration. |
| 10 | HA / Scale / Observability / Security | Multi-node/load evidence, retention/rollups, tracing/telemetry export, security testing, secret rotation/WAF and resilience drills. |
| 11 | AI + Executive | Real anomaly/health/failure-prediction/predictive-maintenance/energy intelligence and executive KPI product surfaces using authoritative data. |
| 12 | Enterprise Horizon | Multi-region boundaries, edge gateway, digital twin foundation and AI-assisted operations under explicit ADRs. |
| 13 | Final Enterprise Certification | Full E2E/UAT/simulated-hardware/security/DR/performance evidence, release artifact sealing, production smoke and explicit enterprise production approval. Site-specific physical/HIL validation is tracked separately and is not a blocker for software certification. |

Smart Hotel / TAMASYA is intentionally outside Wave 1–13 and starts only after the enterprise IoT core is stable in production.

## Current gate

- Wave 1: **CLOSED / GREEN**.
- Wave 2: **CLOSED / GREEN** after V9 heavy GitHub acceptance.
- Wave 3: **CLOSED / GREEN** for automated software/simulation evidence — ESP-IDF compile, QEMU boot and OTA
  simulation are regression-gated. Physical ESP32/HIL remains a separately labelled field-validation class and does not reopen or block the automated software wave.
- Waves 4–11: **SOFTWARE SCOPE CLOSED / GREEN**. Repository, contract, integration and live-service evidence
  for the implemented slices is closed, but this phrase must not be read as external-provider or physical
  certification. In particular, the positive real Midtrans settlement/webhook path remains external evidence
  because no provider server key is present; physical camera/vendor behavior also remains external evidence.
- Wave 12: **CLOSED / GREEN** — multi-region boundaries (ADR-009), edge gateway identity and attribution
  (ADR-010), device twin reconciliation (ADR-011), and cross-region operations reporting (ADR-012). These
  report and record; they do not fail over, route, or bridge, and each ADR says so explicitly.
- Wave 13: **IN PROGRESS, software deliverables only** — the software-side certification items are being built
  and measured. Automated software certification must continue to completion without waiting for unavailable physical devices; external/provider and site/HIL observations remain separately labelled evidence rather than blockers to software progress.
  - Performance evidence: landed. `npm run load:gate` measures the live API with autocannon and holds it to
    `config/performance-budget.json`. The gate can fail: an impossible budget exits 1 by scenario name, and an
    unreachable target exits 1 rather than skipping.
  - Security evidence: an authentication-bypass chain in the production HTTP stack was found and closed
    (`GHSA-p68q-wchp-6fh7`, `GHSA-9c5c-9qcx-q35q`, `GHSA-4mh8-r7rc-xpvc`). Production high findings went
    18 -> 10. The remaining 10 are transitively required by Expo's CLI and have no non-breaking fix; they are
    recorded as open rather than quietly deferred.
  - Already gated from earlier waves and re-verified here: E2E, release artifact sealing, production artifact
    startup smoke, the PostgreSQL recovery drill, and the MQTT publisher TLS integration test. The TLS test
    stands up a real `node:tls` server with a certificate fixture and connects over `mqtts://` with
    `MQTT_CA_FILE`; it is not a mock.
  - Physical ESP32/HIL, a physical camera, and real CCTV frames: **SEPARATE FIELD VALIDATION**, not a software-wave blocker. A green pipeline
    cannot produce them, and Wokwi is a browser simulator — CI records that boundary explicitly and never
    claims a Wokwi PASS.

## Production boundary

Wave 13 software certification must maximize automated ESP-IDF/QEMU/live-service and synthetic-camera UAT until every software-controlled behavior is proven. Missing physical hardware does **not** block wave progression or automated software production-readiness. Physical/site/HIL observations remain a separate field-validation class and simulation must never be relabeled as physical proof.
