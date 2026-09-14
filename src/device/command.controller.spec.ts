import { CommandController } from './command.controller';
import { CommandService } from './command.service';

describe('CommandController', () => {
  let controller: CommandController;
  let commandService: {
    publish: jest.Mock;
    getHistory: jest.Mock;
  };

  beforeEach(() => {
    commandService = {
      publish: jest.fn(),
      getHistory: jest.fn(),
    };
    controller = new CommandController(commandService as unknown as CommandService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes command using tenant context and device id', async () => {
    const req = {
      user: {
        tenantContext: {
          tenantId: 't1',
        },
      },
    };

    const body = {
      payload: {
        cmd: 'reset',
      },
      idempotencyKey: 'key1',
    };

    commandService.publish.mockResolvedValue({
      id: 'c1',
      status: 'SENT',
    });

    const result = await controller.publish(req, 'd1', body);

    expect(commandService.publish).toHaveBeenCalledWith(
      't1',
      'd1',
      {
        cmd: 'reset',
      },
      'key1',
    );

    expect(result).toEqual({
      id: 'c1',
      status: 'SENT',
    });
  });

  it('publishes command without idempotency key', async () => {
    const req = {
      user: {
        tenantContext: {
          tenantId: 't1',
        },
      },
    };

    const body = {
      payload: {
        cmd: 'reset',
      },
    };

    commandService.publish.mockResolvedValue({
      id: 'c1',
    });

    await controller.publish(req, 'd1', body);

    expect(commandService.publish).toHaveBeenCalledWith(
      't1',
      'd1',
      {
        cmd: 'reset',
      },
      undefined,
    );
  });

  it('gets command history using tenant context and pagination', async () => {
    const req = {
      user: {
        tenantContext: {
          tenantId: 't1',
        },
      },
    };

    commandService.getHistory.mockResolvedValue([]);

    const result = await controller.getHistory(
      req,
      'd1',
      '20',
      '10',
    );

    expect(commandService.getHistory).toHaveBeenCalledWith(
      't1',
      'd1',
      '20',
      '10',
    );

    expect(result).toEqual([]);
  });

  it('gets command history without pagination parameters', async () => {
    const req = {
      user: {
        tenantContext: {
          tenantId: 't1',
        },
      },
    };

    commandService.getHistory.mockResolvedValue([]);

    await controller.getHistory(req, 'd1');

    expect(commandService.getHistory).toHaveBeenCalledWith(
      't1',
      'd1',
      undefined,
      undefined,
    );
  });
});