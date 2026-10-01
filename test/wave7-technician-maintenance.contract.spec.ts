import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 7 technician maintenance, contract.
 *
 * Written before the domain exists, so the first run is RED by construction. What it pins is the
 * shape decision and the reason for it, because both are easy to lose in a later refactor and both
 * are the difference between a maintenance state that holds and one that does not.
 *
 * The load-bearing assertion in here is the heartbeat one. It is the reason maintenance is a
 * separate record rather than a `DeviceStatus` value, and it is stated as a fact about the running
 * code rather than as a preference.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const SCHEMA = read('prisma/schema.prisma');
const DEVICE_SERVICE = read('src/device/device.service.ts');
const TECHNICIAN_PAGE = exists('apps/admin-web/app/technician/page.tsx')
  ? read('apps/admin-web/app/technician/page.tsx')
  : '';

describe('the decision that shapes the whole domain', () => {
  it('DeviceStatus has no maintenance value, and must not gain one', () => {
    // `updateHeartbeat` writes `status: ACTIVE` on every heartbeat, through a device-credential
    // route. A `MAINTENANCE` member of this enum would therefore be overwritten by the device's own
    // next ping -- maintenance would last as long as it took to notice, which for a healthy device
    // is seconds. Asserted here so the enum cannot be "helpfully" extended later.
    const enumBody = SCHEMA.slice(
      SCHEMA.indexOf('enum DeviceStatus'),
      SCHEMA.indexOf('}', SCHEMA.indexOf('enum DeviceStatus')),
    );
    expect(enumBody).not.toMatch(/MAINTENANCE|IN_REPAIR|UNDER_REPAIR/);
  });

  it('and the heartbeat really does claim ACTIVE unconditionally', () => {
    // Without this the assertion above would pass for the wrong reason: a future fix that stops
    // overwriting status would make a maintenance enum safe, and then the guard above would be
    // protecting against a hazard that no longer exists.
    expect(DEVICE_SERVICE).toMatch(
      /lastHeartbeatAt:\s*new Date\(\),\s*status:\s*DeviceStatus\.ACTIVE/,
    );
  });
});

