// RESCUE-02 — canonical ESP32 wire contract.
// This contract follows the active backend routes and MQTT topic policy.
// Historical Module 30 wording is superseded by CURRENT-STATE.md.
//
// IDENTITY:
//   deviceId   : UUID assigned by the platform when provisioning is created
//   secret     : random per-device secret generated on-device and stored in NVS
//
// PROVISIONING (Wi-Fi/BLE/serial):
//   1. Admin creates a device and receives one pairing code shown once:
//        <deviceId>:<oneTimeProvisioningToken>
//   2. App/device receives Wi-Fi credentials + that pairing code.
//   3. Device generates a random MQTT/device secret.
//   4. Device calls POST /devices/<deviceId>/pair with
//        {"token":"<oneTimeProvisioningToken>","password":"<deviceSecret>"}
//   5. Platform returns {deviceId,tenantId,mqttUri,mqttUsername}.
//   6. Device stores IDs, MQTT URI, device secret and Wi-Fi credentials in NVS.
//
// MQTT TOPICS (prefix: tenants/<tenantId>/devices/<deviceId>):
//   .../telemetry        publish
//      {"eventId":"<uuid-v4>","payload":{"capabilityKey":value,...}}
//   .../commands         subscribe
//      {"commandId":"<correlation-id>","payload":{"capabilityKey":value,...}}
//   .../commands/ack     publish
//      {"commandId":"...","status":"ACK|FAILED","reason":"..."}
//
// HEARTBEAT:
//   PATCH /devices/<deviceId>/heartbeat every 60s with headers
//     X-Device-Id: <deviceId>
//     X-Device-Secret: <deviceSecret>
//
// TELEMETRY RULES:
//   - capability payload <= 1KB in this SDK
//   - primitive values only in the firmware helper
//   - eventId UUID v4 per publish
//   - capability keys must already be registered on the device
//
// OTA CONTRACT:
//   - GET artifactUrl over TLS
//   - verify the expected SHA-256 before release acceptance
//   - keep the previous partition bootable for rollback
//
// SECURITY:
//   - Pairing token is one-time and short lived.
//   - Device secret and Wi-Fi credentials are stored in the encrypted NVS partition.
//   - Credentials must never be logged.
#pragma once
#define IOT_SDK_CONTRACT_VERSION "2.0.0"
