import { PrismaService } from '../prisma/prisma.service';
import { DeviceShareService } from './device-share.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const guest = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const grantId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const databaseNow = new Date('2026-08-23T01:00:00.000Z');

describe('DeviceShareService', () => {
  let grantCreate: jest.Mock;
  let grantCount: jest.Mock;
  let grantFindFirst: jest.Mock;
  let grantUpdateMany: jest.Mock;
  let deviceFindFirst: jest.Mock;
  let auditCreate: jest.Mock;
  let service: DeviceShareService;

  beforeEach(() => {
    grantCreate = jest.fn().mockResolvedValue({ id: grantId });
    grantCount = jest.fn().mockResolvedValue(0);
    grantFindFirst = jest.fn().mockResolvedValue({ id: grantId });
    grantUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    deviceFindFirst = jest.fn().mockResolvedValue({ id: deviceId });
    auditCreate = jest.fn().mockResolvedValue({});
    service = new DeviceShareService({
      $queryRaw: jest.fn().mockResolvedValue([{ databaseNow }]),
      device: { findFirst: deviceFindFirst },
      deviceShareGrant: {
        create: grantCreate,
        count: grantCount,
        findFirst: grantFindFirst,
        updateMany: grantUpdateMany,
      },
      shareAuditLog: { create: auditCreate },
    } as unknown as PrismaService);
  });

  const validGrant = () => ({
    tenantId,
    deviceId,
    grantedToMembershipId: guest,
    createdByMembershipId: owner,
    permission: 'VIEW' as const,
    expiresAt: new Date(databaseNow.getTime() + 7 * 24 * 3600 * 1000),
  });

  it('creates a bounded grant with audit entry', async () => {
    const result = await service.createGrant(validGrant());
    expect(result.id).toBe(grantId);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'GRANTED' }),
      }),
    );
  });

  it('rejects expiry beyond 90 days', async () => {
    await expect(
      service.createGrant({
        ...validGrant(),
        expiresAt: new Date(databaseNow.getTime() + 91 * 24 * 3600 * 1000),
      }),
    ).rejects.toMatchObject({ code: 'SHARE_EXPIRY_INVALID' });
  });

  it('rejects self-grants', async () => {
    await expect(
      service.createGrant({ ...validGrant(), grantedToMembershipId: owner }),
    ).rejects.toMatchObject({ code: 'SHARE_SELF_GRANT_INVALID' });
  });

  it('enforces the active-grant cap per device', async () => {
    grantCount.mockResolvedValue(20);
    await expect(service.createGrant(validGrant())).rejects.toMatchObject({
      code: 'SHARE_ACTIVE_LIMIT_EXCEEDED',
    });
  });

  it('authorizes VIEW access with a VIEW grant', async () => {
    const ok = await service.hasAccess({
      tenantId, deviceId, membershipId: guest, requiresControl: false,
    });
    expect(ok).toBe(true);
  });

  it('denies CONTROL when the grant is VIEW-only', async () => {
    grantFindFirst.mockResolvedValue(null);
    const ok = await service.hasAccess({
      tenantId, deviceId, membershipId: guest, requiresControl: true,
    });
    expect(ok).toBe(false);
  });

  it('revokes active grants with audit', async () => {
    await service.revokeGrant({
      tenantId, grantId, actorMembershipId: owner,
    });
    expect(grantUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REVOKED' }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REVOKED' }),
      }),
    );
  });

  it('fails loudly revoking an already-inactive grant', async () => {
    grantUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.revokeGrant({ tenantId, grantId, actorMembershipId: owner }),
    ).rejects.toMatchObject({ code: 'SHARE_GRANT_NOT_ACTIVE' });
  });
});
