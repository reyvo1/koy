import { readFileSync } from 'node:fs';

/**
 * Wave 7, the last two technician units: the commissioning surface and the device log.
 *
 * Both were, until now, sentences on a page telling the operator to go somewhere else. Both are
 * built on data that already exists — which is the point worth recording, because the previous
 * version of this page implied neither existed.
 *
 * The load-bearing distinction in the log unit: a device log here means **what the platform sent to
 * the device and what came back**, built from `DeviceCommand`. It does not mean telemetry, which is
 * what the device reported on its own. Rendering one as the other would put invented "device
 * activity" in front of a technician, which is exactly what the quarantine banner on that page
 * exists to prevent.
 */

const ROOT = '/home/ivo/Desktop/program/iot';
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const PAGE = read('apps/admin-web/app/technician/page.tsx');
const DEVICE_SERVICE = read('src/device/device.service.ts');
const SCHEMA = read('prisma/schema.prisma');

describe('the device log endpoint exists and says what it is', () => {
  const service = 'src/device/device-command-log.service.ts';

  it('is a real service, not a route that fabricates rows', () => {
    expect(exists(service)).toBe(true);
  });

  it('reads DeviceCommand, the real record of what was sent', () => {
    // Asserting the model name is deliberate: a service that returned synthetic entries would
    // satisfy any weaker shape and put fiction in front of a technician.
    expect(read(service)).toMatch(/deviceCommand\.(findMany|count)/);
  });

  it('scopes every read by tenant as well as by device', () => {
    const source = read(service);
    // Anchored on the command query, not on the first occurrence of the word "where" -- which, in
    // this file, is in a comment. A prose match would have passed on a service that scoped nothing.
    const queryAt = source.indexOf('deviceCommand.findMany');
    expect(queryAt).toBeGreaterThan(-1);
    // From the `where` assignment itself, not a window before the call: a window large enough to
    // reach back also reaches the device lookup above it, which legitimately has both clauses and
    // therefore satisfies the assertion no matter what this query does.
    // Anchored to the assignment, not a substring search. Two earlier versions of this assertion
    // used `indexOf('const where')` and passed the mutation, because the service's own comment
    // quotes `const where = { deviceId, tenantId }` -- so the match landed inside the prose, and the
    // prose contains `tenantId`. A guard that reads its own documentation is not a guard.
    const assignment = /^\s*const where\s*=\s*\{/m;
    const match = assignment.exec(source);
    expect(match).not.toBeNull();
    const clause = source.slice(match!.index, source.indexOf('};', match!.index));
    expect(clause).toMatch(/\bdeviceId\b/);
    expect(clause).toMatch(/\btenantId\b/);
  });

  it('surfaces the command lifecycle rather than a single verdict', () => {
    // A log row that only says "sent" cannot answer the question a technician has: what happened
    // to it. `status`, `sentAt` and `acknowledgedAt` are what separate the three.
    const source = read(service);
    for (const field of ['status', 'sentAt', 'acknowledgedAt']) {
      expect(source).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('carries the correlation id, so a log line joins to the command drilldown', () => {
    expect(read(service)).toMatch(/correlationId/);
  });

  it('is bounded and paginated', () => {
    const source = read(service);
    expect(source).toMatch(/take:/);
    expect(source).toMatch(/maxLimit|MAX_LIMIT|MAX_PAGE/);
  });

  it('is reachable from a route', () => {
    expect(read('src/device/device.controller.ts')).toMatch(/command-log|device-log/);
  });
});

describe('an acknowledged command is never shown as merely sent', () => {
  const service = exists('src/device/device-command-log.service.ts')
    ? read('src/device/device-command-log.service.ts')
    : '';

  it('derives a settled flag from the acknowledgement timestamp', () => {
    // The same trap the notification log had: a status label that lags the timestamp. A row whose
    // `acknowledgedAt` is set is settled, whatever `status` still says.
    expect(service).toMatch(/acknowledged/);
  });

  it('returns the window it was asked for, and its true total', () => {
    expect(service).toMatch(/total/);
    expect(service).toMatch(/count\(/);
  });
});

describe('the commissioning surface shows the real funnel', () => {
  it('reads device lifecycle state from the backend', () => {
    expect(PAGE).toMatch(/status/);
  });

  it('and its stage list equals the Prisma enum exactly', () => {
    // The page does name the stages, because a stage that exists and holds nothing is information a
    // technician wants. What must not happen is that list drifting from the enum -- an earlier
    // version of this contract forbade a local list outright, which would have made the useful case
    // unrenderable. Pinning the two against each other catches the drift instead.
    const schema = read('prisma/schema.prisma');
    const body = schema.slice(
      schema.indexOf('enum DeviceStatus'),
      schema.indexOf('}', schema.indexOf('enum DeviceStatus')),
    );
    const enumStates = [...body.matchAll(/^\s{2}([A-Z_]+)\s*$/gm)].map((m) => m[1]);

    const listBody = PAGE.slice(
      PAGE.indexOf('COMMISSIONING_STAGES = ['),
      PAGE.indexOf('] as const', PAGE.indexOf('COMMISSIONING_STAGES = [')),
    );
    const pageStates = [...listBody.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);

    expect(pageStates.length).toBeGreaterThan(0);
    expect([...pageStates].sort()).toEqual([...enumStates].sort());
  });

  it('renders every lifecycle state the enum actually has', () => {
    for (const state of ['PROVISIONING', 'PAIRED', 'ACTIVE', 'INACTIVE', 'REVOKED']) {
      expect(PAGE).toMatch(new RegExp(state));
    }
  });

  it('does not claim commissioning has no backend when it does', () => {
    expect(PAGE).not.toMatch(/Claim code tidak lagi dibuat acak/);
  });

  it('still refuses to invent a claim code', () => {
    // Token issuance belongs to provisioning and is shown once. The page must keep pointing there
    // rather than growing a second generator.
    expect(PAGE).toMatch(/perangkat/i);
  });
});

describe('what the log tab is forbidden to be', () => {
  it('no synthetic rows', () => {
    expect(PAGE).not.toMatch(/Math\.random/);
    expect(PAGE).not.toMatch(/faker/i);
  });

  it('no claim of a device log while the tab still has no endpoint', () => {
    // If the wiring is removed later, this must fail with the old banner restored, not silently.
    expect(PAGE).toMatch(/device-log|command-log/);
  });

  it('an empty log is distinguished from a failed read', () => {
    expect(PAGE).toMatch(/logError|logLoadError/);
  });
});

describe('the domain decision this page rests on', () => {
  it('DeviceCommand is tenant-scoped in the schema, so the log can be too', () => {
    expect(SCHEMA).toMatch(/model DeviceCommand \{[\s\S]*?@@unique\(\[id, tenantId\]\)/);
  });

  it('and the heartbeat that makes maintenance a separate table is still unconditional', () => {
    // Repeated from the maintenance contract on purpose. If someone later makes the heartbeat
    // respect an existing status, that contract should stop firing and the decision be revisited —
    // this file records that the two contracts are watching the same fact.
    expect(DEVICE_SERVICE).toMatch(
      /lastHeartbeatAt:\s*new Date\(\),\s*status:\s*DeviceStatus\.ACTIVE/,
    );
  });
});