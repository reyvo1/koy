import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * The two seeders disagreed about which tenant id is the platform tenant:
 * `prisma/seed.ts` used 22222222…, while `scripts/seed-demo-accounts.mjs` used that same
 * id for the *hotel* and 11111111… for the platform. Running both therefore produced a
 * PLATFORM_ADMIN membership inside a tenant named "Hotel Aurora" — cross-tenant authority
 * living inside a customer tenant, confirmed against the running database before the fix.
 *
 * No id is reserved in `src/`: platform authority is carried by the membership, not by a
 * magic tenant. So nothing in the application would have caught this, and the two files
 * would keep drifting apart silently. The assertions below pin the two seeders together.
 */
const PLATFORM_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const HOTEL_TENANT_ID = '22222222-2222-4222-8222-222222222222';

describe('platform tenant identity is consistent across seeders', () => {
  it('prisma/seed.ts provisions the platform admin into the same tenant the demo seeder uses', () => {
    const seed = read('prisma/seed.ts');

    expect(seed).toContain(`const PLATFORM_TENANT_ID = '${PLATFORM_TENANT_ID}'`);
    // The bug this pins: the hotel id was used for the platform admin.
    expect(seed).not.toContain(`PLATFORM_TENANT_ID = '${HOTEL_TENANT_ID}'`);
  });

  it('the demo seeder still reserves the hotel id for the hotel', () => {
    const demo = read('scripts/seed-demo-accounts.mjs');

    expect(demo).toContain(`const platformTenantId = '${PLATFORM_TENANT_ID}'`);
    expect(demo).toContain(`const hotelTenantId = '${HOTEL_TENANT_ID}'`);
  });

  it('the rescue smoke scripts agree on the platform tenant too', () => {
    // These two bootstrap a PLATFORM_ADMIN against whatever DATABASE_URL points at, so a
    // divergent id here is the same defect in a script with no guard at all.
    for (const script of [
      'scripts/run-rescue-live-broker-smoke.mjs',
      'scripts/run-rescue-runtime-flow-extension.mjs',
    ]) {
      const content = read(script);
      const usesHotelAsPlatform = new RegExp(
        `(platformTenantId|tenantId)\\s*=\\s*'${HOTEL_TENANT_ID}'`,
      ).test(content);
      expect({ script, usesHotelAsPlatform }).toEqual({ script, usesHotelAsPlatform: false });
    }
  });
});

describe('platform admin seeding refuses to invent a password', () => {
  it('has no built-in fallback password', () => {
    const seed = read('prisma/seed.ts');

    // A literal here is what makes `prisma db seed` against a production DATABASE_URL
    // mint an account whose password is published in the repository.
    expect(seed).not.toMatch(/PLATFORM_ADMIN_PASSWORD\s*\?\?\s*['"`]/);
    expect(seed).toContain('PLATFORM_ADMIN_PASSWORD is required');
  });

  it('validates the password before writing anything', () => {
    const seed = read('prisma/seed.ts');
    const readCall = seed.indexOf('readPlatformAdminPassword()');
    const firstWrite = seed.indexOf('prisma.tenant.upsert');

    expect(readCall).toBeGreaterThan(-1);
    // Validating after the first upsert would leave a half-created tenant behind on a
    // missing secret, which is the state an operator then has to unpick by hand.
    expect(readCall).toBeLessThan(firstWrite);
  });

  it('no repository file still contains the old default password', () => {
    expect(read('prisma/seed.ts')).not.toContain('SuperAdmin123');
  });
});
