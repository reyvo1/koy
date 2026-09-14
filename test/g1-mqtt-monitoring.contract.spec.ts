import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('G1.10/G1.11 MQTT Center + Monitoring screens live', () => {
  it('monitoring page probes real readiness via /api/super/health proxy', () => {
    const page = read('apps/admin-web/app/super/monitoring/page.tsx');
    expect(page).toContain('SuperMonitoringContent');
    const route = read('apps/admin-web/app/api/super/health/route.ts');
    expect(route).toContain("backendFetch('/health/ready'");
  });

  it('monitoring content fails closed when backend is unreachable', () => {
    const content = read(
      'apps/admin-web/components/super-monitoring-content.tsx',
    );
    expect(content).toContain('UNREACHABLE');
    // Hardcoded "Healthy" static rows are gone.
    expect(content).not.toContain("['PostgreSQL', 'localhost:5432', '🟢'");
  });

  it('mqtt center documents the authoritative webhook contract without fabricating state', () => {
    const page = read('apps/admin-web/app/super/mqtt/page.tsx');
    expect(page).toContain('SuperMqttContent');
    const content = read('apps/admin-web/components/super-mqtt-content.tsx');
    expect(content).toContain('/mqtt/webhook');
    expect(content).toContain('BACKEND DOWN');
  });
});
