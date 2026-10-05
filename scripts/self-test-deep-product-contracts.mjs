#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
};


const contractPolicy = JSON.parse(read('test/contract-surface-policy.json'));
for (const rel of [
  'test/admin-web-session-lifecycle.contract.spec.ts',
  'test/deep-product-integrity.contract.spec.ts',
]) {
  assert(
    contractPolicy.contractClasses?.[rel] === 'stable-contract',
    `repository contract policy classifies new deep-product guard: ${rel}`,
  );
}

const packageJson = JSON.parse(read('package.json'));
const wave2Targeted = packageJson.scripts?.['wave2:test:targeted'] ?? '';
for (const rel of [
  'src/admin-operations/tenant-creation-meters.contract.spec.ts',
  'test/historical-contract-transition-safety.contract.spec.ts',
  'test/module-10-admin-web-operational-summary-route.spec.ts',
  'test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts',
]) {
  assert(wave2Targeted.includes(rel), `targeted pre-push includes GitHub regression suite: ${rel}`);
}
assert(
  (packageJson.scripts?.['wave3:prepush:check'] ?? '').includes('npm test -- --runInBand'),
  'full local pre-push runs the complete Jest suite before ESP32 self-test',
);
const tenantMeterContract = read('src/admin-operations/tenant-creation-meters.contract.spec.ts');
assert(
  tenantMeterContract.includes('$transaction: jest.fn') &&
    tenantMeterContract.includes('expect(prisma.$transaction).toHaveBeenCalledTimes(1)'),
  'tenant metering contract models the interactive Prisma transaction instead of bypassing it',
);
for (const rel of [
  'test/module-10-admin-web-operational-summary-route.spec.ts',
  'test/module-10-admin-web-operational-dashboard-ui-foundation.contract.spec.ts',
]) {
  const source = read(rel);
  assert(source.includes('if (status === 401)'), `${rel} pins final-401 session invalidation`);
  assert(
    source.includes("not.toContain('status === 401 || status === 403')") ||
      source.includes('not.toMatch(/status\\s*===\\s*401'),
    `${rel} explicitly rejects 403 impersonating logout`,
  );
}

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

const roleTenantFkMigration = read(
  'prisma/migrations/20261005011500_tenant_role_override_tenant_integrity/migration.sql',
);
const databaseIntegration = read('test/integration/database.integration-spec.ts');
assert(
  prismaSchema.includes('@@unique([id, tenantId])') &&
    prismaSchema.includes(
      '@relation(fields: [roleId, tenantId], references: [id, tenantId], onDelete: Cascade',
    ) &&
    roleTenantFkMigration.includes('cross-tenant membership_role_overrides rows exist') &&
    roleTenantFkMigration.includes('mro_role_tenant_fkey'),
  'database enforces MembershipRoleOverride -> CustomRole tenant-scoped referential integrity fail-closed',
);
assert(
  databaseIntegration.includes(
    'rejects a custom-role override whose role belongs to another tenant at the database boundary',
  ) && databaseIntegration.includes("rejects.toMatchObject({ code: 'P2003' })"),
  'database integration proves cross-tenant custom-role overrides are rejected by PostgreSQL',
);

const integrationTenantFkMigration = read(
  'prisma/migrations/20261005165000_integration_registry_tenant_integrity/migration.sql',
);
assert(
  prismaSchema.includes(
    '@relation(fields: [integrationId, tenantId], references: [id, tenantId], onDelete: Cascade',
  ) &&
    integrationTenantFkMigration.includes('orphan integrations rows exist') &&
    integrationTenantFkMigration.includes('orphan or cross-tenant integration_sync_state rows exist') &&
    integrationTenantFkMigration.includes('ALTER COLUMN "syncedAt" SET DEFAULT CURRENT_TIMESTAMP') &&
    integrationTenantFkMigration.includes('integration_sync_state_integration_tenant_fkey'),
  'database enforces IntegrationSyncState -> Integration tenant-scoped provenance fail-closed',
);
assert(
  databaseIntegration.includes('enforces Integration Registry tenant provenance') &&
    databaseIntegration.includes('integrationSyncState.findUnique'),
  'database integration proves cross-tenant Integration Registry writes fail and owned sync rows cascade',
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
  'automation-non-reportable-trigger-rejected',
  'scheduled-scene-delete-refused',
  'organization-product-lifecycle',
  'tenant-custom-role-enforcement-lifecycle',
]) {
  assert(runtimeExtension.includes(proof), `live runtime UAT covers ${proof}`);
}

