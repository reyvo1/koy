import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

describe('Module 10 Slice 10.1 dashboard domain and schema proposal contract', () => {

  it('defines the normalized dashboard aggregate and persistence decision', () => {
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');

    for (const model of [
      'Dashboard',
      'DashboardLayout',
      'DashboardWidget',
      'DashboardLayoutItem',
      'DashboardWidgetBinding',
    ]) {
      expect(proposal).toContain(`### ${model}`);
    }

    expect(proposal).toContain(
      'persisted in PostgreSQL through normalized relational tables',
    );
    expect(proposal).toContain(
      'will not be stored as one opaque JSON document',
    );
    expect(proposal).toContain('ownerMembershipId');
    expect(proposal).toContain('schemaVersion');
    expect(proposal).toContain('revision');
    expect(proposal).toContain('optimistic concurrency');
  });

  it('defines tenant-aware ownership and referential integrity', () => {
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');

    expect(proposal).toContain('trusted authenticated tenant context');
    expect(proposal).toContain('Membership(id, tenantId)');
    expect(proposal).toContain('Device(id, tenantId)');
    expect(proposal).toContain('Capability(id, deviceId)');
    expect(proposal).toContain(
      'shared mutation and read behavior must remain disabled',
    );
    expect(proposal).toContain('No client-only authorization decision');
  });

  it('defines the complete widget vocabulary and compatibility rules', () => {
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');

    for (const kind of [
      'CARD',
      'SWITCH',
      'GAUGE',
      'CHART',
      'MAP',
      'TABLE',
      'STATUS',
    ]) {
      expect(proposal).toContain(kind);
    }

    for (const mode of [
      'DEVICE_STATUS',
      'LATEST',
      'HISTORY',
      'AGGREGATE',
      'COMMAND',
    ]) {
      expect(proposal).toContain(mode);
    }

    expect(proposal).toContain('writable boolean capability');
    expect(proposal).toContain('numeric reportable capabilities');
    expect(proposal).toContain('paired latitude/longitude bindings');
    expect(proposal).toContain('does not allow arbitrary SQL');
  });

  it('bounds configuration and rejects secrets or executable content', () => {
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');

    expect(proposal).toContain('100 widgets');
    expect(proposal).toContain('16 bindings');
    expect(proposal).toContain('8 KiB');
    expect(proposal).toContain('4 KiB');
    expect(proposal).toContain('never stores device credentials');
    expect(proposal).toContain(
      'rejection of secrets, URLs, scripts, SQL, template code, CSS, MQTT topics',
    );
    expect(proposal).toContain('Validation is fail-closed');
  });

  it('preserves the historical proposal boundary while Slice 10.2 implements persistence', () => {
    const schema = read('prisma/schema.prisma');
    const packageJson = JSON.parse(read('package.json')) as {
      workspaces?: unknown;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');
    const persistence = read(
      'docs/module-10-dashboard-persistence-foundation.md',
    );

    expect(schema).toContain('model Dashboard');
    expect(schema).toContain('enum DashboardWidgetKind');
    expect(packageJson.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    expect(packageJson.dependencies?.next).toBeUndefined();
    expect(packageJson.dependencies?.['react-native']).toBeUndefined();
    expect(packageJson.dependencies?.expo).toBeUndefined();
    expect(packageJson.devDependencies?.next).toBeUndefined();
    expect(proposal).toContain(
      'This slice changes lifecycle metadata, architecture documentation, repository memory, and contract tests only',
    );
    expect(proposal).toContain('## Slice 10.2 Implementation Record');
    expect(persistence).toContain('repository-only persistence boundary');
  });

  it('preserves CCTV, barcode, MQTT, Module 11, and deployment boundaries', () => {
    const proposal = read('docs/module-10-dashboard-domain-schema-proposal.md');

    expect(proposal).toContain(
      'does not add camera models, ONVIF, RTSP, vendor connectors',
    );
    expect(proposal).toContain(
      'A scanned code never creates a dashboard binding or activates a device by itself',
    );
    expect(proposal).toContain(
      'prohibited from subscribing directly to device MQTT topics',
    );
    expect(proposal).toContain('Module 11 lifecycle state');
    expect(proposal).toContain('production deployment approval');
  });

});
