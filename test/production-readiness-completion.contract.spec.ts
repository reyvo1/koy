import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Production Readiness Completion Review contract', () => {
  const completion = read('docs/production-readiness-completion.md');
  const readiness = read('docs/production-readiness.md');

  it('records passed local and remote gates without silently approving deployment', () => {
    expect(completion).toContain(
      'LOCAL COMPLETION GATES PASSED — REMOTE CI CONFIRMED — EXPLICIT DEPLOYMENT APPROVAL PENDING',
    );
    expect(readiness).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
    expect(readiness).toContain('Completion review status: LOCAL GATES PASSED');
    expect(completion).toContain('Environment-Specific Approval Checklist');
  });

  it('retains every readiness finding and its closure evidence', () => {
    for (const finding of [
      'PR-001',
      'PR-002',
      'PR-003',
      'PR-004',
      'PR-005',
      'PR-006',
    ]) {
      expect(completion).toContain(finding);
    }
    expect(completion).toContain('time-bounded dependency policy gates');
  });

  it('requires all final reliability and release gates', () => {
    for (const gate of [
      'Full Jest suite',
      'Coverage execution',
      'Fastify E2E smoke',
      'Isolated PostgreSQL integration',
      'Isolated MQTT workflow integration',
      'Verified-TLS MQTT production publisher integration',
      'PostgreSQL backup and restore recovery drill',
      'Production release build and SHA-256 manifest verification',
      'Production artifact startup smoke',
    ]) {
      expect(completion).toContain(gate);
    }
  });

  it('keeps the approved MQTT transport and completed Module 08 unchanged', () => {
    const service = read('src/mqtt/mqtt.service.ts');
    const adapter = read('src/mqtt/mqtt-js-publisher.adapter.ts');
    const config = read('src/mqtt/mqtt-publisher.config.ts');

    expect(service).toContain(
      'this.publisherTransport.publish(topic, message)',
    );
    expect(adapter).toContain('qos: 1');
    expect(adapter).toContain('retain: false');
    expect(config).toContain('protocolVersion: 5');
    expect(config).toContain('rejectUnauthorized: true');
    expect(completion).toContain('Module 08 remains completed');
  });

  it('records completion evidence independently of the active module', () => {
    expect(completion).toContain('Production Readiness Completion Review');
    expect(completion).toContain(
      'LOCAL COMPLETION GATES PASSED — REMOTE CI CONFIRMED — EXPLICIT DEPLOYMENT APPROVAL PENDING',
    );
    expect(completion).toContain(
      'production deployment approval remains separate',
    );
  });

  it('keeps production secrets outside the repository', () => {
    expect(completion).toContain(
      'The repository intentionally does not contain production secrets',
    );
    expect(completion).toContain('publish-only ACL');
    expect(completion).toContain('trusted broker CA file');
    expect(completion).toContain('non-placeholder values');
  });
});
