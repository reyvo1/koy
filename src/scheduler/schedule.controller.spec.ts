import { ScheduleController } from './schedule.controller';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleDomainValidator } from './schedule-domain.validator';

const originalFlag = process.env.SCHEDULER_RUNTIME_ENABLED;

describe('ScheduleController runtime activation', () => {
  const request = { user: { tenantContext: { tenantId: 'tenant-1' } } };
  let update: jest.Mock;
  let controller: ScheduleController;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({ id: 'schedule-1', enabled: true });
    const prisma = {
      schedule: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'schedule-1',
          tenantId: 'tenant-1',
          kind: 'CRON',
          countdownSeconds: null,
        }),
        update,
      },
    };
    controller = new ScheduleController(
      prisma as unknown as PrismaService,
      {} as ScheduleDomainValidator,
    );
  });

  afterAll(() => {
    if (originalFlag === undefined) delete process.env.SCHEDULER_RUNTIME_ENABLED;
    else process.env.SCHEDULER_RUNTIME_ENABLED = originalFlag;
  });

  it('fails closed when enabling while runtime is disabled', async () => {
    process.env.SCHEDULER_RUNTIME_ENABLED = 'false';

    await expect(
      controller.setEnabled(request, 'schedule-1', { enabled: true }),
    ).rejects.toMatchObject({ status: 503 });
    expect(update).not.toHaveBeenCalled();
  });

  it('allows disabling even while runtime is disabled', async () => {
    process.env.SCHEDULER_RUNTIME_ENABLED = 'false';

    await expect(
      controller.setEnabled(request, 'schedule-1', { enabled: false }),
    ).resolves.toBeDefined();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enabled: false }) }),
    );
  });

  it('allows explicit enable only when runtime flag is true', async () => {
    process.env.SCHEDULER_RUNTIME_ENABLED = 'true';

    await controller.setEnabled(request, 'schedule-1', { enabled: true });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ enabled: true }) }),
    );
  });

  it('rejects non-boolean activation input', async () => {
    process.env.SCHEDULER_RUNTIME_ENABLED = 'true';

    await expect(
      controller.setEnabled(request, 'schedule-1', { enabled: 'true' as never }),
    ).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });
});
