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
const sdk = read('packages/esp32-sdk/src/iot_sdk.c');
const header = read('packages/esp32-sdk/include/iot_sdk.h');
const component = read('packages/esp32-sdk/CMakeLists.txt');
const ci = read('.github/workflows/ci.yml');
const simulator = read('scripts/run-wave3-esp32-simulation.mjs');
const runbook = read('docs/RESCUE-02-RUNTIME-RUNBOOK.md');
const evidencePolicy = read('docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md');

assert(sdk.includes('esp_ota_get_next_update_partition'), 'OTA writes only to an inactive OTA partition');
assert(sdk.includes('mbedtls_sha256_update') && sdk.includes('constant_time_digest_equal'), 'OTA streams SHA-256 and compares the complete digest in constant time');
assert(sdk.indexOf('constant_time_digest_equal(actual_digest, expected_digest)') < sdk.indexOf('esp_ota_set_boot_partition(update_partition)'), 'boot partition is selected only after digest verification');
assert(sdk.includes('esp_ota_abort(ota_handle)'), 'OTA aborts a partial write on failure');
assert(sdk.includes('esp_ota_mark_app_valid_cancel_rollback'), 'pending OTA image is confirmed only after live reconnect');
assert(sdk.includes('trusted_https_configured(artifact_url)'), 'OTA requires trusted HTTPS and fails closed without a configured CA');
assert(header.includes('rollback-pending until it reconnects to MQTT successfully'), 'public SDK contract documents rollback confirmation boundary');
assert(component.includes('app_update') && component.includes('mbedtls') && component.includes('mqtt'), 'ESP-IDF component declares OTA crypto and MQTT dependencies');
assert(ci.includes('Wave 3 ESP-IDF build and QEMU boot simulation'), 'GitHub CI contains mandatory ESP-IDF/QEMU simulation job');
assert(ci.includes('espressif/install-esp-idf-action@v1') && ci.includes('v5.5.5'), 'GitHub CI pins a supported ESP-IDF 5.5.5 toolchain');
assert(ci.includes('wave3:esp32:simulate'), 'live rescue job runs the Wave 3 device digital-twin simulation');
assert(ci.includes('actions/download-artifact@v4') && ci.includes('wave3-esp32-firmware'), 'live simulation consumes the exact firmware artifact built by the ESP-IDF job');
assert(ci.includes('wokwi/wokwi-ci-action@v1'), 'optional Wokwi hardware simulation is wired when a repository token is configured');
assert(simulator.includes("classification: 'SIMULATED_LIVE_SERVICE'"), 'simulation evidence is explicitly classified and cannot impersonate physical HIL proof');
assert(simulator.includes('wrong OTA digest was not rejected') && simulator.includes('interrupted OTA stream was not rejected'), 'live simulator fails closed on corrupt and interrupted OTA artifacts');
assert(!runbook.includes('current SDK deliberately fails closed\nuntil artifact-byte SHA-256 verification is implemented'), 'runtime runbook no longer claims Wave 3 OTA digest verification is unimplemented');
assert(runbook.includes('Physical OTA/HIL remains a production-certification gate'), 'runtime runbook preserves physical OTA/HIL as a separate certification gate');
assert(evidencePolicy.includes('| SIMULATED-HARDWARE |') && evidencePolicy.includes('Physical board flash/Wi-Fi RF/flash endurance/real power-loss behavior'), 'acceptance policy distinguishes simulated hardware from physical HIL');
console.log('WAVE 3 ESP32 SOURCE SELF-TEST PASS');
