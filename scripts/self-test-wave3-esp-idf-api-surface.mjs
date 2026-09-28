#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkPath = path.join(root, 'packages/esp32-sdk/src/iot_sdk.c');
const sdk = readFileSync(sdkPath, 'utf8');
const component = readFileSync(path.join(root, 'packages/esp32-sdk/CMakeLists.txt'), 'utf8');
const qemuRunner = readFileSync(path.join(root, 'scripts/run-wave3-qemu-boot.mjs'), 'utf8');
const efuseDefaults = readFileSync(path.join(root, 'scripts/wave3-qemu-efuse-defaults.mjs'), 'utf8');

// ESP-IDF 5.5 / ESP-MQTT public API contract. Keep this guard dependency-free
// so an obsolete API name fails before the expensive toolchain install/build.
assert(
  sdk.includes('esp_mqtt_client_register_event(s_ctx.mqtt, MQTT_EVENT_ANY,'),
  'ESP-MQTT event registration uses the ESP-IDF 5.5 public singular register_event API',
);
assert(
  !sdk.includes('esp_mqtt_client_register_events('),
  'obsolete plural esp_mqtt_client_register_events API is absent',
);
assert(
  !sdk.includes('MQTT_EVENT_ANY_ID'),
  'obsolete/nonexistent MQTT_EVENT_ANY_ID token is absent',
);
assert(
  sdk.includes('#include "mqtt_client.h"'),
  'SDK includes the public ESP-MQTT header that owns event registration and MQTT_EVENT_ANY',
);
assert(
  /\bPRIV_REQUIRES\b[^\n]*\bmqtt\b/.test(component) || /\bREQUIRES\b[^\n]*\bmqtt\b/.test(component),
  'ESP-IDF component declares the mqtt component dependency explicitly',
);

// Audit the other native API families that Wave 3 relies on. These assertions
// are intentionally structural: they ensure public owner headers and component
// dependencies remain paired, so future API drift fails before native compile.
const owners = [
  ['esp_http_client.h', 'esp_http_client'],
  ['esp_ota_ops.h', 'app_update'],
  ['esp_random.h', 'esp_hw_support'],
  ['esp_netif.h', 'esp_netif'],
  ['esp_wifi.h', 'esp_wifi'],
  ['nvs_flash.h', 'nvs_flash'],
  ['mbedtls/sha256.h', 'mbedtls'],
];
for (const [header, dependency] of owners) {
  assert(sdk.includes(`#include "${header}"`), `SDK includes public owner header ${header}`);
  assert(
    new RegExp(`\\b${dependency.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`).test(component),
    `ESP-IDF component declares ${dependency} dependency for ${header}`,
  );
}

// The repository-native QEMU boot path is a hand-built reimplementation of the
// argument contract that ESP-IDF v5.5.5 builds in tools/idf_py_actions/qemu_ext.py.
// V5 proved the image generation path; these guards pin the device arguments so
// a divergence cannot silently reappear between GitHub heavy runs.
assert(
  qemuRunner.includes("'-machine', 'esp32', '-m', '4M'"),
  'ESP32 QEMU machine request keeps the 4 MiB PSRAM window the native ESP-IDF frontend always passes',
);
assert(
  /esp32c3[\s\S]*?'-icount', '3'/.test(qemuRunner) && !/qemuArgs[^\n]*'-m'/.test(qemuRunner.split('esp32c3')[1] ?? ''),
  'ESP32-C3 QEMU machine request keeps -icount 3 and does not inherit the ESP32-only -m argument',
);
assert(
  qemuRunner.includes('property=drive,value=efuse'),
  'QEMU boot attaches the eFuse backing store the native ESP-IDF frontend always provides',
);
assert(
  qemuRunner.includes('property=wdt_disable,value=true'),
  'QEMU boot disables the emulated timer-group watchdog like the native ESP-IDF frontend',
);
assert(
  qemuRunner.includes('wave3-qemu-${target}-efuse.bin') && qemuRunner.includes('writeFileSync(efuseImage, efuseBytes)'),
  'QEMU boot materialises a per-target eFuse image instead of booting an all-zero eFuse block',
);
assert(
  efuseDefaults.includes('ESP-IDF v5.5.5') && efuseDefaults.includes('default_efuse'),
  'eFuse defaults are source-bound to the pinned ESP-IDF 5.5.5 toolchain revision',
);

console.log('WAVE 3 ESP-IDF API-SURFACE SELF-TEST PASS');