import { ScheduleController } from './schedule.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RbacAuditService } from '../rbac/rbac-audit.service';
import { ScheduleDomainValidator } from './schedule-domain.validator';
import { DomainForbiddenException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { ScenePersistenceError, SCENE_PERSISTENCE_ERROR_CODES } from '../scene/scene.repository';

const originalFlag = process.env.SCHEDULER_RUNTIME_ENABLED;

describe('ScheduleController runtime activation', () => {
  const request = { user: { userId: 'user-1', tenantContext: { tenantId: 'tenant-1', membershipId: 'membership-1', role: 'MEMBER' } } };
  let update: jest.Mock;
  let controller: ScheduleController;
  let recordMutation: jest.Mock;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({ id: 'schedule-1', enabled: true });
    const prisma = {
      schedule: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'schedule-1',
          tenantId: 'tenant-1',
          kind: 'CRON',
          countdownSeconds: null,
          targetSceneId: 'scene-1',
        }),
        update,
      },
    };
    // The audit recorder is stubbed here; target-scene device authorization is also stubbed so these
    // runtime-flag tests remain focused on scheduler activation semantics.
    recordMutation = jest.fn().mockResolvedValue(undefined);
    controller = new ScheduleController(
      prisma as unknown as PrismaService,
      {} as ScheduleDomainValidator,
      { recordMutation } as unknown as RbacAuditService,
      { findTenantScene: jest.fn().mockResolvedValue({ id: 'scene-1', actions: [{ deviceId: 'device-1' }] }) } as never,
      { assertSceneAccess: jest.fn().mockResolvedValue(undefined) } as never,
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


describe('ScheduleController error classification', () => {
  const memberRequest = {
    user: {
      userId: 'user-1',
      tenantContext: {
        tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        membershipId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        role: 'MEMBER',
      },
    },
  };

  function build(options: {
    rows?: Array<{ id: string; targetSceneId: string | null }>;
    findScene?: jest.Mock;
    assertSceneAccess?: jest.Mock;
  } = {}) {
    const rows = options.rows ?? [{ id: 'schedule-1', targetSceneId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }];
    const prisma = {
      schedule: {
        findMany: jest.fn().mockResolvedValue(rows),
        create: jest.fn().mockResolvedValue({ id: 'schedule-new' }),
      },
    };
    const findScene = options.findScene ?? jest.fn().mockResolvedValue({ id: 'scene-1', actions: [] });
    const assertSceneAccess = options.assertSceneAccess ?? jest.fn().mockResolvedValue(undefined);
    const validator = {
      validate: jest.fn(),
      resolveTimezone: jest.fn().mockReturnValue('UTC'),
    };
    const controller = new ScheduleController(
      prisma as unknown as PrismaService,
      validator as unknown as ScheduleDomainValidator,
      { recordMutation: jest.fn() } as unknown as RbacAuditService,
      { findTenantScene: findScene } as never,
      { assertSceneAccess } as never,
    );
    return { controller, prisma, findScene, assertSceneAccess };
  }

  it('hides only expected forbidden schedules for members', async () => {
    const { controller } = build({
      assertSceneAccess: jest.fn().mockRejectedValue(
        new DomainForbiddenException(ERROR_CODES.RbacPermissionDenied, 'forbidden'),
      ),
    });
    await expect(controller.list(memberRequest)).resolves.toEqual([]);
  });

  it('propagates unexpected access/infrastructure errors from list', async () => {
    const { controller } = build({
      assertSceneAccess: jest.fn().mockRejectedValue(new Error('database unavailable')),
    });
    await expect(controller.list(memberRequest)).rejects.toThrow('database unavailable');
  });

  it('maps only a real missing target scene to 404 during create', async () => {
    const { controller } = build({
      findScene: jest.fn().mockRejectedValue(
        new ScenePersistenceError(SCENE_PERSISTENCE_ERROR_CODES.SceneNotFound, 'Scene not found'),
      ),
    });
    await expect(
      controller.create(memberRequest, {
        name: 'Night', kind: 'CRON', expression: '* * * * *', targetSceneId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does not disguise scene repository outages as not-found during create', async () => {
    const { controller } = build({ findScene: jest.fn().mockRejectedValue(new Error('database unavailable')) });
    await expect(
      controller.create(memberRequest, {
        name: 'Night', kind: 'CRON', expression: '* * * * *', targetSceneId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }),
    ).rejects.toThrow('database unavailable');
  });
});
