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
