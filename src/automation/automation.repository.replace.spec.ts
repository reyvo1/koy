import { AutomationRepository } from './automation.repository';
import { AutomationPersistenceError } from './automation.persistence.error';

/**
 * The replace path had no test at all, which is why a defect survived here: a proxy that
 * omitted `content-type` left the backend's `@Body()` empty, and every save failed with a
 * 500 that no unit test could have surfaced (the fault was in the BFF layer). These tests
 * pin the repository behaviour the BFF depends on: a valid definition with the current
 * revision must be accepted and must bump the revision.
 */
describe('AutomationRepository.replaceOwnedAutomation', () => {
  const TENANT = '11111111-1111-4111-8111-111111111111';
  const MEMBERSHIP = '22222222-2222-4222-8222-222222222222';
  const AUTOMATION = '33333333-3333-4333-8333-333333333333';
  const SENSOR = '44444444-4444-4444-8444-444444444444';
  const ACTUATOR = '55555555-5555-4555-8555-555555555555';
  const SENSOR_CAP = '66666666-6666-4666-8666-666666666666';
  const ACTUATOR_CAP = '77777777-7777-4777-8777-777777777777';

  const definition = {
    schemaVersion: '1.0.0',
    name: 'Lampu lobby',
    trigger: {
      kind: 'CAPABILITY_REPORTED',
      deviceId: SENSOR,
      capabilityKey: 'temperature',
    },
    condition: { kind: 'ALWAYS' },
    actions: [
      {
        actionId: 'act-1',
        kind: 'DEVICE_COMMAND',
        deviceId: ACTUATOR,
        capabilityKey: 'lightPower',
        value: true,
      },
    ],
  };

  function build() {
    const prisma = {
      $transaction: jest.fn(),
      membership: { findFirst: jest.fn() },
    };
    const tx = {
      membership: {
        // assertActiveMembership uses findUnique on the compound id_tenantId key.
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: MEMBERSHIP, status: 'ACTIVE' }),
      },
      automation: {
        // First call is the existence check (select: { id: true }); the later call is
        // loadAggregate, which needs the full record including its actions array.
        findFirst: jest.fn().mockImplementation(({ select }: { select?: unknown }) =>
          Promise.resolve(
            select
              ? { id: AUTOMATION }
              : {
                  id: AUTOMATION,
                  tenantId: TENANT,
                  ownerMembershipId: MEMBERSHIP,
                  name: 'Lampu lobby',
                  schemaVersion: '1.0.0',
                  enabled: false,
                  revision: 2,
                  triggerKind: 'CAPABILITY_REPORTED',
                  triggerDeviceId: SENSOR,
                  triggerCapabilityId: SENSOR_CAP,
                  condition: { kind: 'ALWAYS' },
                  cooldownSeconds: 0,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  actions: [
                    {
                      actionId: 'act-1',
                      kind: 'DEVICE_COMMAND',
                      deviceId: ACTUATOR,
                      capabilityId: ACTUATOR_CAP,
                      value: true,
                    },
                  ],
                },
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // resolveTargets reads devices and capabilities with findMany on the id/OR sets,
      // not per-device finders.
      device: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              (where.id.in as string[]).map((id) => ({ id })),
            ),
          ),
      },
      capability: {
        findMany: jest.fn().mockImplementation(({ where }) => {
          const refs = (where.OR as Array<{
            deviceId: string;
            key: string;
          }>);
          return Promise.resolve(
            refs.map((ref) =>
              ref.deviceId === SENSOR
                ? {
                    id: SENSOR_CAP,
                    key: 'temperature',
                    deviceId: SENSOR,
                    isWritable: false,
                    isReadable: true,
                    isReportable: true,
                    dataType: 'number',
                  }
                : {
                    id: ACTUATOR_CAP,
                    key: 'lightPower',
                    deviceId: ACTUATOR,
                    isWritable: true,
                    isReadable: true,
                    isReportable: true,
                    dataType: 'boolean',
                  },
            ),
          );
        }),
      },
      automationAction: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          {
            actionId: 'act-1',
            kind: 'DEVICE_COMMAND',
            deviceId: ACTUATOR,
            capabilityId: ACTUATOR_CAP,
            value: true,
          },
        ]),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) =>
      fn(tx),
    );
    const repo = new AutomationRepository(prisma as never);
    return { repo, tx };
  }

  it('accepts a valid definition at the current revision and bumps it', async () => {
    const { repo, tx } = build();
    const result = await repo.replaceOwnedAutomation({
      tenantId: TENANT,
      ownerMembershipId: MEMBERSHIP,
      automationId: AUTOMATION,
      expectedRevision: 1,
      definition: definition as never,
    });

    expect(tx.automation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revision: 1 }),
        data: expect.objectContaining({ revision: { increment: 1 } }),
      }),
    );
    expect(tx.automationAction.createMany).toHaveBeenCalled();
    expect(result.revision).toBe(2);
  });

  it('rejects a stale revision instead of silently overwriting a concurrent edit', async () => {
    const { repo, tx } = build();
    tx.automation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repo.replaceOwnedAutomation({
        tenantId: TENANT,
        ownerMembershipId: MEMBERSHIP,
        automationId: AUTOMATION,
        expectedRevision: 1,
        definition: definition as never,
      }),
    ).rejects.toBeInstanceOf(AutomationPersistenceError);
  });

  it('rejects a non-integer expectedRevision', async () => {
    const { repo } = build();
    await expect(
      repo.replaceOwnedAutomation({
        tenantId: TENANT,
        ownerMembershipId: MEMBERSHIP,
        automationId: AUTOMATION,
        expectedRevision: Number.NaN,
        definition: definition as never,
      }),
    ).rejects.toBeInstanceOf(AutomationPersistenceError);
  });

  it('rejects an action that targets its own trigger source', async () => {
    const { repo } = build();
    await expect(
      repo.replaceOwnedAutomation({
        tenantId: TENANT,
        ownerMembershipId: MEMBERSHIP,
        automationId: AUTOMATION,
        expectedRevision: 1,
        definition: {
          ...definition,
          actions: [
            {
              actionId: 'act-1',
              kind: 'DEVICE_COMMAND',
              deviceId: SENSOR,
              capabilityKey: 'temperature',
              value: 30,
            },
          ],
        } as never,
      }),
    ).rejects.toBeInstanceOf(AutomationPersistenceError);
  });
});
