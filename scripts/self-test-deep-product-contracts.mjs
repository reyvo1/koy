#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL  ${message}`);
  console.log(`PASS  ${message}`);
};

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
  assert(text.includes('37183166252') && text.includes('b7b62248ec5fe38973993e981c9b753483cf8e10'), `${rel} points to the latest all-green evidence baseline`);
}

console.log('DEEP PRODUCT CONTRACT SELF-TEST PASS');
