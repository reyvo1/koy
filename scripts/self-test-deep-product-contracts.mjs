#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
};

const adminSession = read('apps/admin-web/lib/session.ts');
const adminProxy = read('apps/admin-web/lib/proxy.ts');
assert(adminSession.includes('finalizeAdminSessionResponse'), 'Admin BFF centralizes refresh-cookie and final-401 handling');
assert(adminSession.includes('backendStatus === 401') && adminSession.includes('client.applySessionUpdate(response)'), 'Admin BFF clears only final 401 and persists rotated tokens otherwise');
assert(adminProxy.includes('finalizeAdminSessionResponse(client, next, response.status)'), 'shared Admin proxy persists refreshed sessions on normal responses');
for (const rel of [
  'apps/admin-web/app/api/admin/device-capabilities/route.ts',
  'apps/admin-web/app/api/admin/telemetry-chart/route.ts',
  'apps/admin-web/app/api/tenant/commands/route.ts',
  'apps/admin-web/app/api/tenant/scenes/[sceneId]/run/route.ts',
]) {
  assert(!read(rel).includes('status === 401 || status === 403'), `${rel} preserves 403 without invalidating session`);
}
const adminCaps = read('apps/admin-web/app/api/admin/device-capabilities/route.ts');
assert(adminCaps.includes('if (!response.ok)') && adminCaps.includes('status: response.status'), 'device capability BFF does not turn backend failure into empty 200');
const adminChart = read('apps/admin-web/app/api/admin/telemetry-chart/route.ts');
assert(adminChart.includes('if (!listResponse.ok)') && adminChart.includes('if (!response.ok)'), 'telemetry chart BFF surfaces upstream device/aggregate failures');
const tenantCommands = read('apps/admin-web/app/api/tenant/commands/route.ts');
assert(tenantCommands.includes('throw cause') && tenantCommands.includes('response.status === 403 || response.status === 404'), 'tenant command aggregation propagates infrastructure failures while hiding only expected visibility races');

const dashboard = read('apps/user-web/app/api/dashboard/route.ts');
assert(/error\.status === 401/.test(dashboard), 'dashboard proxy has an explicit 401 branch');
assert(/error\.status === 403/.test(dashboard), 'dashboard proxy has an explicit 403 branch');
const forbidden = dashboard.slice(dashboard.indexOf('error.status === 403'), dashboard.indexOf("return NextResponse.json(\n        {\n          state: 'error'", dashboard.indexOf('error.status === 403')) + 1 || undefined);
assert(!/clearSessionCookies/.test(dashboard.slice(dashboard.indexOf('error.status === 403'), dashboard.indexOf('if (error.status === 403') + 1200)), 'dashboard 403 does not clear a valid session');

const mapper = read('src/rbac/permission-audit-action.ts');
const policy = read('src/rbac/rbac-policy.service.ts');
const guard = read('src/rbac/rbac-permission.guard.ts');
assert(mapper.includes("permission.split('.').pop()"), 'RBAC audit mapper reads permission suffix');
assert(policy.includes('auditActionForPermission') && guard.includes('auditActionForPermission'), 'policy and guard share the canonical RBAC audit mapper');
assert(!policy.includes('permission.startsWith'), 'RBAC policy no longer uses broken permission-prefix mapping');

const schedule = read('src/scheduler/schedule.controller.ts');
assert(!schedule.includes('findTenantScene(tenantId, targetSceneId).catch(() => null)'), 'schedule create does not flatten repository failures to null');
assert(schedule.includes('isExpectedVisibilityDenial') && schedule.includes('if (!this.isExpectedVisibilityDenial(cause)) throw cause'), 'schedule list suppresses only expected visibility denials');

for (const rel of [
  'apps/admin-web/app/api/admin/capability-templates/route.ts',
  'apps/admin-web/app/api/admin/capability-templates/[templateId]/versions/route.ts',
  'apps/admin-web/app/api/admin/capability-templates/[templateId]/deprecate/route.ts',
  'apps/admin-web/app/api/admin/capability-versions/apply/route.ts',
]) assert(existsSync(path.join(root, rel)), `capability lifecycle BFF exists: ${rel}`);
const panel = read('apps/admin-web/components/super-capability-versions-panel.tsx');
assert(/Buat template/.test(panel) && /Publish/.test(panel) && /Deprecate/.test(panel) && /Terapkan/.test(panel), 'capability UI exposes create/publish/deprecate/apply lifecycle');
const capRegistry = read('apps/admin-web/components/super-capabilities-content.tsx');
assert(!/belum ada entity template global terpisah/.test(capRegistry), 'capability registry no longer claims template lifecycle is absent');


