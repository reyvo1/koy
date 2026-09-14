import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readRepositoryFile(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Production Readiness Review contract', () => {
  const review = readRepositoryFile('docs/production-readiness.md');

  it('retains the explicit not-ready production decision', () => {
    expect(review).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
    expect(review).toContain('Completion review status: LOCAL GATES PASSED');
    expect(review).not.toContain('Status: READY FOR PRODUCTION DEPLOYMENT');
  });

  it('retains all original finding identifiers and severity evidence', () => {
    for (const finding of [
      'PR-001',
      'PR-002',
      'PR-003',
      'PR-004',
      'PR-005',
      'PR-006',
    ]) {
      expect(review).toContain(finding);
    }
    expect(review).toContain('Severity: Critical');
    expect(review).toContain('Severity: High');
  });

  it('records the approved production MQTT adapter without reopening Module 08', () => {
    const mqttService = readRepositoryFile('src/mqtt/mqtt.service.ts');
    const mqttAdapter = readRepositoryFile(
      'src/mqtt/mqtt-js-publisher.adapter.ts',
    );
    const mqttConfig = readRepositoryFile('src/mqtt/mqtt-publisher.config.ts');

    expect(mqttService).toContain(
      'this.publisherTransport.publish(topic, message)',
    );
    expect(mqttConfig).toContain('protocolVersion: 5');
    expect(mqttAdapter).toContain('qos: 1');
    expect(mqttAdapter).toContain('retain: false');
    expect(review).toContain(
      'Status: Resolved by MQTT Production Transport Architecture Proposal and MQTT Production Transport Implementation',
    );
    expect(review).toContain('Module 08 command persistence');
  });

  it('records process lifecycle remediation without declaring production ready', () => {
    const runtime = readRepositoryFile('src/bootstrap/production-runtime.ts');
    const prisma = readRepositoryFile('src/prisma/prisma.service.ts');
    const redis = readRepositoryFile('src/redis/redis-lifecycle.service.ts');

    expect(runtime).toContain('app.enableShutdownHooks()');
    expect(runtime).toContain('await app.listen(settings.port, settings.host)');
    expect(prisma).toContain('await this.$disconnect()');
    expect(redis).toContain('this.redis.disconnect(false)');
    expect(review).toContain('Status: Resolved by Production Configuration');
    expect(review).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
  });

  it('records completed production HTTP security boundary remediation', () => {
    const validation = readRepositoryFile('src/config/config.validation.ts');
    const environment = readRepositoryFile('.env.example');

    expect(validation).toContain('SWAGGER_ENABLED must be false in production');
    expect(validation).toContain('PRODUCTION_PLACEHOLDER_SECRETS');
    expect(environment).toContain('HOST=0.0.0.0');
    expect(environment).toContain('SWAGGER_ENABLED=true');
    expect(review).toContain(
      'Status: Resolved by Production Security Boundary Hardening',
    );
  });

  it('keeps metrics exposure and recovery work explicit', () => {
    const observability = readRepositoryFile('docs/observability.md');

    expect(observability).toContain(
      'Production requires a bearer token for `/metrics`',
    );
    expect(review).toContain(
      'Status: Resolved by Deployment and Recovery Foundation',
    );
    expect(review).toContain('Redis remains non-authoritative');
  });

  it('preserves the completed production-readiness remediation sequence', () => {
    expect(review).toContain('Production Configuration and Process Lifecycle Foundation — Completed');
    expect(review).toContain('Production Security Boundary Hardening — Completed');
    expect(review).toContain('Deployment and Recovery Foundation — Completed');
    expect(review).toContain('MQTT Production Transport Implementation — Completed');
    expect(review).toContain('Status: NOT READY FOR PRODUCTION DEPLOYMENT');
  });
});
