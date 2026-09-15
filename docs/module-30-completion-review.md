# Module 30 — ESP32 Device SDK & Provisioning Completion Review

## Status

Module 30 foundation-complete and locally green at commit with the SDK wire
contract (`packages/esp32-sdk/include/iot_sdk_contract.h`) plus its contract
spec. This module delivers the SDK *contract* — identity, BLE/Wi-Fi
provisioning flow, MQTT topics, telemetry rules, and OTA rollback policy.
The C firmware implementation ships with device builds; server-side
enforcement of this contract (claim endpoint, topic ACLs, payload bounds)
already exists in earlier modules.

## Slice inventory

- 30.1 SDK contract: identity (UUID + hashed MQTT credential), BLE
  provisioning flow with claim-code exchange via `/api/provision/claim`,
  NVS credential persistence (production/HIL secure-storage encryption is a
  separate security-profile requirement), tenant-scoped MQTT topic layout,
  telemetry payload rules matching server validation (≤1KB, primitives,
  UUID eventId), command/ack envelope, 60s heartbeat, OTA sha256-verify +
  boot-partition rollback policy.

## Validation evidence

- Contract spec green (3 tests); full Jest: 150 suites / 1030 tests green.
- Lint clean; build green.

## ROADMAP COMPLETE

All 30 modules now have completed foundations with closures, evidence, and
green gates. Remaining work is activation-gated (automation runtime,
deployment) or feature-level, requiring separate owner approval per project
policy.


## Wave 3 activation update — 2026-09-15

The earlier completion review described a foundation contract and explicitly left
real firmware compilation/OTA verification outside Module 30. Enterprise Wave 3
activates that deferred work without rewriting the historical foundation claim:

- `packages/esp32-sdk` is now an ESP-IDF component;
- CI builds ESP32 and ESP32-C3 with ESP-IDF 5.5.5 as a parallel matrix;
- both ESP32 and ESP32-C3 builds boot in target-appropriate Espressif QEMU;
- OTA streams to the inactive partition, verifies full SHA-256 before boot-slot
  selection, aborts partial writes, and confirms a pending image only after live
  MQTT reconnect;
- the exact built firmware `.bin` is consumed by the live-service Wave 3
  digital-twin OTA simulation;
- Wokwi remains an optional additional simulator and physical HIL remains final
  production-certification evidence.

- Wave 3 simulation does not claim encrypted-NVS physical evidence; production/HIL
  must prove ESP-IDF NVS encryption or equivalent secure storage separately.

### Wave 3 V3 ESP-IDF 5.5 compatibility closure

The first real dual-target compile after build-graph repair exposed stale ESP-MQTT event-registration names. Module 30 now uses `esp_mqtt_client_register_event(..., MQTT_EVENT_ANY, ...)` and carries a dependency-free API-surface guard before toolchain installation. This is a compatibility correction only; automated compile/QEMU/live-service evidence remains required before Wave 3 can close.
