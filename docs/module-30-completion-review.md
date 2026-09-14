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
  NVS encrypted credential storage, tenant-scoped MQTT topic layout,
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
