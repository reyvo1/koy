import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CommandTimeoutScheduler } from './command-timeout.scheduler';
import { MetricsService } from '../metrics/metrics.service';
import { CommandService } from './command.service';

describe('CommandTimeoutScheduler', () => {
  let scheduler: CommandTimeoutScheduler;
  let commandService: {
    markTimedOut: jest.Mock;
    countStalePending: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let metrics: { recordCommandLifecycle: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommandTimeoutScheduler,
        {
          provide: CommandService,
          useValue: {
            markTimedOut: jest.fn().mockResolvedValue({ count: 0 }),
            countStalePending: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: MetricsService,
          useValue: { recordCommandLifecycle: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(300000),
          },
        },
      ],
    }).compile();

    scheduler = module.get<CommandTimeoutScheduler>(CommandTimeoutScheduler);
    commandService = module.get(CommandService);
    configService = module.get(ConfigService);
    metrics = module.get(MetricsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calculates the timeout threshold from the configured duration', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-14T12:05:00Z').getTime());

    await scheduler.markTimedOutCommands();

    expect(commandService.markTimedOut).toHaveBeenCalledWith(
      new Date('2026-07-14T12:00:00Z'),
    );
  });

  it('delegates to CommandService with the configured timeout threshold', async () => {
    configService.get.mockReturnValue(60000);

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-14T12:05:00Z').getTime());

    await scheduler.markTimedOutCommands();

    expect(configService.get).toHaveBeenCalledWith(
      'COMMAND_ACK_TIMEOUT_MS',
      300000,
    );

    expect(commandService.markTimedOut).toHaveBeenCalledWith(
      new Date('2026-07-14T12:04:00Z'),
    );
  });

  it('logs a structured warning when stale PENDING commands exist', async () => {
    commandService.countStalePending.mockResolvedValue(5);
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-14T12:05:00Z').getTime());

    const loggerWarn = jest
      .spyOn((scheduler as any).logger, 'warn')
      .mockImplementation();

    await scheduler.markTimedOutCommands();

    expect(metrics.recordCommandLifecycle).toHaveBeenCalledWith(
      'stale_pending',
      5,
    );
    expect(loggerWarn).toHaveBeenCalledWith({
      event: 'command.pending.stale.detected',
      outcome: 'detected',
      staleCount: 5,
      timeoutMs: 300000,
      threshold: '2026-07-14T12:00:00.000Z',
    });
  });

  it('logs a structured event for timed out commands', async () => {
    commandService.markTimedOut.mockResolvedValue({ count: 3 });
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-14T12:05:00Z').getTime());

    const loggerLog = jest
      .spyOn((scheduler as any).logger, 'log')
      .mockImplementation();

    await scheduler.markTimedOutCommands();

    expect(loggerLog).toHaveBeenCalledWith({
      event: 'command.timeout.applied',
      outcome: 'succeeded',
      timedOutCount: 3,
      timeoutMs: 300000,
      threshold: '2026-07-14T12:00:00.000Z',
    });
  });

  it('does not log warning when no stale PENDING commands exist', async () => {
    commandService.countStalePending.mockResolvedValue(0);

    const loggerWarn = jest
      .spyOn((scheduler as any).logger, 'warn')
      .mockImplementation();

    await scheduler.markTimedOutCommands();

    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it('logs and contains command timeout failures', async () => {
    const error = new Error('database unavailable');
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-14T12:05:00Z').getTime());

    const loggerError = jest
      .spyOn((scheduler as any).logger, 'error')
      .mockImplementation();

    commandService.markTimedOut.mockRejectedValue(error);

    await expect(scheduler.markTimedOutCommands()).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith({
      event: 'command.timeout.scan.failed',
      outcome: 'failed',
      timeoutMs: 300000,
      threshold: '2026-07-14T12:00:00.000Z',
      error: {
        type: 'Error',
        message: 'database unavailable',
        stack: error.stack,
      },
    });
  });
});
