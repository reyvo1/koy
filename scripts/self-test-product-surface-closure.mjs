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
  'apps/admin-web/app/tenant/audit-log/page.tsx',
  'apps/admin-web/app/tenant/integrasi/page.tsx',
  'apps/admin-web/app/api/tenant/audit-logs/route.ts',
  'apps/admin-web/app/api/tenant/integrations/route.ts',
  'apps/admin-web/app/api/tenant/notifications/[notificationId]/route.ts',
  'docs/BACKEND-FRONTEND-SURFACE-CENSUS.md',
  'test/tenant-operator-surface-closure.contract.spec.ts',
  'test/backend-frontend-surface-census.contract.spec.ts',
  'prisma/migrations/20261005165000_integration_registry_tenant_integrity/migration.sql',
];
for (const path of required) assert(existsSync(join(root, path)), `product surface source exists: ${path}`);

const shell = read('apps/admin-web/components/tenant-shell.tsx');
assert(shell.includes("href: '/tenant/audit-log'"), 'tenant Audit route is navigable');
assert(shell.includes("href: '/tenant/integrasi'"), 'tenant Integration route is navigable');

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
assert(controllers.length === 45, `surface census controller count is current (${controllers.length}/45)`);
assert(endpointCount === 187, `surface census endpoint count is current (${endpointCount}/187)`);
for (const path of controllers) {
  const name = relative(join(root, 'src'), path).split('/').pop();
  assert(census.includes(`\`${name}\``), `surface census accounts for ${name}`);
}

const packageJson = JSON.parse(read('package.json'));
const targeted = packageJson.scripts?.['wave2:test:targeted'] ?? '';
for (const spec of [
  'src/rbac/rbac-audit.service.spec.ts',
  'src/integrations/integration-registry.service.spec.ts',
  'test/notification-operator-log.contract.spec.ts',
  'test/tenant-operator-surface-closure.contract.spec.ts',
  'test/backend-frontend-surface-census.contract.spec.ts',
]) {
  assert(targeted.includes(spec), `targeted QA includes ${spec}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log('PRODUCT SURFACE CLOSURE SELF-TEST PASS');
