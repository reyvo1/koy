import { ShareGrantPermission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceAccessService } from './device-access.service';

describe('DeviceAccessService', () => {
  const prisma = {
    device: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
  } as unknown as PrismaService;
  const service = new DeviceAccessService(prisma);

  afterEach(() => jest.resetAllMocks());

  it('keeps platform/admin access tenant-scoped while granting VIEW+CONTROL', async () => {
    (prisma.device.findMany as jest.Mock).mockResolvedValue([{ id: 'd1' }]);

    const decisions = await service.resolveMany(
      {
        tenantId: 't1',
        membershipId: 'm1',
        userId: 'u1',
        role: 'ADMIN',
      },
      ['d1', 'cross-tenant'],
    );

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', id: { in: ['d1', 'cross-tenant'] } },
      select: { id: true },
    });
    expect(decisions.get('d1')).toMatchObject({
      canView: true,
      canControl: true,
      source: 'ADMIN',
    });
    expect(decisions.has('cross-tenant')).toBe(false);
  });

  it('distinguishes owner, CONTROL share, VIEW share, and no grant', async () => {
    const databaseNow = new Date('2026-09-11T00:00:00.000Z');
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ databaseNow }]);
    (prisma.device.findMany as jest.Mock).mockResolvedValue([
      { id: 'owner', ownerId: 'u1', shareGrants: [] },
      {
        id: 'control',
        ownerId: 'u2',
        shareGrants: [{ permission: ShareGrantPermission.CONTROL }],
      },
      {
        id: 'view',
        ownerId: 'u2',
        shareGrants: [{ permission: ShareGrantPermission.VIEW }],
      },
      { id: 'none', ownerId: 'u2', shareGrants: [] },
    ]);

    const decisions = await service.resolveMany(
      {
        tenantId: 't1',
        membershipId: 'm1',
        userId: 'u1',
        role: 'MEMBER',
      },
      ['owner', 'control', 'view', 'none'],
    );

    expect(decisions.get('owner')?.source).toBe('OWNER');
    expect(decisions.get('owner')?.canControl).toBe(true);
    expect(decisions.get('control')?.source).toBe('CONTROL_SHARE');
    expect(decisions.get('control')?.canControl).toBe(true);
    expect(decisions.get('view')?.source).toBe('VIEW_SHARE');
    expect(decisions.get('view')?.canView).toBe(true);
    expect(decisions.get('view')?.canControl).toBe(false);
    expect(decisions.get('none')).toMatchObject({
      canView: false,
      canControl: false,
      source: 'NONE',
    });
  });
});
