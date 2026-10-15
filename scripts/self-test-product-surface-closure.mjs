import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
};
const assert = (condition, message) => (condition ? pass(message) : fail(message));

const required = [
  'apps/admin-web/lib/tenant-navigation.ts',
  'apps/admin-web/app/tenant/audit-log/page.tsx',
  'apps/admin-web/app/tenant/integrasi/page.tsx',
  'apps/admin-web/app/api/tenant/audit-logs/route.ts',
  'apps/admin-web/app/api/tenant/integrations/route.ts',
  'apps/admin-web/app/api/tenant/notifications/[notificationId]/route.ts',
  'docs/BACKEND-FRONTEND-SURFACE-CENSUS.md',
  'test/tenant-operator-surface-closure.contract.spec.ts',
  'test/backend-frontend-surface-census.contract.spec.ts',
  'test/admin-web-navigation-parity.contract.spec.ts',
  'test/user-web-surface-completeness.contract.spec.ts',
  'test/frontend-api-route-parity.contract.spec.ts',
  'prisma/migrations/20261005165000_integration_registry_tenant_integrity/migration.sql',
];
for (const path of required) assert(existsSync(join(root, path)), `product surface source exists: ${path}`);

const tenantNavigation = read('apps/admin-web/lib/tenant-navigation.ts');
const shell = read('apps/admin-web/components/tenant-shell.tsx');
const fieldShell = read('apps/admin-web/components/admin-shell-v3.tsx');
const operationalSummary = read('apps/admin-web/components/operational-summary-experience.tsx');
assert(tenantNavigation.includes("href: '/tenant/audit-log'"), 'tenant Audit route is navigable');
assert(tenantNavigation.includes("href: '/tenant/integrasi'"), 'tenant Integration route is navigable');
assert(shell.includes('const NAV_GROUPS = TENANT_NAV_GROUPS'), 'TenantShell consumes canonical tenant navigation');
assert(fieldShell.includes('...TENANT_NAV_GROUPS'), 'field/lab shell preserves every canonical tenant menu entry');
assert(operationalSummary.includes('const NAV_SECTIONS = TENANT_NAV_GROUPS'), 'dashboard quick access consumes canonical tenant navigation');

