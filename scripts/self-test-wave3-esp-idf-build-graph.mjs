#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

const projectCmake = read('packages/esp32-sdk/test-app/CMakeLists.txt');
const mainCmake = read('packages/esp32-sdk/test-app/main/CMakeLists.txt');
const componentCmake = read('packages/esp32-sdk/CMakeLists.txt');
const sdk = read('packages/esp32-sdk/src/iot_sdk.c');
const defaults = read('packages/esp32-sdk/test-app/sdkconfig.defaults');
const ci = read('.github/workflows/ci.yml');

assert(
  projectCmake.includes('set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_LIST_DIR}/..")'),
  'test app discovers the SDK component directory directly through EXTRA_COMPONENT_DIRS',
);
assert(
  !/REQUIRES\s+iot_sdk\b/.test(mainCmake),
  'main does not require a fabricated iot_sdk component alias',
);
assert(
  mainCmake.includes('idf_component_register(SRCS "app_main.c")'),
  'main relies on ESP-IDF automatic dependency on all discovered project components',
);
assert(
  componentCmake.includes('esp_hw_support') && componentCmake.includes('esp_netif') && componentCmake.includes('esp_wifi'),
  'SDK declares explicit component dependencies for RNG, netif and Wi-Fi APIs',
);
assert(
  sdk.includes('#include "esp_random.h"') && sdk.includes('#include "esp_netif.h"') && sdk.includes('#include "esp_wifi_default.h"'),
  'SDK includes the public headers that own RNG and Wi-Fi netif APIs',
);
assert(
  defaults.includes('CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y'),
  'test firmware flash size covers the custom factory plus dual OTA partition table',
);
assert(
  sdk.includes('.broker.verification.certificate = IOT_PLATFORM_CERT_PEM') && sdk.includes('trusted_mqtt_configured'),
  'secure MQTT broker verification uses the configured platform CA and fails closed',
);
assert(
  sdk.includes('content_length <= 0'),
  'OTA rejects missing, timed-out or invalid Content-Length before flash writes proceed',
);
assert(
  sdk.indexOf('if (!wifi_start())') < sdk.indexOf('random_hex(device_secret, 32)'),
  'long-lived device secret is generated only after Wi-Fi enables a continuous RF entropy source',
);
assert(
  ci.includes('od -An -tx1 -N1 artifacts/wave3-esp32/iot_sdk_wave3_test_app.bin') &&
    ci.includes('= "e9"'),
  'CI rejects staged firmware artifacts that do not have ESP application image magic',
);
assert(
  ci.includes('target: [esp32, esp32c3]') &&
    ci.includes('idf.py set-target "${{ matrix.target }}"'),
  'ESP32 and ESP32-C3 use isolated parallel matrix builds from the complete SDK tree',
);
assert(
  ci.includes('qemu-riscv32') && ci.includes('qemu-xtensa') &&
    ci.includes('--target "${{ matrix.target }}"'),
  'both ESP32 Xtensa and ESP32-C3 RISC-V firmware boot in target-appropriate QEMU',
);
assert(
  !ci.includes('cp -a packages/esp32-sdk/test-app /tmp/wave3-esp32c3') &&
    !ci.includes('/tmp/wave3-esp32-sdk-c3'),
  'obsolete detached or serial ESP32-C3 copy paths are removed',
);

const jobStart = ci.indexOf('  esp32-firmware-simulation:');
const rescueStart = ci.indexOf('  rescue-live-emqx:');
const firmwareJob = ci.slice(jobStart, rescueStart);
assert(jobStart >= 0 && rescueStart > jobStart, 'firmware CI job boundaries are present');
assert(!/\n\s+needs:\s*test\s*\n/.test(firmwareJob), 'firmware build runs in parallel with core CI instead of waiting for it');
assert(
  firmwareJob.includes('fail-fast: false') && firmwareJob.includes('target: [esp32, esp32c3]'),
  'native chip targets run as a non-short-circuiting parallel firmware matrix',
);
const verifyIndex = firmwareJob.indexOf('Verify Wave 3 firmware/build-graph contract before toolchain install');
const installIndex = firmwareJob.indexOf('Install ESP-IDF 5.5.5');
assert(verifyIndex >= 0 && installIndex > verifyIndex, 'cheap firmware/build-graph guards run before the expensive ESP-IDF install');
assert(
  ci.includes('needs: [test, esp32-firmware-simulation]'),
  'live rescue acceptance still waits for both core and firmware evidence',
);

console.log('WAVE 3 ESP-IDF BUILD-GRAPH SELF-TEST PASS');
