import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ESP32 Device SDK contract', () => {
  const root = resolve(__dirname, '..');
  const source = readFileSync(
    resolve(root, 'packages/esp32-sdk/src/iot_sdk.c'),
    'utf8',
  );
  const header = readFileSync(
    resolve(root, 'packages/esp32-sdk/include/iot_sdk_contract.h'),
    'utf8',
  );
  const mainCmake = readFileSync(
    resolve(root, 'packages/esp32-sdk/test-app/main/CMakeLists.txt'),
    'utf8',
  );
  const sdkCmake = readFileSync(
    resolve(root, 'packages/esp32-sdk/CMakeLists.txt'),
    'utf8',
  );
  const sdkconfigDefaults = readFileSync(
    resolve(root, 'packages/esp32-sdk/test-app/sdkconfig.defaults'),
    'utf8',
  );
  const ci = readFileSync(
    resolve(root, '.github/workflows/ci.yml'),
    'utf8',
  );
  const simulator = readFileSync(
    resolve(root, 'scripts/run-wave3-esp32-simulation.mjs'),
    'utf8',
  );

  it('documents identity, provisioning, MQTT topics, and OTA contract', () => {
    expect(header).toContain('IOT_SDK_CONTRACT_VERSION');
    expect(header).toContain('PROVISIONING');
    expect(header).toContain('/devices/<deviceId>/pair');
    expect(header).toContain('telemetry');
    expect(header).toContain('heartbeat');
    expect(header).toContain('SHA-256');
  });

  it('keeps credentials out of logs and does not overclaim simulated NVS security', () => {
    expect(header).toContain('Production/HIL firmware must enable ESP-IDF NVS encryption');
    expect(header).toContain('simulator evidence does not claim');
    expect(header).toContain('Credentials must never be logged');
  });

  it('pins telemetry payload rules matching server-side validation', () => {
    expect(header).toContain('capability payload <= 1KB');
    expect(header).toContain('primitive values only');
  });
  it('implements fail-closed streamed OTA verification before boot selection', () => {
    expect(source).toContain('esp_ota_get_next_update_partition(NULL)');
    expect(source).toContain('mbedtls_sha256_update');
    expect(source).toContain('constant_time_digest_equal(actual_digest, expected_digest)');
    expect(source).toContain('esp_ota_abort(ota_handle)');
    expect(source).toContain('esp_ota_set_boot_partition(update_partition)');
    expect(source.indexOf('constant_time_digest_equal(actual_digest, expected_digest)')).toBeLessThan(
      source.indexOf('esp_ota_set_boot_partition(update_partition)'),
    );
  });

  it('keeps a newly booted OTA image rollback-pending until live MQTT reconnect', () => {
    expect(source).toContain('ESP_OTA_IMG_PENDING_VERIFY');
    expect(source).toContain('esp_ota_mark_app_valid_cancel_rollback');
    expect(source.indexOf('ota_confirm_running_image_after_live_reconnect();')).toBeGreaterThan(
      source.indexOf('case MQTT_EVENT_CONNECTED:'),
    );
  });

  it('keeps the ESP-IDF build graph and API ownership explicit', () => {
    expect(mainCmake).not.toMatch(/REQUIRES\s+iot_sdk\b/);
    expect(mainCmake).toContain('idf_component_register(SRCS "app_main.c")');
    expect(sdkCmake).toContain('esp_hw_support');
    expect(source).toContain('#include "esp_random.h"');
    expect(source).toContain('#include "esp_netif.h"');
    expect(source).toContain('#include "esp_wifi_default.h"');
    expect(sdkconfigDefaults).toContain('CONFIG_ESPTOOLPY_FLASHSIZE_4MB=y');
    expect(source.indexOf('if (!wifi_start())')).toBeLessThan(source.indexOf('random_hex(device_secret, 32)'));
  });

  it('fails closed for secure MQTT and invalid OTA content length', () => {
    expect(source).toContain('trusted_mqtt_configured');
    expect(source).toContain('.broker.verification.certificate = IOT_PLATFORM_CERT_PEM');
    expect(source).toContain('content_length <= 0');
    expect(ci).toContain('target: [esp32, esp32c3]');
    expect(ci).toContain('qemu-riscv32');
    expect(simulator).toContain('missing 0xE9 image magic');
  });

});