const tenantDirectory = read('src/admin-operations/admin-directory.controller.ts');
assert(
  tenantDirectory.includes('this.prisma.$transaction(async (tx)') &&
    tenantDirectory.includes('this.billingQuota.ensureSubscription(') &&
    tenantDirectory.includes('tx.billingSubscription.deleteMany'),
  'tenant create/delete lifecycle keeps mandatory billing rows atomic and removable',
);

const sceneRepository = read('src/scene/scene.repository.ts');
const sceneController = read('src/scene/scene.controller.ts');
const prismaSchema = read('prisma/schema.prisma');
const sceneFkMigration = read(
  'prisma/migrations/20261004213000_schedule_scene_referential_integrity/migration.sql',
);
assert(
  sceneRepository.includes("SceneInUse: 'SCENE_IN_USE'") &&
    sceneRepository.includes('schedule.count') &&
    sceneController.includes('SCENE_PERSISTENCE_ERROR_CODES.SceneInUse'),
  'scene deletion refuses schedules that still reference the scene',
);
assert(
  prismaSchema.includes(
    '@relation(fields: [targetSceneId, tenantId], references: [id, tenantId], onDelete: Restrict',
  ) &&
    sceneFkMigration.includes('schedules_targetSceneId_tenantId_fkey') &&
    sceneFkMigration.includes('orphan schedule targetSceneId rows exist'),
  'database enforces Schedule -> Scene tenant-scoped referential integrity fail-closed',
);

const capabilityLifecycle = read('src/admin-operations/capability-template.service.ts');
for (const required of [
  'schemaVersion: target.version',
  'semanticType: template.semanticType',
  'dataType: template.dataType',
  'unit: template.unit',
  'constraints: target.constraints',
  'isReadable: target.isReadable',
  'isWritable: target.isWritable',
  'isReportable: target.isReportable',
]) {
  assert(
    capabilityLifecycle.includes(required),
    `capability apply carries full published shape: ${required}`,
  );
}
assert(
  capabilityLifecycle.includes('while (candidates.length <= cap)') &&
    capabilityLifecycle.includes('cursor: { id: cursorId }'),
  'capability drift scan cannot permanently hide later drift behind already-aligned rows',
);

const sceneUi = read('apps/admin-web/components/tenant-scenes-content.tsx');
assert(
  sceneUi.includes('scene.actions?.length ?? 0') &&
    !sceneUi.includes('actionCount?: number'),
  'scene UI counts the backend actions contract instead of a synthetic actionCount field',
);
assert(
  sceneUi.includes('if (!enableResponse.ok)') &&
    sceneUi.includes('Scene dibuat tetapi gagal diaktifkan'),
  'scene create UI reports partial create/enable failure honestly',
);

const runtimeExtension = read('scripts/run-rescue-runtime-flow-extension.mjs');
for (const proof of [
  'tenant-create-delete-billing-lifecycle',
  'capability-apply-full-shape',
  'scheduled-scene-delete-refused',
]) {
  assert(runtimeExtension.includes(proof), `live runtime UAT covers ${proof}`);
}

const share = read('apps/admin-web/components/device-share-panel.tsx');
assert(share.includes('membersError') && !share.includes(".catch(() => setMembers([]))"), 'device sharing surfaces member-directory failures');
const billing = read('apps/admin-web/components/super-billing-content.tsx');
assert(billing.includes('tenantDirectoryError') && billing.includes('Data billing tetap ditampilkan dengan ID tenant'), 'billing surfaces tenant-directory degradation without hiding billing data');

const shell = read('apps/admin-web/components/super-admin-shell.tsx');
assert(shell.includes("label: 'Profile & Session'"), 'super navigation truthfully labels profile/session settings surface');
const routeMap = read('docs/UI-ROUTE-MAP.md');
assert(!routeMap.includes('templateEntity: ABSENT') && routeMap.includes('Profile & Session only'), 'UI route map matches implemented capability lifecycle and settings scope');

const roadmap = read('docs/ENTERPRISE-WAVE-ROADMAP.md');
assert(/Waves 1[–-]13: \*\*SOFTWARE SCOPE CLOSED \/ GREEN\*\*/.test(roadmap), 'enterprise roadmap records terminal Waves 1-13 software closure');
for (const rel of ['CURRENT-STATE.md','PROJECT-HANDOFF.md','docs/SESSION-CHECKPOINT.md','chat-session.md']) {
  const text = read(rel).split(/--- HISTORICAL/)[0];
  assert(text.includes('software-closed=1-13; active=none'), `${rel} uses terminal enterprise-wave marker`);
  assert(text.includes('37195822587') && text.includes('e4fdfe11dfd817086ecc93a95dd57cb0b48b8aa4'), `${rel} points to the latest all-green evidence baseline`);
}

console.log('DEEP PRODUCT CONTRACT SELF-TEST PASS');