const organizationService = read('src/org/organization.service.ts');
const organizationUi = read('apps/admin-web/components/super-organizations-content.tsx');
assert(
  organizationService.includes('listOrganizations(') &&
    organizationService.includes('this.prisma.organization.count()') &&
    organizationService.includes("code === 'P2002'") &&
    organizationUi.includes('+ Tambah cabang'),
  'organization platform lifecycle is discoverable and database-race safe',
);
const organizationController = read('src/org/organization.controller.ts');
const tenantOrganizationUi = read('apps/admin-web/app/tenant/organisasi/page.tsx');
const tenantOrganizationCurrentRoute = read('apps/admin-web/app/api/admin/organizations/current/route.ts');
assert(
  organizationController.includes("@Post('branches')\n  @UseGuards(JwtAuthGuard, TenantContextGuard, PlatformRoleGuard)") &&
    organizationController.includes("@Get('current')") &&
    tenantOrganizationCurrentRoute.includes("client.request('/organizations/current')") &&
    tenantOrganizationUi.includes('/api/admin/organizations/current') &&
    !tenantOrganizationUi.includes('/api/admin/organizations/branches') &&
    !tenantOrganizationUi.includes('Tambah Cabang'),
  'tenant organization surface is parameter-free/read-only while branch mutation is platform-only',
);

const organizationBranchDeleteRoute = read(
  'apps/admin-web/app/api/super/organizations/[organizationId]/branches/[tenantId]/route.ts',
);
const organizationDeleteRoute = read(
  'apps/admin-web/app/api/super/organizations/[organizationId]/route.ts',
);
assert(
  organizationController.includes("@Delete(':id/branches/:tenantId')") &&
    organizationController.includes("@Delete(':id')") &&
    organizationService.includes('removeBranch(') &&
    organizationService.includes('deleteOrganization(') &&
    organizationService.includes('OrgPrimaryBranchRemovalForbidden') &&
    organizationBranchDeleteRoute.includes("method: 'DELETE'") &&
    organizationDeleteRoute.includes("method: 'DELETE'") &&
    organizationUi.includes('Lepas cabang') &&
    organizationUi.includes('Hapus organisasi'),
  'organization lifecycle supports guarded branch detach and organization deletion through product surfaces',
);
assert(
  runtimeExtension.includes('primaryDetachRejectedHttpStatus: 409') &&
    runtimeExtension.includes('secondaryBranchRemovedViaApi: true') &&
    runtimeExtension.includes('organizationDeleted: true') &&
    runtimeExtension.includes('tenantMembershipCleared: true') &&
    !runtimeExtension.includes('prisma.organizationBranch.deleteMany'),
  'organization live UAT proves primary protection and performs cleanup through product APIs instead of direct Prisma mutation',
);
assert(
  runtimeExtension.includes('primaryDetachRejected.status === 409') &&
    !runtimeExtension.includes('primaryDetachRejected.response.status'),
  'organization live UAT reads the apiRequest status contract directly while preserving the mandatory HTTP 409 assertion',
);

