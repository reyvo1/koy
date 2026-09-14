import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

describe('MQTT Production Transport architecture and implementation', () => {
  const proposal = read('docs/mqtt-production-transport-proposal.md');
  const implementation = read('docs/mqtt-production-transport.md');
  const readiness = read('docs/production-readiness.md');
  const mqttService = read('src/mqtt/mqtt.service.ts');
  const mqttAdapter = read('src/mqtt/mqtt-js-publisher.adapter.ts');
  const mqttConfig = read('src/mqtt/mqtt-publisher.config.ts');
  const packageJson = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  it('records explicit approval and preserves the approved architecture', () => {
    expect(proposal).toContain('APPROVED — JULY 17, 2026');
    expect(proposal).toContain(
      'MqttService` remains the public application facade',
    );
    expect(proposal).toContain('MQTT 5 over verified TLS');
    expect(proposal).toContain('QoS 1');
    expect(proposal).toContain('retain=false');
    expect(proposal).toContain(
      'Device acknowledgement remains the authoritative execution acknowledgement',
    );
    expect(proposal).toContain('rejects publish attempts while disconnected');
    expect(proposal).toContain(
      'No automatic application-level retry or outbox',
    );
    expect(proposal).toContain(
      'Module 08 and Module 09 boundaries remain unchanged',
    );
  });

  it('implements the adapter behind the existing facade', () => {
    expect(mqttService).toContain('MQTT_PUBLISHER_TRANSPORT');
    expect(mqttService).toContain(
      'this.publisherTransport.publish(topic, message)',
    );
    expect(mqttConfig).toContain('protocolVersion: 5');
    expect(mqttAdapter).toContain('qos: 1');
    expect(mqttAdapter).toContain('retain: false');
    expect(mqttAdapter).toContain('publishAsync');
    expect(implementation).toContain(
      'verified-TLS MQTT 5 publish integration test',
    );
    expect(packageJson.dependencies?.mqtt).toBe('5.15.2');
    expect(packageJson.devDependencies?.mqtt).toBeUndefined();
  });

  it('keeps production approval explicit after later module transitions', () => {
    expect(readiness).toContain('NOT READY FOR PRODUCTION DEPLOYMENT');
    expect(readiness).toContain(
      'MQTT Production Transport Implementation — Completed',
    );
    expect(readiness).toContain(
      'Production deployment approval remains explicit and environment-specific',
    );
  });
});
