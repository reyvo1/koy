import { MaintenancePlanService } from './maintenance-plan.service';
describe('maintenance recurrence authority and atomic claim', () => {
  let service: MaintenancePlanService, prisma: any, audit: any, tx: any;
  const old = process.env.MAINTENANCE_SCHEDULER_ENABLED;
  const now = new Date('2026-10-07T00:00:00Z');
  const plan = {
    id: 'p1',
    tenantId: 't1',
    deviceId: 'd1',
    actorMembershipId: 'm1',
    enabled: true,
    reason: 'inspect',
    nextDueAt: new Date('2026-10-06T00:00:00Z'),
    intervalHours: 24,
  };
  beforeEach(() => {
    process.env.MAINTENANCE_SCHEDULER_ENABLED = 'true';
    tx = {
      membership: { findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }) },
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'd1' }) },
      maintenancePlan: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      deviceMaintenance: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'w1' }),
      },
    };
    prisma = {
      maintenancePlan: {
        findMany: jest.fn().mockResolvedValue([plan]),
        create: jest.fn().mockResolvedValue(plan),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      device: tx.device,
      $transaction: jest.fn((fn) => fn(tx)),
    };
    audit = { recordMutation: jest.fn().mockResolvedValue(undefined) };
    service = new MaintenancePlanService(prisma, audit);
  });
  afterEach(() => {
    if (old === undefined) delete process.env.MAINTENANCE_SCHEDULER_ENABLED;
    else process.env.MAINTENANCE_SCHEDULER_ENABLED = old;
  });
  it('does not silently create schedules while the worker is disabled', async () => {
    delete process.env.MAINTENANCE_SCHEDULER_ENABLED;
    expect(await service.tick(now)).toEqual({
      opened: 0,
      skipped: 0,
      disabled: true,
    });
    await expect(service.create({} as any, {})).rejects.toThrow('belum aktif');
    expect(prisma.maintenancePlan.create).not.toHaveBeenCalled();
  });
  it('opens a due window only after active admin and device revalidation', async () => {
    expect(await service.tick(now)).toMatchObject({ opened: 1, failed: 0 });
    expect(tx.membership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'm1',
          tenantId: 't1',
          status: 'ACTIVE',
          role: { in: ['ADMIN', 'PLATFORM_ADMIN'] },
        },
      }),
    );
    expect(tx.maintenancePlan.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        tenantId: 't1',
        enabled: true,
        nextDueAt: plan.nextDueAt,
        actorMembershipId: 'm1',
      },
      data: { nextDueAt: new Date('2026-10-08T00:00:00Z') },
    });
    expect(tx.deviceMaintenance.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        deviceId: 'd1',
        reason: 'inspect',
        openedByUserId: 'u1',
        planId: 'p1',
        scheduledFor: plan.nextDueAt,
      },
    });
  });
  it.each(['membership', 'device'])(
    'disables plan whose %s authority disappeared',
    async (missing) => {
      tx[missing].findFirst.mockResolvedValue(null);
      expect(await service.tick(now)).toMatchObject({ opened: 0, skipped: 1 });
      expect(tx.maintenancePlan.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', tenantId: 't1' },
        data: { enabled: false },
      });
      expect(tx.deviceMaintenance.create).not.toHaveBeenCalled();
    },
  );
  it('cannot execute a claim lost to another worker or operator disable', async () => {
    tx.maintenancePlan.updateMany.mockResolvedValue({ count: 0 });
    await service.tick(now);
    expect(tx.deviceMaintenance.create).not.toHaveBeenCalled();
    expect(audit.recordMutation).not.toHaveBeenCalled();
  });
  it('advances due time without adding an overlapping open window', async () => {
    tx.deviceMaintenance.findFirst.mockResolvedValue({ id: 'existing' });
    await service.tick(now);
    expect(tx.maintenancePlan.updateMany).toHaveBeenCalled();
    expect(tx.deviceMaintenance.create).not.toHaveBeenCalled();
  });
  it('isolates failed plans so later due work is processed', async () => {
    prisma.maintenancePlan.findMany.mockResolvedValue([
      plan,
      { ...plan, id: 'p2' },
    ]);
    prisma.$transaction.mockRejectedValueOnce(new Error('unavailable'));
    expect(await service.tick(now)).toMatchObject({ opened: 1, failed: 1 });
  });
  it('refuses forged tenant and fractional recurrence', async () => {
    const req = {
      user: { tenantContext: { tenantId: 't1', membershipId: 'm1' } },
    } as any;
    const body = {
      tenantId: 'foreign',
      deviceId: 'd1',
      reason: 'inspect',
      intervalHours: 24,
      nextDueAt: now.toISOString(),
    };
    await expect(service.create(req, body)).rejects.toThrow('tidak valid');
    await expect(
      service.create(req, { ...body, tenantId: undefined, intervalHours: 0.5 }),
    ).rejects.toThrow('tidak valid');
    expect(prisma.maintenancePlan.create).not.toHaveBeenCalled();
  });
  it('mutates only a tenant-owned plan', async () => {
    prisma.maintenancePlan.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.setEnabled(
        {
          user: { tenantContext: { tenantId: 't1', membershipId: 'm1' } },
        } as any,
        'foreign',
        false,
      ),
    ).rejects.toThrow('tidak ditemukan');
    expect(audit.recordMutation).not.toHaveBeenCalled();
  });
});
