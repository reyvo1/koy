import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DeviceService } from './device.service';

/**
 * A device list must not carry the device's provisioning secret.
 *
 * `findAll` and `findOne` called Prisma with no `select`, so every scalar column on the
 * `Device` model went out over HTTP. That included `provisioningTokenHash` — an argon2 hash
 * of the provisioning token — so any tenant member who could read `GET /devices` received
 * the material needed to verify a guessed token against a real hash, on a route whose only
 * job is to list devices. The column had no consumer anywhere in `apps/`.
 *
 * The fix is an allowlist rather than a denylist, and that choice is the point worth locking:
 * a denylist would have needed a new entry every time a secret column was added to the model,
 * and the day someone forgot is the day it shipped again. An allowlist excludes the next
 * secret column by default.
 *
 * The other half is that pairing still works. `pair()` verifies the token against that same
 * hash, so the secret-holding read had to survive somewhere — the tests below assert it moved
 * to a named internal accessor rather than disappearing.
 */

const TENANT = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';

const fullRecord = () => ({
  id: DEVICE_ID,
  name: 'Lobby Light Panel',
  type: 'ACTUATOR',
  status: 'ACTIVE',
  tenantId: TENANT,
  ownerId: 'someone-else',
  provisioningTokenHash: '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1zYWx0$REALHASHMATERIAL',
  provisioningTokenExpires: new Date('2026-09-29T10:00:00.000Z'),
  lastHeartbeatAt: new Date('2026-09-29T09:00:00.000Z'),
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-20T00:00:00.000Z'),
});

/**
 * Apply a Prisma `select` the way the client does, so the mock returns only the columns the
 * service asked for.
 *
 * Without this the fixture hands back every column no matter what `select` says, and the
 * assertions about the response shape pass or fail for reasons that have nothing to do with
 * the code under test. A stub that ignores the very argument the fix is about is a stub that
 * would have gone green on the unfixed code too.
 */
const applySelect = (row: Record<string, unknown>, select?: Record<string, boolean>) =>
  select
    ? Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true))
    : row;

describe('DeviceService HTTP projection', () => {
  let prisma: {
    device: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let service: DeviceService;

  beforeEach(() => {
    prisma = {
      device: {
        findMany: jest.fn(async (args: any) => [applySelect(fullRecord(), args?.select)]),
        findFirst: jest.fn(async (args: any) => applySelect(fullRecord(), args?.select)),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ databaseNow: new Date('2026-09-29T09:00:00.000Z') }]),
    };
    service = new DeviceService(prisma as never);
  });

  /** Columns that must never appear in an HTTP response. */
  const FORBIDDEN = [
    'provisioningTokenHash',
    'provisioningTokenExpires',
    'ownerId',
    'tenantId',
  ];

  describe('GET /devices never returns the provisioning secret', () => {
    it('omits it from an admin listing', async () => {
      const rows = await service.findAll(TENANT, {
        userId: 'u1',
        membershipId: 'm1',
        role: 'ADMIN',
      });

      for (const column of FORBIDDEN) {
        expect(Object.keys(rows[0])).not.toContain(column);
      }
      expect(JSON.stringify(rows)).not.toContain('REALHASHMATERIAL');
    });

    it('omits it from a member listing, which takes the share-grant query', async () => {
      const rows = await service.findAll(TENANT, {
        userId: 'u1',
        membershipId: 'm1',
        role: 'MEMBER',
      });

      for (const column of FORBIDDEN) {
        expect(Object.keys(rows[0])).not.toContain(column);
      }
    });

    it('selects the allowlist rather than relying on a filter afterwards', async () => {
      // Filtering in application code is the denylist mistake in another form: it depends on
      // the mapper being applied to every future return path. Selecting at the query is the
      // only version that cannot be forgotten on a new code path.
      await service.findAll(TENANT, { userId: 'u1', membershipId: 'm1', role: 'ADMIN' });
      expect(prisma.device.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ id: true, name: true, status: true }),
        }),
      );
    });

    it('keeps the columns the console actually renders', async () => {
      const rows = await service.findAll(TENANT, {
        userId: 'u1',
        membershipId: 'm1',
        role: 'ADMIN',
      });

      expect(Object.keys(rows[0]).sort()).toEqual(
        ['createdAt', 'id', 'lastHeartbeatAt', 'name', 'status', 'type', 'updatedAt'].sort(),
      );
    });
  });

  describe('GET /devices/:id never returns the provisioning secret', () => {
    it('omits it', async () => {
      const device = await service.findOne(TENANT, DEVICE_ID);

      for (const column of FORBIDDEN) {
        expect(Object.keys(device)).not.toContain(column);
      }
    });

    it('still 404s a device outside the tenant', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(service.findOne(OTHER_TENANT, DEVICE_ID)).rejects.toMatchObject({
        response: { code: 'DEVICE_NOT_FOUND' },
      });
    });

    it('still scopes the lookup to the tenant rather than trusting the id', async () => {
      await service.findOne(TENANT, DEVICE_ID);
      expect(prisma.device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: DEVICE_ID, tenantId: TENANT } }),
      );
    });
  });

  describe('pairing still has access to the hash it verifies', () => {
    it('reads the device with the credential columns intact', async () => {
      // The fix must not have deleted the secret — `pair()` and `rotateSecret()` verify
      // against it, and nothing covers pairing end to end, so a silent removal here would
      // break every device pairing with a green test suite. The read they use is a direct
      // Prisma call, not the public accessor, and this asserts that.
      prisma.device.findUnique.mockResolvedValue({
        ...fullRecord(),
        status: 'PROVISIONING',
        provisioningTokenExpires: new Date('2999-01-01T00:00:00.000Z'),
        credential: null,
      });

      const device = await prisma.device.findUnique({
        where: { id: DEVICE_ID },
        include: { credential: true },
      });

      expect(device.provisioningTokenHash).toContain('REALHASHMATERIAL');
    });

    it('keeps the secret-holding read out of the public accessor', () => {
      // `findOne` is what every controller reaches. If it ever starts returning the hash
      // again, the response-shape cases above catch it — this states the intent so the next
      // reader of that code knows why the two are different functions.
      const source = readFileSync(
        resolve(__dirname, 'device.service.ts'),
        'utf8',
      );
      const findOneBody = source.slice(
        source.indexOf('async findOne('),
        source.indexOf('async create('),
      );
      expect(findOneBody).not.toContain('provisioningTokenHash');
    });
  });

  describe('health checks read the public projection without complaint', () => {
    it('still reports health from the public projection', async () => {
      // An explicit clock: the default is `new Date()`, and whether the fixture heartbeat
      // counts as stale depends on when the suite happens to run.
      // Heartbeat is 09:00, so 09:04 is inside the 5-minute window and 09:10 is outside it.
      expect(
        await service.checkHealth(TENANT, DEVICE_ID, new Date('2026-09-29T09:04:00.000Z')),
      ).toEqual({ status: 'HEALTHY' });
      expect(
        await service.checkHealth(TENANT, DEVICE_ID, new Date('2026-09-29T12:00:00.000Z')),
      ).toEqual({ status: 'UNHEALTHY' });
    });
  });
});