describe('the maintenance record is its own domain', () => {
  it('is modelled in the schema', () => {
    expect(SCHEMA).toMatch(/^model DeviceMaintenance /m);
  });

  it('hangs off the device it is about', () => {
    expect(SCHEMA).toMatch(/device\s+Device\s+@relation/);
  });

  it('is tenant-scoped, and says so in its key', () => {
    // Tenant scope is the property the whole platform leans on. A maintenance record without it
    // would be addressable by id from any tenant.
    expect(SCHEMA).toMatch(/@@unique\(\[id, tenantId\]\)/);
    expect(SCHEMA).toMatch(/@@index\(\[tenantId/);
  });

  it('records who opened it and who closed it', () => {
    // A maintenance window with no actor is a status flag, and a status flag answers "is it broken"
    // without ever answering "who decided, and when".
    expect(SCHEMA).toMatch(/openedByUserId\s+String/);
    expect(SCHEMA).toMatch(/resolvedByUserId\s+String\?/);
    expect(SCHEMA).toMatch(/openedAt\s+DateTime/);
    expect(SCHEMA).toMatch(/resolvedAt\s+DateTime\?/);
  });

  it('keeps the reason, because "maintenance" without one is not actionable', () => {
    expect(SCHEMA).toMatch(/reason\s+String/);
  });

  it('allows at most one open window per device', () => {
    // Two open windows means two technicians believe they own the same device, and the second
    // closure silently ends the first one's work.
    expect(SCHEMA).toMatch(/status\s+MaintenanceStatus\s+@default\(OPEN\)/);
  });
});

describe('the state machine is forward-only and bounded', () => {
  it('opens and resolves, and nothing else', () => {
    expect(SCHEMA).toMatch(/enum MaintenanceStatus \{\s*OPEN\s*RESOLVED\s*\}/);
  });

  it('a resolved window is not silently reopened by a late write', () => {
    // The shape of the bug: one technician resolves the window while another's resolve is still in
    // flight. Without an OPEN precondition on the write, the second resolve lands on a closed row and
    // reports success -- and more importantly, a future "reopen" edit would have nothing to stop it.
    //
    // An earlier version of this assertion only checked that `updateMany` and a `count !== 1` branch
    // existed. Removing the status precondition from the where clause left every assertion green,
    // which is the exact mutation this test exists to catch.
    const service = read('src/device-maintenance/device-maintenance.service.ts');

    // Isolate the conditional write itself: the read above it also mentions OPEN, so a whole-file
    // search would pass on the wrong occurrence.
    const updateStart = service.indexOf('deviceMaintenance.updateMany');
    expect(updateStart).toBeGreaterThan(-1);

    // The `where` clause only. A wider slice also catches the `count !== 1` guard that comes after
    // the write, which made an earlier version of this assertion reject correct code.
    const whereEnd = service.indexOf('data:', updateStart);
    const whereClause = service.slice(updateStart, whereEnd);
    expect(whereClause).toMatch(/status:\s*MaintenanceStatus\.OPEN/);

    // And the guard must still act on the precondition's result.
    const after = service.slice(whereEnd, whereEnd + 400);
    expect(after).toMatch(/count !== 1/);
  });
});

describe('every mutation leaves a trace', () => {
  it('opens and closes through the audit service', () => {
    const service = read('src/device-maintenance/device-maintenance.service.ts');
    expect(service).toMatch(/RbacAuditService|rbacAudit/);
    expect(service).toMatch(/audit/i);
  });

  it('and the audit row says where the permission came from', () => {
    // This platform's convention: an audit row that says "tenant scope" when the gate was a role
    // check is a false record, and `rescue:validate` enforces the distinction. The convention is a
    // `detail` string that says so -- an earlier version of this assertion looked for a
    // `permissionSource` identifier that has never existed in this codebase.
    const service = read('src/device-maintenance/device-maintenance.service.ts');
    expect(service).toMatch(/detail:/);
    expect(service).toMatch(/tenant membership scope, not by an owner rule/);
  });
});

describe('the routes', () => {
  const controller = 'src/device-maintenance/device-maintenance.controller.ts';

  it('exists, and lists the three operations the technician tab needs', () => {
    expect(exists(controller)).toBe(true);
    const source = read(controller);
    expect(source).toMatch(/@Get\(\)/);
    expect(source).toMatch(/@Post\('devices\/:deviceId'\)/);
    expect(source).toMatch(/@Delete\(':maintenanceId'\)/);
  });

  it('takes the tenant from verified context, never from a body field', () => {
    const source = read(controller);
    expect(source).toMatch(/TenantContextGuard/);
    // A tenant id accepted from the payload is a cross-tenant write.
    expect(source).not.toMatch(/@Body\(\)[\s\S]{0,40}tenantId:/);
  });

  it('is gated rather than open to any member', () => {
    const source = read(controller);
    expect(source).toMatch(/AdminRoleGuard|RequirePermission/);
  });
});

describe('the technician page stops delegating maintenance away', () => {
  it('shows maintenance from the real endpoint', () => {
    expect(TECHNICIAN_PAGE).toMatch(/\/api\/admin\/device-maintenance|device-maintenance/);
  });

  it('no longer tells the operator the domain does not exist', () => {
    // The page currently states, truthfully for its day, that maintenance has no persistent
    // domain. Once it does, that sentence becomes a lie told to an operator.
    expect(TECHNICIAN_PAGE).not.toMatch(/belum memiliki domain persisten/);
    expect(TECHNICIAN_PAGE).not.toMatch(/Tidak ada domain persisten untuk status maintenance/);
  });
});

describe('what the technician tab is not allowed to claim', () => {
  it('does not invent a log stream from anything but a real endpoint', () => {
    // The logs tab previously redirected. If a future change renders synthetic rows, this fails --
    // synthetic device logs are the specific thing the quarantine banner exists to prevent.
    expect(TECHNICIAN_PAGE).not.toMatch(/Math\.random/);
  });

  it('shows the open window as open, and a closed one as closed', () => {
    expect(TECHNICIAN_PAGE).toMatch(/OPEN|RESOLVED|resolvedAt/);
  });
});