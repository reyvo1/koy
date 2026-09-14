import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AnalyticsIngestionService } from '../analytics/analytics-ingestion.service';
import { AdminOperationalSummaryService } from './admin-operational-summary.service';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminRoleGuard } from './admin-role.guard';

describe('AdminOperationsController', () => {
  const analytics = {
    listRecent: jest.fn().mockResolvedValue([]),
  } as unknown as AnalyticsIngestionService;
  const adminContext = {
    user: {
      userId: 'user-1',
      tenantContext: {
        tenantId: 'tenant-1',
        membershipId: 'membership-1',
        role: 'ADMIN',
      },
    },
  };

  it('uses trusted tenant context and returns the service summary', async () => {
    const summary = {
      summarize: jest.fn().mockResolvedValue({ generatedAt: 'now' }),
    };
    const controller = new AdminOperationsController(
      summary as unknown as AdminOperationalSummaryService,
      analytics,
    );

    const result = await controller.getOperationalSummary(adminContext);

    expect(summary.summarize).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ generatedAt: 'now' });
  });

  it('lists recent analytics findings bounded to the trusted tenant', async () => {
    const listRecent = jest.fn().mockResolvedValue([{ id: 'finding-1' }]);
    const controller = new AdminOperationsController(
      {} as unknown as AdminOperationalSummaryService,
      { listRecent } as unknown as AnalyticsIngestionService,
    );

    const result = await controller.getAnalyticsFindings(
      adminContext,
      undefined,
    );

    expect(listRecent).toHaveBeenCalledWith('tenant-1', 50);
    expect(result).toEqual([{ id: 'finding-1' }]);
  });

  it('clamps the findings query limit into the service-bounded range', async () => {
    const listRecent = jest.fn().mockResolvedValue([]);
    const controller = new AdminOperationsController(
      {} as unknown as AdminOperationalSummaryService,
      { listRecent } as unknown as AnalyticsIngestionService,
    );

    await controller.getAnalyticsFindings(adminContext, '500');
    expect(listRecent).toHaveBeenLastCalledWith('tenant-1', 100);

    await controller.getAnalyticsFindings(adminContext, '-5');
    expect(listRecent).toHaveBeenLastCalledWith('tenant-1', 50);

    await controller.getAnalyticsFindings(adminContext, 'not-a-number');
    expect(listRecent).toHaveBeenLastCalledWith('tenant-1', 50);
  });

  it('preserves authentication, tenant context, then ADMIN guard order', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOperationsController),
    ).toEqual([JwtAuthGuard, TenantContextGuard, AdminRoleGuard]);
  });
});
