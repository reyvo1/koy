import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  AUTOMATION_PERSISTENCE_ERROR_CODES,
  AutomationPersistenceError,
} from '../../src/automation/automation.persistence.error';
import { AutomationRepository } from '../../src/automation/automation.repository';
import { AutomationPersistenceInput } from '../../src/automation/automation.persistence.types';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PostgreSQL automation persistence foundation', () => {
  const prisma = new PrismaClient();
  const repository = new AutomationRepository(
    prisma as unknown as PrismaService,
  );

  let tenantId: string;
  let tenantTwoId: string;
  let membershipId: string;
  let membershipTwoId: string;
  let inactiveMembershipId: string;
  let triggerDeviceId: string;
  let actionDeviceId: string;
  let otherTenantDeviceId: string;
  let triggerCapabilityId: string;
  let actionCapabilityId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: `automation-persistence-${randomUUID()}` },
    });
    const tenantTwo = await prisma.tenant.create({
      data: { name: `automation-persistence-${randomUUID()}` },
    });
    tenantId = tenant.id;
    tenantTwoId = tenantTwo.id;

    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId },
    });
    const userTwo = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId: tenantTwoId },
    });
    const inactiveUser = await prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, tenantId },
    });

    membershipId = (
      await prisma.membership.create({
        data: { userId: user.id, tenantId, status: 'ACTIVE' },
      })
    ).id;
    membershipTwoId = (
      await prisma.membership.create({
        data: {
          userId: userTwo.id,
          tenantId: tenantTwoId,
          status: 'ACTIVE',
        },
      })
    ).id;
    inactiveMembershipId = (
      await prisma.membership.create({
        data: { userId: inactiveUser.id, tenantId, status: 'REVOKED' },
      })
    ).id;

    triggerDeviceId = (
      await prisma.device.create({
        data: { name: 'Automation trigger', tenantId, status: 'ACTIVE' },
      })
    ).id;
    actionDeviceId = (
      await prisma.device.create({
        data: { name: 'Automation action', tenantId, status: 'ACTIVE' },
      })
    ).id;
    otherTenantDeviceId = (
      await prisma.device.create({
        data: {
          name: 'Other tenant automation device',
          tenantId: tenantTwoId,
          status: 'ACTIVE',
        },
      })
    ).id;

    triggerCapabilityId = (
      await prisma.capability.create({
        data: {
          deviceId: triggerDeviceId,
          key: 'temperature',
          semanticType: 'temperature',
          dataType: 'number',
          isReadable: true,
          isWritable: false,
          isReportable: true,
        },
      })
    ).id;
    actionCapabilityId = (
      await prisma.capability.create({
        data: {
          deviceId: actionDeviceId,
          key: 'enabled',
          semanticType: 'enabled',
          dataType: 'boolean',
          isReadable: true,
          isWritable: true,
          isReportable: false,
        },
      })
    ).id;
    await prisma.capability.create({
      data: {
        deviceId: actionDeviceId,
        key: 'read_only',
        semanticType: 'status',
        dataType: 'boolean',
        isReadable: true,
        isWritable: false,
        isReportable: true,
      },
    });

    await prisma.capability.create({
      data: {
        deviceId: otherTenantDeviceId,
        key: 'enabled',
        semanticType: 'enabled',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists and atomically replaces an owner-scoped definition with optimistic revision', async () => {
    const created = await repository.createOwnedAutomation(
      automationInput('Initial automation'),
    );

    expect(created).toMatchObject({
      tenantId,
      ownerMembershipId: membershipId,
      name: 'Initial automation',
      enabled: false,
      revision: 1,
      triggerDeviceId,
      triggerCapabilityId,
    });
    expect(created.actions).toHaveLength(1);
    expect(created.actions[0]).toMatchObject({
      actionId: 'set-enabled',
      position: 0,
      deviceId: actionDeviceId,
      capabilityId: actionCapabilityId,
      value: true,
    });

    const replaced = await repository.replaceOwnedAutomation({
      ...automationInput('Updated automation'),
      automationId: created.id,
      expectedRevision: created.revision,
    });
    expect(replaced).toMatchObject({
      id: created.id,
      name: 'Updated automation',
      enabled: false,
      revision: 2,
    });

    await expect(
      repository.replaceOwnedAutomation({
        ...automationInput('Stale automation'),
        automationId: created.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict,
    });
  });

  it('rejects cross-tenant membership and capability targets without leaking records', async () => {
    await expect(
      repository.createOwnedAutomation({
        ...automationInput('Wrong membership'),
        ownerMembershipId: membershipTwoId,
      }),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid,
    });

    const crossTenant = automationInput('Wrong target');
    crossTenant.definition = {
      ...crossTenant.definition,
      actions: [
        {
          ...crossTenant.definition.actions[0],
          deviceId: otherTenantDeviceId,
        },
      ],
    };
    await expect(
      repository.createOwnedAutomation(crossTenant),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid,
    });

    await expect(
      repository.listOwnedAutomations(tenantId, inactiveMembershipId, 50),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.MembershipInvalid,
    });
  });

  it('keeps create-time activation fail-closed and rejects non-writable or type-incompatible actions', async () => {
    await expect(
      repository.createOwnedAutomation({
        ...automationInput('Activation rejected'),
        enabled: true,
      }),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.ActivationNotApproved,
    });

    const readOnly = automationInput('Read only target');
    readOnly.definition = {
      ...readOnly.definition,
      actions: [
        {
          ...readOnly.definition.actions[0],
          capabilityKey: 'read_only',
        },
      ],
    };
    await expect(
      repository.createOwnedAutomation(readOnly),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid,
    });

    const wrongType = automationInput('Wrong type');
    wrongType.definition = {
      ...wrongType.definition,
      actions: [
        {
          ...wrongType.definition.actions[0],
          value: 'true',
        },
      ],
    };
    await expect(
      repository.createOwnedAutomation(wrongType),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.TargetInvalid,
    });
  });

  it('activates and deactivates an owned automation with optimistic revision protection', async () => {
    const created = await repository.createOwnedAutomation(
      automationInput('Explicit activation'),
    );

    const activated = await repository.setOwnedAutomationEnabled({
      tenantId,
      ownerMembershipId: membershipId,
      automationId: created.id,
      expectedRevision: created.revision,
      enabled: true,
    });
    expect(activated).toMatchObject({
      id: created.id,
      enabled: true,
      revision: created.revision + 1,
    });

    await expect(
      repository.setOwnedAutomationEnabled({
        tenantId,
        ownerMembershipId: membershipId,
        automationId: created.id,
        expectedRevision: created.revision,
        enabled: false,
      }),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict,
    });

    const deactivated = await repository.setOwnedAutomationEnabled({
      tenantId,
      ownerMembershipId: membershipId,
      automationId: created.id,
      expectedRevision: activated.revision,
      enabled: false,
    });
    expect(deactivated).toMatchObject({
      id: created.id,
      enabled: false,
      revision: activated.revision + 1,
    });
  });

  it('enforces restrictive external references and cascades automation-owned actions', async () => {
    const created = await repository.createOwnedAutomation(
      automationInput('Constraint automation'),
    );

    await expect(
      prisma.capability.delete({ where: { id: actionCapabilityId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.device.delete({ where: { id: triggerDeviceId } }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await prisma.automation.delete({ where: { id: created.id } });
    await expect(
      prisma.automationAction.count({
        where: { automationId: created.id },
      }),
    ).resolves.toBe(0);
  });

  it('isolates owner reads and deletes with revision protection', async () => {
    const created = await repository.createOwnedAutomation(
      automationInput('Owner automation'),
    );

    await expect(
      repository.findOwnedAutomation(tenantTwoId, membershipTwoId, created.id),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.AutomationNotFound,
    });

    const list = await repository.listOwnedAutomations(
      tenantId,
      membershipId,
      100,
    );
    expect(list.map((item) => item.id)).toContain(created.id);

    await expect(
      repository.deleteOwnedAutomation(
        tenantId,
        membershipId,
        created.id,
        created.revision + 1,
      ),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.RevisionConflict,
    });

    await repository.deleteOwnedAutomation(
      tenantId,
      membershipId,
      created.id,
      created.revision,
    );
    await expect(
      repository.findOwnedAutomation(tenantId, membershipId, created.id),
    ).rejects.toMatchObject<Partial<AutomationPersistenceError>>({
      code: AUTOMATION_PERSISTENCE_ERROR_CODES.AutomationNotFound,
    });
  });

  function automationInput(name: string): AutomationPersistenceInput {
    return {
      tenantId,
      ownerMembershipId: membershipId,
      definition: {
        schemaVersion: '1.0.0',
        name,
        trigger: {
          kind: 'CAPABILITY_REPORTED',
          deviceId: triggerDeviceId,
          capabilityKey: 'temperature',
        },
        condition: {
          kind: 'COMPARE',
          left: { source: 'TRIGGER_VALUE' },
          operator: 'GREATER_THAN',
          right: 30,
        },
        actions: [
          {
            actionId: 'set-enabled',
            kind: 'DEVICE_COMMAND',
            deviceId: actionDeviceId,
            capabilityKey: 'enabled',
            value: true,
          },
        ],
      },
    };
  }
});
