import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('Module 10 dashboard persistence foundation contract', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read(
    'prisma/migrations/20260718190000_module_10_dashboard_persistence_foundation/migration.sql',
  );
  const repository = read('src/dashboard/dashboard.repository.ts');
  const moduleSource = read('src/dashboard/dashboard.module.ts');
  const appModule = read('src/app.module.ts');
  const integration = read(
    'test/integration/dashboard-persistence.integration-spec.ts',
  );
  const documentation = read(
    'docs/module-10-dashboard-persistence-foundation.md',
  );

  it('implements the five normalized dashboard models and domain enums', () => {
    for (const model of [
      'Dashboard',
      'DashboardLayout',
      'DashboardWidget',
      'DashboardLayoutItem',
      'DashboardWidgetBinding',
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }

    for (const domainEnum of [
      'DashboardAudience',
      'DashboardBreakpoint',
      'DashboardWidgetKind',
      'DashboardBindingIntent',
      'DashboardBindingMode',
    ]) {
      expect(schema).toContain(`enum ${domainEnum} {`);
    }
  });

  it('uses tenant-aware composite relations and restrictive external references', () => {
    for (const relation of [
      '@@unique([id, tenantId])',
      '@@unique([id, deviceId])',
      'fields: [ownerMembershipId, tenantId]',
      'fields: [dashboardId, tenantId]',
      'fields: [layoutId, tenantId]',
      'fields: [widgetId, tenantId]',
      'fields: [deviceId, tenantId]',
      'fields: [capabilityId, deviceId]',
    ]) {
      expect(schema).toContain(relation);
    }

    expect(schema).toContain('onDelete: Cascade');
    expect(schema).toContain('onDelete: Restrict');
  });

  it('keeps the migration additive and aligned with the approved referential actions', () => {
    expect(migration).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "memberships_id_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "devices_id_tenantId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "capabilities_id_deviceId_key"',
    );
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
    expect(migration).toContain('ON DELETE RESTRICT ON UPDATE CASCADE');
    expect(migration).toContain('FOREIGN KEY ("capabilityId", "deviceId")');
  });

  it('provides a repository-only atomic persistence boundary', () => {
    expect(repository).toContain('this.prisma.$transaction');
    expect(repository).toContain('transaction.membership.findUnique');
    expect(repository).toContain('transaction.dashboard.updateMany');
    expect(repository).toContain('revision: {');
    expect(repository).toContain('increment: 1');
    expect(repository).toContain('assertBindingTargets');
    expect(repository).toContain('replaceChildren');
    expect(repository).toContain('DashboardAudience.PERSONAL');
    expect(repository).not.toContain('RedisService');
    expect(repository).not.toContain('MqttService');

    expect(moduleSource).toContain('DashboardRepository');
    expect(moduleSource).toContain('exports: [DashboardRepository]');
    expect(appModule).toContain('DashboardModule');
    expect(appModule).not.toContain('DashboardController');
  });

  it('proves transaction, revision, composite tenant, cascade, and restrict behavior in PostgreSQL', () => {
    expect(integration).toContain('expectedRevision');
    expect(integration).toContain(
      'DASHBOARD_PERSISTENCE_ERROR_CODES.RevisionConflict',
    );
    expect(integration).toContain(
      'DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid',
    );
    expect(integration).toContain(
      'DASHBOARD_PERSISTENCE_ERROR_CODES.BindingTargetInvalid',
    );
    expect(integration).toContain("code: 'P2003'");
    expect(integration).toContain('prisma.device.delete');
    expect(integration).toContain('prisma.dashboard.delete');
    expect(integration).toContain('resolves.toEqual([0, 0, 0, 0])');
  });

  it('preserves Slice 10.2 evidence while Slice 10.3 advances the lifecycle', () => {

    expect(documentation).toContain(
      'Slice 10.3 is the Tenant-Isolated Dashboard API',
    );
    expect(documentation).toContain(
      'Production deployment remains **NOT APPROVED**',
    );
    expect(documentation).toContain('does not add HTTP endpoints');
    expect(documentation).toContain('CCTV, ONVIF, RTSP');
  });

  it('keeps frontend dependencies isolated in approved workspaces and does not activate Module 11', () => {
    const packageJson = JSON.parse(read('package.json'));

    expect(packageJson.workspaces).toEqual([
      'apps/admin-web',
      'apps/user-web',
      'apps/user-mobile',
      'packages/design-system',
    ]);
    for (const dependency of ['next', 'react-native', 'expo']) {
      expect(packageJson.dependencies?.[dependency]).toBeUndefined();
      expect(packageJson.devDependencies?.[dependency]).toBeUndefined();
    }
  });

});
