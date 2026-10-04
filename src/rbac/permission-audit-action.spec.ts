import { auditActionForPermission } from './permission-audit-action';

describe('auditActionForPermission', () => {
  it.each([
    ['dashboard.read', 'READ'],
    ['dashboard.create', 'CREATE'],
    ['dashboard.update', 'UPDATE'],
    ['dashboard.delete', 'DELETE'],
    ['device.share', 'GRANT'],
    ['device.grant', 'GRANT'],
    ['device.revoke', 'REVOKE'],
    ['device.provision', 'UPDATE'],
    ['device.assignOwner', 'UPDATE'],
  ] as const)('%s -> %s', (permission, expected) => {
    expect(auditActionForPermission(permission)).toBe(expected);
  });
});
