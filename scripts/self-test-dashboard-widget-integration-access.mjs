import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(
  resolve(root, 'test/integration/dashboard-widget-query.integration-spec.ts'),
  'utf8',
);

let failed = false;
function check(name, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failed = true;
}

check(
  'dashboard widget integration wires centralized device access into DashboardService',
  source.includes("import { DeviceAccessService } from '../../src/device/device-access.service';") &&
    source.includes('const deviceAccess = new DeviceAccessService(prismaService);') &&
    source.includes('queryService,\n    deviceAccess,'),
);

check(
  'dashboard widget integration MEMBER fixture carries real user identity and device ownership',
  source.includes('let userId: string;') &&
    source.includes('userId = user.id;') &&
    source.includes('ownerId: user.id,') &&
    source.match(/\{ tenantId, membershipId, userId, role: 'MEMBER' \}/g)?.length === 2,
);

check(
  'dashboard widget production filtering remains fail-closed for MEMBER access evaluation',
  readFileSync(resolve(root, 'src/dashboard/dashboard.service.ts'), 'utf8').includes(
    "if (!context.userId || !this.deviceAccessService) {",
  ) &&
    readFileSync(resolve(root, 'src/dashboard/dashboard.service.ts'), 'utf8').includes(
      'return new Map();',
    ),
);

if (failed) process.exit(1);
