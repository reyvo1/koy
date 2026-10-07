# IoT Platform ESP32 Device SDK

Current SDK contract/version: **2.1.0** (Wave 3 OTA activation).

Firmware SDK for ESP32 / ESP32-S3 / ESP32-C3 boards connecting to the IoT Platform. **RESCUE-02 aligns this SDK with the active backend contract.**

## Canonical flow

1. **Create device** — Tenant Admin or Super Admin registers a device and receives a one-time pairing code in the form `<deviceId>:<token>`.
2. **Pair** — the SDK receives Wi-Fi credentials + pairing code over BLE/serial, generates a random device secret, then calls `POST /devices/<deviceId>/pair`.
3. **MQTT identity** — the backend returns the trusted `tenantId` and `mqttUri`; the device uses `deviceId` as MQTT username and the locally generated secret as password.
4. **Capabilities** — capability keys must be registered in Tenant Admin before telemetry or commands using those keys are accepted.
5. **Telemetry** — publish `{"eventId":"<uuid>","payload":{...}}` to `tenants/<tenantId>/devices/<deviceId>/telemetry`.
6. **Commands** — subscribe to `.../commands`; command envelope is `{"commandId":"...","payload":{...}}`.
7. **ACK** — publish acknowledgements to `.../commands/ack`.
8. **Heartbeat** — every 60 seconds the SDK calls `PATCH /devices/<deviceId>/heartbeat` with `X-Device-Id` and `X-Device-Secret` headers. The authenticated JSON reports `protocol: MQTT_HTTPS_V1` and a valid `firmwareVersion` read from the running application partition; unavailable versions are omitted, never replaced with SDK or pending-OTA metadata.
9. **OTA** — stream the artifact over trusted HTTPS into the inactive OTA partition, verify the complete SHA-256 before selecting it for boot, and confirm the new image only after live MQTT reconnect; unconfirmed first boot remains rollback-safe.

## Integration (ESP-IDF v5.5)

```c
#include "iot_sdk.h"

void app_main(void) {
    bool provisioned = iot_sdk_init();
    if (!provisioned) {
        // pairingCode comes from the platform UI: <deviceId>:<one-time-token>
        iot_sdk_provision("MyWiFi", "secret", pairingCode);
    }

    iot_sdk_on_command(handle_command);
    iot_sdk_run();
}
```

## Build flags

| Flag | Purpose |
|---|---|
| `IOT_API_BASE_URL` | Platform API base URL |
| `IOT_PLATFORM_CERT_PEM` | TLS root CA of the platform |

`MQTT_BROKER_URL` must also be configured on the backend before pairing; pairing fails closed when no broker URI is available.

## Validation boundary

Wave 3 adds a real ESP-IDF 5.5.5 component build, Espressif QEMU boot test, and a live-service ESP32 digital twin using the exact built firmware artifact for OTA SHA-256/failure/rollback simulation. Optional Wokwi CI can add another simulated-hardware layer when its token is configured. These are explicitly `SIMULATED_HARDWARE_LIVE_SERVICE` evidence and can close the automated software/UAT hardware gate when source- and firmware-SHA-bound. Physical HIL remains a separately labelled optional field-validation layer, never inferred from simulation and never required merely to continue software certification.


## ESP-IDF component integration

`packages/esp32-sdk` itself is the ESP-IDF component directory. A consuming
project may add this directory directly to `EXTRA_COMPONENT_DIRS`; ESP-IDF names
the component from the directory (`esp32-sdk`). The special `main` component
automatically depends on every discovered project component, so the Wave 3 test
app intentionally does **not** invent a `REQUIRES iot_sdk` alias.

The component declares the public API owners it uses (`esp_hw_support`,
`esp_netif`, `esp_wifi`, MQTT, HTTP, OTA, mbedTLS, NVS). Secure MQTT (`mqtts`/
`wss`) and HTTPS operations fail closed unless `IOT_PLATFORM_CERT_PEM` is
provided by the firmware build.


### NVS encryption evidence boundary

The SDK persists device identity, MQTT secret and Wi-Fi credentials in the default
NVS namespace. The Wave 3 QEMU/simulator profile does **not** claim physical
at-rest security. Production/HIL firmware must enable ESP-IDF NVS encryption (or
an equivalent device secure-storage profile) and prove it during final security
certification. This avoids treating simulator flash semantics as physical security
evidence.

Device secrets are generated only after Wi-Fi has connected so `esp_fill_random()`
has the RF entropy source active.
