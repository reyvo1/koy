# Enterprise Wave Roadmap — Wave 1–13

Status date: 2026-10-04

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

- Waves 1–13: **SOFTWARE SCOPE CLOSED / GREEN** for automated, source-bound software certification. GitHub Actions run `37195822587` on commit `e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4` completed the full automated acceptance chain, including Wave 4–9 live UAT, `SIMULATED_HARDWARE_LIVE_SERVICE`, Wave 10–12 runtime probes, Wave 13 load/security/certification gates, Gate 1 revalidation, production build, database integration and MQTT integration.
- There is **no active software wave**. Future code work starts only from a new defect/product-hardening finding and must preserve the same evidence boundaries.
- Provider-owned external settlement behavior and optional site/PHYSICAL-HIL observations remain separately labelled evidence. They do not reopen software waves and simulation must never be relabelled physical.

## Production boundary

Wave 13 software certification must maximize automated ESP-IDF/QEMU/live-service and synthetic-camera UAT until every software-controlled behavior is proven. Missing physical hardware does **not** block wave progression or automated software production-readiness. Physical/site/HIL observations remain a separate field-validation class and simulation must never be relabeled as physical proof.