const roleController = read('src/rbac/tenant-role.controller.ts');
const roleUi = read('apps/admin-web/components/tenant-role-management-content.tsx');
assert(
  roleController.includes("@Get('catalog')") &&
    roleUi.includes('/api/admin/roles/catalog') &&
    roleUi.includes('/api/admin/roles/members/'),
  'tenant custom-role catalog and assignment lifecycle are operable from the web console',
);
assert(
  roleController.includes("membership.role !== 'MEMBER'") &&
    roleUi.includes("user.role === 'MEMBER'"),
  'tenant custom-role assignment remains MEMBER-only while ADMIN keeps wildcard base permissions',
);

const webhookUi = read('apps/admin-web/app/tenant/webhooks/page.tsx');
const webhookRotateRoute = read('apps/admin-web/app/api/admin/webhooks/endpoints/[endpointId]/rotate-secret/route.ts');
const webhookProbe = read('scripts/probe-webhook-event-vocabulary.sh');
assert(
  webhookUi.includes('Yakin rotasi') &&
    webhookRotateRoute.includes('/rotate-secret') &&
    webhookProbe.includes('the old signing secret is invalid immediately after rotation'),
  'webhook secret rotation is operator-accessible and live-probed for old-secret invalidation',
);

assert(
  runtimeExtension.includes("const automationTriggerCapabilityKey = 'signal'") &&
    runtimeExtension.includes('capabilityKey: automationTriggerCapabilityKey') &&
    runtimeExtension.includes('expected: [400]') &&
    runtimeExtension.includes("includes('reportable')"),
  'live runtime UAT separates the capability-shape fixture from a valid reportable automation trigger while retaining the negative guard',
);

const share = read('apps/admin-web/components/device-share-panel.tsx');
assert(share.includes('membersError') && !share.includes(".catch(() => setMembers([]))"), 'device sharing surfaces member-directory failures');
const billing = read('apps/admin-web/components/super-billing-content.tsx');
assert(billing.includes('tenantDirectoryError') && billing.includes('Data billing tetap ditampilkan dengan ID tenant'), 'billing surfaces tenant-directory degradation without hiding billing data');

const shell = read('apps/admin-web/components/super-admin-shell.tsx');
assert(shell.includes("label: 'Profile & Session'"), 'super navigation truthfully labels profile/session settings surface');
const routeMap = read('docs/UI-ROUTE-MAP.md');
assert(!routeMap.includes('templateEntity: ABSENT') && routeMap.includes('Profile & Session only'), 'UI route map matches implemented capability lifecycle and settings scope');
for (const route of ['/tenant/api-keys', '/tenant/webhooks', '/tenant/organisasi']) {
  assert(routeMap.includes(route), `UI route map includes runtime tenant route ${route}`);
}

const productionReadiness = read('docs/production-readiness.md');
assert(
  productionReadiness.includes('Status: NOT READY FOR PRODUCTION DEPLOYMENT') &&
    productionReadiness.includes('Completion review status: LOCAL GATES PASSED') &&
    productionReadiness.includes('ea182d9f840b8f9a74c5957c386416084e9af216') &&
    productionReadiness.includes('37266021484') &&
    productionReadiness.includes('Repository software status: GREEN AT'),
  'production readiness keeps canonical fail-closed deployment status while recording repository-green authority separately',
);

const roadmap = read('docs/ENTERPRISE-WAVE-ROADMAP.md');
assert(/Waves 1[–-]13: \*\*SOFTWARE SCOPE CLOSED \/ GREEN\*\*/.test(roadmap), 'enterprise roadmap records terminal Waves 1-13 software closure');
for (const rel of ['CURRENT-STATE.md','PROJECT-HANDOFF.md','docs/SESSION-CHECKPOINT.md','chat-session.md']) {
  const text = read(rel).split(/--- HISTORICAL/)[0];
  assert(text.includes('software-closed=1-13; active=none'), `${rel} uses terminal enterprise-wave marker`);
  assert(text.includes('37266021484') && text.includes('ea182d9f840b8f9a74c5957c386416084e9af216'), `${rel} points to the latest all-green evidence baseline`);
}

console.log('DEEP PRODUCT CONTRACT SELF-TEST PASS');