const expectedTenantNav = [
  '/tenant/dashboard',
  '/tenant/perangkat',
  '/tenant/grup-perangkat',
  '/tenant/ruangan',
  '/tenant/gedung',
  '/tenant/lokasi',
  '/tenant/realtime',
  '/tenant/grafik',
  '/tenant/historis',
  '/tenant/perintah',
  '/tenant/otomatisasi',
  '/tenant/scenes',
  '/tenant/schedules',
  '/tenant/workspace',
  '/tenant/temuan',
  '/tenant/notifikasi',
  '/tenant/audit-log',
  '/tenant/integrasi',
  '/tenant/api-keys',
  '/tenant/webhooks',
  '/tenant/organisasi',
  '/tenant/laporan',
  '/tenant/pengguna',
];
const tenantNavHrefs = [...tenantNavigation.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]);
assert(
  tenantNavHrefs.length === expectedTenantNav.length &&
    expectedTenantNav.every((href) => tenantNavHrefs.includes(href)),
  `canonical tenant navigation is exact (${tenantNavHrefs.length}/${expectedTenantNav.length})`,
);
for (const href of expectedTenantNav) {
  assert(
    existsSync(join(root, 'apps/admin-web/app', href.replace(/^\//, ''), 'page.tsx')),
    `canonical tenant menu target exists: ${href}`,
  );
}

const auditService = read('src/rbac/rbac-audit.service.ts');
const auditController = read('src/rbac/rbac-audit.controller.ts');
assert(auditService.includes(".toString('base64url')"), 'RBAC audit response cursor is opaque base64url');
assert(auditController.includes("Buffer.from(cursor, 'base64url')"), 'RBAC audit request decodes the same cursor format');

const integrationService = read('src/integrations/integration-registry.service.ts');
const integrationBff = read('apps/admin-web/app/api/tenant/integrations/route.ts');
assert(integrationService.includes("INTEGRATION_CREDENTIAL_REF_PREFIX = 'secret://'"), 'integration service pins secret-reference prefix');
assert(integrationService.includes('startsWith(INTEGRATION_CREDENTIAL_REF_PREFIX)'), 'integration service rejects non-reference credentials');
assert(integrationBff.includes("const SECRET_REF_PREFIX = 'secret://'"), 'integration BFF rejects raw credentials before backend forwarding');
assert(integrationService.includes('const displayName = input.displayName.trim()'), 'integration service normalizes display name at the backend boundary');
const prismaSchema = read('prisma/schema.prisma');
const integrationSchema = prismaSchema.slice(
  prismaSchema.indexOf('model Integration {'),
  prismaSchema.indexOf('// ---------------------------------------------------------------------------', prismaSchema.indexOf('model IntegrationSyncState {')),
);
assert(integrationSchema.includes('@@unique([id, tenantId])'), 'integration schema exposes tenant-composite identity');
assert(
  /integration\s+Integration\s+@relation\(fields:\s*\[integrationId,\s*tenantId\],\s*references:\s*\[id,\s*tenantId\]/.test(integrationSchema),
  'integration sync state is tenant-composite at the Prisma relation boundary',
);
const integrationMigration = read('prisma/migrations/20261005165000_integration_registry_tenant_integrity/migration.sql');
assert(integrationMigration.includes('orphan integrations rows exist'), 'integration migration fails closed on orphan registry rows');
assert(integrationMigration.includes('orphan or cross-tenant integration_sync_state rows exist'), 'integration migration fails closed on bad sync provenance');
assert(integrationMigration.includes('ALTER COLUMN "syncedAt" SET DEFAULT CURRENT_TIMESTAMP'), 'integration migration restores the Prisma syncedAt database default');
assert(
  /FOREIGN KEY \("integrationId", "tenantId"\)[\s\S]*REFERENCES "integrations"\("id", "tenantId"\)/.test(integrationMigration),
  'integration migration installs tenant-composite sync foreign key',
);
const dbIntegration = read('test/integration/database.integration-spec.ts');
assert(dbIntegration.includes('enforces Integration Registry tenant provenance'), 'PostgreSQL suite covers integration tenant provenance');

const notificationService = read('src/notification/notification.service.ts');
const detailAt = notificationService.indexOf('async findForOperator');
const detail = detailAt >= 0 ? notificationService.slice(detailAt) : '';
assert(detail.includes('tenantId: true'), 'notification detail preserves tenant provenance');
assert(detail.includes('destination: true'), 'notification detail exposes operator destination metadata');
assert(!detail.includes('body: true'), 'notification detail does not expose message body/token material');
assert(!detail.includes('idempotencyKey: true'), 'notification detail does not expose idempotency material');
assert(!detail.includes('deliveryLeaseId: true'), 'notification detail does not expose worker lease id');

const notificationPage = read('apps/admin-web/app/tenant/notifikasi/page.tsx');
assert(notificationPage.includes('EXHAUSTED'), 'notification UI renders real EXHAUSTED status');
assert(!notificationPage.includes('RETRY_SCHEDULED'), 'notification UI does not invent RETRY_SCHEDULED');
assert(notificationPage.includes('/api/tenant/notifications/${encodeURIComponent(notificationId)}'), 'notification UI can open safe detail');


const userProvisioningService = read('src/admin-operations/admin-user-provisioning.service.ts');
const userActionsModal = read('apps/admin-web/components/user-actions-modal.tsx');
const tenantUsersContent = read('apps/admin-web/components/tenant-users-content.tsx');
const superUsersContent = read('apps/admin-web/components/super-users-content.tsx');
assert(userProvisioningService.includes('private directoryMembership'), 'user directories share a fail-closed tenant membership resolver');
assert(userProvisioningService.includes('item.tenantId === tenantId'), 'user directory resolver requires the exact tenant membership');
assert(userProvisioningService.includes('User directory membership is inconsistent with tenant ownership'), 'user directory fails closed on membership/tenant integrity drift');
assert(userProvisioningService.includes('status: patch.status ?? membership.status'), 'name-only user updates preserve existing membership status');
assert(userActionsModal.includes("setStatus(user.status ?? 'ACTIVE')"), 'user management modal initializes from actual membership status');
assert(userActionsModal.includes("status === 'PENDING'"), 'user management modal renders pending membership truthfully instead of coercing it to active');
assert(tenantUsersContent.includes("m.status === 'PENDING' || !m.isVerified"), 'tenant user table uses membership PENDING before verification state');
assert(superUsersContent.includes("user.status === 'PENDING' || !user.isVerified"), 'platform user table uses membership PENDING before verification state');
assert(userActionsModal.includes('status !== originalStatus'), 'user management modal sends status only when the operator changes it');

const technicianPage = read('apps/admin-web/app/technician/page.tsx');
assert(technicianPage.includes("fetch('/api/admin/device-maintenance'"), 'technician UI calls the maintenance collection BFF');
assert(technicianPage.includes("method: 'POST'"), 'technician UI can open a maintenance window');
assert(technicianPage.includes('Buka Maintenance'), 'technician UI exposes the manual maintenance action');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
const controllers = walk(join(root, 'src')).filter((path) => path.endsWith('.controller.ts')).sort();
const endpointCount = controllers.reduce((sum, path) => {
  const source = readFileSync(path, 'utf8');
  return sum + [...source.matchAll(/@(Get|Post|Put|Patch|Delete|Sse)\((?:'[^']*'|"[^"]*")?\)/g)].length;
}, 0);
const census = read('docs/BACKEND-FRONTEND-SURFACE-CENSUS.md');
assert(controllers.length === 46, `surface census controller count is current (${controllers.length}/46)`);
assert(endpointCount === 197, `surface census endpoint count is current (${endpointCount}/197)`);
for (const path of controllers) {
  const name = relative(join(root, 'src'), path).split('/').pop();
  assert(census.includes(`\`${name}\``), `surface census accounts for ${name}`);
}

const packageJson = JSON.parse(read('package.json'));
const targeted = packageJson.scripts?.['wave2:test:targeted'] ?? '';
for (const spec of [
  'src/rbac/rbac-audit.service.spec.ts',
  'src/integrations/integration-registry.service.spec.ts',
  'src/admin-operations/admin-user-provisioning.service.spec.ts',
  'test/notification-operator-log.contract.spec.ts',
  'test/tenant-operator-surface-closure.contract.spec.ts',
  'test/backend-frontend-surface-census.contract.spec.ts',
  'test/admin-web-navigation-parity.contract.spec.ts',
  'test/user-web-surface-completeness.contract.spec.ts',
  'test/frontend-api-route-parity.contract.spec.ts',
]) {
  assert(targeted.includes(spec), `targeted QA includes ${spec}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('PRODUCT SURFACE CLOSURE SELF-TEST PASS');
