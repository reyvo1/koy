import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('deep product integrity regressions', () => {
  it('creates tenant and mandatory billing subscription atomically', () => {
    const controller = read('src/admin-operations/admin-directory.controller.ts');
    const create = controller.slice(
      controller.indexOf("async createTenant"),
      controller.indexOf("@Patch('tenants/:tenantId')"),
    );
    expect(create).toContain('this.prisma.$transaction(async (tx)');
    expect(create).toContain('tx.tenant.create');
    expect(create).toContain('this.billingQuota.ensureSubscription(');
    expect(create).toMatch(/planTier:\s*'FREE'[\s\S]*tx/);
  });

  it('removes the system-owned subscription before deleting an otherwise-empty tenant', () => {
    const controller = read('src/admin-operations/admin-directory.controller.ts');
    const remove = controller.slice(
      controller.indexOf("async deleteTenant"),
      controller.indexOf("@Get('users')"),
    );
    expect(remove).toContain('tx.billingSubscription.deleteMany');
    expect(remove).toContain('tx.tenant.delete');
    expect(remove).toContain("'P2003'");
    expect(remove).toContain('DomainConflictException');
  });

  it('enforces Schedule -> Scene referential integrity in schema and SQL', () => {
    const schema = read('prisma/schema.prisma');
    const schedule = schema.slice(
      schema.indexOf('model Schedule {'),
      schema.indexOf('enum ScheduleRunStatus'),
    );
    expect(schedule).toMatch(
      /targetScene\s+Scene\?\s+@relation\(fields:\s*\[targetSceneId,\s*tenantId\],\s*references:\s*\[id,\s*tenantId\],\s*onDelete:\s*Restrict/,
    );
    const migration = read(
      'prisma/migrations/20261004213000_schedule_scene_referential_integrity/migration.sql',
    );
    expect(migration).toContain('orphan schedule targetSceneId rows exist');
    expect(migration).toMatch(
      /FOREIGN KEY \("targetSceneId", "tenantId"\)[\s\S]*REFERENCES "scenes"\("id", "tenantId"\)[\s\S]*ON DELETE RESTRICT/,
    );
  });

  it('refuses deleting a scene while a schedule still references it', () => {
    const repo = read('src/scene/scene.repository.ts');
    expect(repo).toContain("SceneInUse: 'SCENE_IN_USE'");
    expect(repo).toMatch(/schedule\.count\(\{[\s\S]*targetSceneId:\s*sceneId/);
    expect(repo).toContain("code === 'P2003'");

    const controller = read('src/scene/scene.controller.ts');
    expect(controller).toContain('SCENE_PERSISTENCE_ERROR_CODES.SceneInUse');
    expect(controller).toContain('Scene masih dipakai Schedule');
  });

  it('applies the complete published capability shape, not schemaVersion alone', () => {
    const service = read('src/admin-operations/capability-template.service.ts');
    const apply = service.slice(service.indexOf('async applyVersion'));
    const write = apply.slice(apply.indexOf('capability.updateMany({'), apply.indexOf('this.audit('));
    expect(write).toContain('schemaVersion: target.version');
    expect(write).toContain('semanticType: template.semanticType');
    expect(write).toContain('dataType: template.dataType');
    expect(write).toContain('unit: template.unit');
    expect(write).toContain('constraints: target.constraints');
    expect(write).toContain('isReadable: target.isReadable');
    expect(write).toContain('isWritable: target.isWritable');
    expect(write).toContain('isReportable: target.isReportable');

    // Same-version rows can still be malformed after the old implementation stamped only the
    // version, so candidate selection must inspect the shape as well.
    expect(apply).toContain('candidate.semanticType !== template.semanticType');
    expect(apply).toContain('candidate.constraints');
    expect(apply).toContain('candidate.isWritable !== target.isWritable');
  });

  it('renders Scene action count from the backend actions array and checks enable success', () => {
    const ui = read('apps/admin-web/components/tenant-scenes-content.tsx');
    expect(ui).toContain('actions?: Array<{ id?: string }>');
    expect(ui).toContain('scene.actions?.length ?? 0');
    expect(ui).toContain('if (!enableResponse.ok)');
    expect(ui).toContain('Scene dibuat tetapi gagal diaktifkan');
    expect(ui).not.toContain('actionCount?: number');
  });

  it('extends live runtime UAT for the newly discovered blind spots', () => {
    const runner = read('scripts/run-rescue-runtime-flow-extension.mjs');
    expect(runner).toContain('tenant-create-delete-billing-lifecycle');
    expect(runner).toContain('capability-apply-full-shape');
    expect(runner).toContain('automation-non-reportable-trigger-rejected');
    expect(runner).toContain("const automationTriggerCapabilityKey = 'signal'");
    expect(runner).toContain('capabilityKey: automationTriggerCapabilityKey');
    expect(runner).toContain("expected: [400]");
    expect(runner).toContain("includes('reportable')");
    expect(runner).toContain('scheduled-scene-delete-refused');
    expect(runner).toContain("expected: [409]");
  });
});
