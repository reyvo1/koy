import { readFileSync } from 'node:fs';

/**
 * Wave 9 step 1: device location becomes a domain.
 *
 * ## What was actually there
 *
 * ADR-004 declared `DeviceLocation` — `deviceId` unique, latitude, longitude, label — and then
 * nothing used it. Zero readers and zero writers across `src/`. No route, no map. The table was
 * dead weight that looked like a feature, which is the most expensive kind of placeholder: it tells
 * a reader the domain exists.
 *
 * ## The isolation hole, which is why this is step one
 *
 * The model has **no `tenantId`**. Its only key is `deviceId`. Every other tenant-owned table in this
 * schema carries `tenantId` plus `@@unique([id, tenantId])`, because a shared device id is the thing
 * multi-tenancy has to defend against. This one did not, so any read path built on it would answer
 * "where is this device?" for a tenant that does not own it. Adding a location *history* on top of
 * that would have multiplied the hole: a route listing history by device id would leak every place
 * that device has ever been.
 *
 * ## Why history and not just a latest position
 *
 * `deviceId @unique` meant one row per device — the last known position, overwritten on every fix.
 * That answers "where is it now" and nothing else. A NOC asking "where was this device when it went
 * offline" gets a confident wrong answer from the current row. ADR-004 predates the NOC; the NOC is
 * now the thing that reads this.
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

const SCHEMA = read('prisma/schema.prisma');
const SERVICE = 'src/device/device-location.service.ts';

const modelBody = (name: string): string => {
  const start = SCHEMA.indexOf(`model ${name} {`);
  return SCHEMA.slice(start, SCHEMA.indexOf('\n}', start));
};

describe('the location table is no longer ownerless', () => {
  it('carries a tenantId', () => {
    expect(modelBody('DeviceLocation')).toMatch(/tenantId\s+String/);
  });

  it('has the tenant-scoped uniqueness every other tenant table has', () => {
    expect(modelBody('DeviceLocation')).toMatch(/@@unique\(\[id, tenantId\]\)/);
  });

  it('is no longer one row per device, because one row cannot answer "where was it"', () => {
    expect(modelBody('DeviceLocation')).not.toMatch(/deviceId\s+String\s+@unique/);
  });

  it('is indexed by tenant, because every read of it starts there', () => {
    expect(modelBody('DeviceLocation')).toMatch(/@@index\(\[tenantId/);
  });

  it('keeps coordinates as floats, which is correct here', () => {
    // Deliberately not pinned to Int: latitude/longitude are genuinely fractional, unlike money.
    // The comment exists so the next person does not "fix" it the way they might fix amountCents.
    expect(modelBody('DeviceLocation')).toMatch(/latitude\s+Float/);
  });

  it('records when the fix arrived, not only when the row was written', () => {
    expect(modelBody('DeviceLocation')).toMatch(/recordedAt/);
  });
});

describe('the service exists and refuses to be a lookup by device id alone', () => {
  it('is a real service', () => {
    expect(exists(SERVICE)).toBe(true);
  });

  it('scopes every read by tenant as well as by device', () => {
    const source = read(SERVICE);
    // Scoped to the history method's own `where`, not to a window after the first
    // `prisma.deviceLocation.` in the file. That window opens on the *create* in recordFix, which
    // legitimately carries tenantId, so it satisfied the assertion whether or not the read query was
    // scoped at all -- which is precisely the mutation this is meant to catch.
    const history = source.slice(source.indexOf('async historyFor'));
    expect(history).toMatch(/const where = \{/);
    const where = history.slice(
      history.indexOf('const where'),
      history.indexOf('};', history.indexOf('const where')),
    );
    expect(where).toMatch(/\btenantId\b/);
    expect(where).toMatch(/\bdeviceId\b/);
  });

  it('resolves the device through a tenant-scoped lookup before writing', () => {
    // Writing a location for a device id the tenant does not own would plant a coordinate in another
    // tenant's history — and with history enabled, plant it permanently.
    const source = read(SERVICE);
    expect(source).toMatch(/device\.findFirst/);
  });

  it('rejects coordinates outside the world rather than storing them', () => {
    const source = read(SERVICE);
    expect(source).toMatch(/latitude/);
    expect(source).toMatch(/-90|90/);
    expect(source).toMatch(/-180|180/);
  });

  it('rejects a non-finite coordinate', () => {
    // NaN passes every naive range comparison and then renders as a broken map pin.
    //
    // Counted, not merely matched. `Number.isFinite` occurs three times in this service, so a
    // `toMatch(/isFinite/)` over the file stayed green when the guard in the validation block was
    // deleted -- the two remaining uses elsewhere in the file satisfied it.
    const source = read(SERVICE);
    const validation = source.slice(
      source.indexOf('async recordFix'),
      source.indexOf('// Provenance before the write'),
    );
    expect(validation).toMatch(/isFinite|isNaN/);
  });

  it('distinguishes "never reported" from "at the origin"', () => {
    // 0,0 is a real coordinate in the Gulf of Guinea. Treating it as "no data" would silently drop a
    // device that is genuinely there.
    const source = read(SERVICE);
    expect(source).toMatch(/never|No location|null/);
  });

  it('returns the latest fix and the history as different things', () => {
    const source = read(SERVICE);
    expect(source).toMatch(/latest/i);
    expect(source).toMatch(/history/i);
  });

  it('bounds the history', () => {
    const source = read(SERVICE);
    expect(source).toMatch(/take:/);
  });
});

describe('location is reachable', () => {
  it('has a route', () => {
    expect(read('src/device/device.controller.ts')).toMatch(/location/i);
  });

  it('and the device module provides it', () => {
    expect(read('src/device/device.module.ts')).toMatch(/DeviceLocationService/);
  });

  it('and it is not satisfied by a table that exists', () => {
    // The table existed for a wave with nothing behind it. A source contract that only checked the
    // schema would have passed on the dead version.
    expect(exists(SERVICE)).toBe(true);
    expect(read(SERVICE)).toMatch(/prisma\.deviceLocation/);
  });
});

describe('a migration exists, because a schema without one is a wish', () => {
  it('is declared in migrations', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const out = execSync('ls prisma/migrations', { cwd: ROOT, encoding: 'utf8' });
    expect(out).toMatch(/location/);
  });
});