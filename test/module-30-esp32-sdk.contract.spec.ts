import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ESP32 Device SDK contract', () => {
  const root = resolve(__dirname, '..');
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
});
