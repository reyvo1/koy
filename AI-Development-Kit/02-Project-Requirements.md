# Enterprise completion addendum — 2026-09-15

The product requirement now distinguishes **foundation completeness** from **enterprise completion**. Modules 1–30 establish the universal IoT architecture and safe contracts; post-foundation delivery is governed by `docs/ENTERPRISE-WAVE-ROADMAP.md` Wave 1–13. Enterprise completion requires real runtime/provider/hardware/recovery evidence and cannot be declared from UI placeholders or foundation contracts alone.

The mandatory delivery discipline is one large wave at a time, targeted/lightweight local QA, synchronized documentation and manifest sealing, then one GitHub push whose heavy CI is authoritative. Missing physical lab equipment is not allowed to block software completion: ESP32/MQTT/Wi-Fi reconnect/OTA and camera/media behavior must be exercised through production-shaped `SIMULATED_HARDWARE_LIVE_SERVICE` UAT bound to the sealed source and exact firmware artifact. Physical/site HIL remains an optional separately labelled field-validation layer; genuinely provider-owned external behavior and the final automated approval receipt remain fail-closed gates.

---

# Project Requirements

Bangun Universal IoT Cloud Platform milik sendiri untuk smart home,
agriculture, building, energy, integrator, dan custom IoT.

## Core Product Flow

User register/login -\> membuat organization/site -\> memasangkan device
-\> device terhubung MQTT -\> telemetry masuk -\> state realtime tampil
-\> user mengirim command -\> device acknowledgement -\> automation
dapat bereaksi -\> notification dan OTA dikelola platform.

## Core Capabilities

Identity, multi-tenant, smart spaces, device registry, provisioning,
dynamic capability schema, telemetry, latest state, history, command,
MQTT, automation, scene, scheduler, notification, OTA, dashboard,
mobile, admin, public API, webhook, observability, quota, device SDK.

## Universal Capability Model

Core tidak bergantung pada nama sensor tertentu. Capability memiliki
key, semantic type, data type, unit, min/max, precision, enum values,
readable, writable, reportable, constraints, dan schema version.

## Non-Functional

Tenant isolation, secure defaults, horizontal scaling boundaries, UTC
timestamps, idempotency untuk operasi kritis, structured logging,
auditability, graceful shutdown, health/readiness, versioned contracts,
observability-ready.

## Initial Architecture Philosophy

Mulai sebagai modular architecture yang dapat dideploy sederhana.
Pisahkan API, worker, dan MQTT berdasarkan kebutuhan operasional. Jangan
memecah menjadi microservices tanpa bukti kebutuhan.
