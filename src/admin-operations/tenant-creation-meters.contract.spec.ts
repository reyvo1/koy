import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BillingQuotaService } from '../billing/billing-quota.service';
import { AdminDirectoryController } from './admin-directory.controller';

/**
 * A new tenant with no subscription row is unmetered.
 *
 * `checkDeviceQuota` now fails closed, which is only safe if every tenant actually has a
 * subscription. `POST /admin/tenants` created a bare `tenant` row and nothing else, so without
 * this the fix would have turned a silent hole into a tenant that cannot provision a single
 * device. FREE is the right default: it is a seeded plan with a real allowance of 10, and a
 * platform admin creating a tenant gets a working meter rather than a denial.
 */
describe('POST /admin/tenants — a new tenant is metered from the start', () => {
  let controller: AdminDirectoryController;
  let prisma: Record<string, any>;

  const dto = { name: '  Tenant Baru  ' };

  beforeEach(async () => {
    const transactionClient = {
      tenant: {
        create: jest.fn().mockResolvedValue({
          id: 'tenant-1',
          name: 'Tenant Baru',
          createdAt: new Date(0),
        }),
      },
      billingPlan: { findUnique: jest.fn().mockResolvedValue({ id: 'plan-free' }) },
      billingSubscription: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      ...transactionClient,
      $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminDirectoryController],
      providers: [
        AdminDirectoryController,
        { provide: PrismaService, useValue: prisma },
        BillingQuotaService,
      ],
    }).compile();

    controller = moduleRef.get(AdminDirectoryController);
  });

  it('creates tenant and FREE subscription inside one Prisma transaction', async () => {
    await controller.createTenant(dto);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.billingSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        create: expect.objectContaining({ tenantId: 'tenant-1', planId: 'plan-free' }),
      }),
    );
  });

  it('leaves the tenant name trimmed, as before', async () => {
    const result = await controller.createTenant(dto);

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Tenant Baru' } }),
    );
    expect(result.name).toBe('Tenant Baru');
  });

  it('fails loudly when the FREE plan is missing, rather than returning an unmetered tenant', async () => {
    // A tenant that is created but not metered is the exact hole this closes. If the plan
    // row is absent, the operator must hear about it, not get a success response.
    prisma.billingPlan.findUnique.mockResolvedValue(null);

    await expect(controller.createTenant(dto)).rejects.toMatchObject({
      code: 'BILLING_PLAN_NOT_FOUND',
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.billingSubscription.upsert).not.toHaveBeenCalled();
  });
});
