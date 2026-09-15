# Wave 3 — ESP32 + OTA Automated Simulation

Status date: 2026-09-15

## Goal

Wave 3 closes the automated ESP32/OTA readiness class without pretending that
software simulation is physical hardware evidence. The same source must be
compiled with a real ESP-IDF toolchain, boot in an Espressif-supported emulator,
and participate in a live-service digital-twin flow against the real rescue
PostgreSQL/Redis/API/EMQX stack. Physical HIL remains a separate certification
layer for Wave 13.

## Mandatory GitHub evidence

1. **ESP-IDF build:** `packages/esp32-sdk` is a real ESP-IDF component and the
   test application builds with pinned ESP-IDF `v5.5.5` for ESP32 and ESP32-C3.
2. **QEMU boot:** the linked ESP32 firmware boots in Espressif QEMU and emits
   deterministic SDK/OTA markers.
3. **Live-service digital twin:** a simulated ESP32 is provisioned through the
   real API, authenticates to real EMQX, publishes telemetry, disconnects and
   reconnects with the same identity, receives a real command, publishes ACK,
   and suppresses duplicate command execution while replaying the terminal ACK.
4. **OTA artifact binding:** the digital twin downloads the exact `.bin`
   produced by the ESP-IDF build job over trusted HTTPS. It accepts the artifact
   only when SHA-256 matches, rejects an intentionally wrong digest, rejects an
   interrupted stream, exercises pending-verify rollback, and exercises live
   reconnect confirmation.
5. **Regression:** Wave 1 and Wave 2 core/build/E2E/PostgreSQL/Redis/EMQX/full
   acceptance remain green.

## Firmware OTA contract

`iot_sdk_ota_update()` now:

- requires HTTPS and an explicit platform CA;
- writes only to `esp_ota_get_next_update_partition(NULL)`;
- streams SHA-256 while writing the inactive partition;
- rejects empty/oversized/truncated/non-2xx artifacts;
- aborts partial OTA writes on every failure path;
- compares the complete 32-byte digest in constant time;
- calls `esp_ota_end()` and `esp_ota_set_boot_partition()` only after digest
  verification succeeds;
- leaves reboot timing to the application;
- keeps a newly booted image rollback-pending until the SDK has re-established
  live MQTT connectivity, then calls `esp_ota_mark_app_valid_cancel_rollback()`.

## Simulator hierarchy

| Layer | Required | Evidence classification |
|---|---:|---|
| ESP-IDF compile (ESP32 + ESP32-C3) | yes | INTEGRATION / TOOLCHAIN |
| Espressif QEMU boot | yes | SIMULATED-HARDWARE |
| Digital twin against rescue API + EMQX + DB | yes | SIMULATED-HARDWARE + LIVE-SERVICE |
| Wokwi CI | optional when `WOKWI_CLI_TOKEN` exists | SIMULATED-HARDWARE / EXTERNAL |
| Physical ESP32 self-hosted HIL | final certification | PHYSICAL / EXTERNAL |

An absent Wokwi token is recorded as `NOT_RUN_EXTERNAL_TOKEN`; it is never
converted to PASS. Wave 3 does not claim PHYSICAL evidence.

## Local boundary

Local pre-push remains lightweight. It runs source invariants and a bounded
localhost HTTPS OTA/dedupe/rollback simulator. ESP-IDF installation, QEMU,
Docker services, real EMQX, and full acceptance belong to GitHub.

## Exit criteria

Wave 3 may close when one Wave 3 GitHub push proves all mandatory automated
items above green. Physical HIL is intentionally retained for final enterprise
certification before production promotion.


## V2 root-cause build-chain hardening

The first real ESP-IDF GitHub run exposed a build-graph defect before C
compilation: `main` required a fabricated component name `iot_sdk`, while
ESP-IDF derives component identity from the actual component directory. V2
fixes the complete native build/runtime-evidence class instead of patching only
that line:

- `main` relies on ESP-IDF's documented automatic dependency on discovered
  project components;
- `EXTRA_COMPONENT_DIRS` points directly at the SDK component directory;
- ESP32 and ESP32-C3 are separate **parallel matrix builds** from the complete
  source tree; both must boot in their target-appropriate Espressif QEMU
  (`qemu-xtensa` / `qemu-riscv32`);
- RNG/netif/Wi-Fi public headers and component dependencies are explicit;
- the long-lived device secret is generated only after Wi-Fi has connected so
  the RF entropy source is active for `esp_fill_random()`;
- the custom dual-OTA partition table pins a 4MB flash contract;
- MQTT TLS verification uses the same explicit platform CA boundary as HTTPS;
- invalid/missing OTA Content-Length is rejected before OTA writes begin;
- the staged firmware artifact is rejected unless it has ESP application-image
  magic (`0xE9`) before it is hashed and passed to live OTA simulation;
- credential persistence is truthfully classified: Wave 3 simulation stores
  credentials in NVS but does **not** claim physical at-rest encryption.
  Production/HIL firmware must enable ESP-IDF NVS encryption (or equivalent
  secure storage) and prove that in final security certification;
- a dependency-free build-graph self-test runs before the expensive ESP-IDF
  toolchain install;
- firmware matrix jobs run in parallel with core CI, while live rescue
  acceptance still waits for core plus the complete matrix.

This design deliberately makes cheap topology/security contract failures occur
before toolchain installation and makes ESP32 and ESP32-C3 failures surface in
parallel, reducing elapsed feedback time without weakening acceptance.

The V2 correction does not claim ESP-IDF/QEMU PASS locally. Real compile and
QEMU remain GitHub evidence.

## V3 native API compatibility gate

The V2 heavy run reached real C compilation on both ESP32 and ESP32-C3 and exposed one shared ESP-MQTT API mismatch. Wave 3 now pins the source contract to ESP-IDF 5.5 public symbols: `esp_mqtt_client_register_event` with `MQTT_EVENT_ANY`. The pre-toolchain `self-test-wave3-esp-idf-api-surface.mjs` rejects obsolete/nonexistent event-registration names and verifies that each native API family used by the SDK retains its owning public header and component dependency. This gate is STATIC/CONTRACT evidence only; real native compilation/QEMU remains mandatory GitHub evidence.
