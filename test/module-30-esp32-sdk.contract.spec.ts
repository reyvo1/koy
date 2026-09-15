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

  it('documents identity, provisioning, MQTT topics, and OTA contract', () => {
    expect(header).toContain('IOT_SDK_CONTRACT_VERSION');
    expect(header).toContain('PROVISIONING');
    expect(header).toContain('/devices/<deviceId>/pair');
    expect(header).toContain('telemetry');
    expect(header).toContain('heartbeat');
    expect(header).toContain('SHA-256');
  });

  it('keeps credentials out of logs and uses NVS encrypted storage', () => {
    expect(header).toContain('encrypted NVS partition');
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

});
