import { randomUUID } from 'node:crypto';
import {
  DashboardAudience,
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardBreakpoint,
  DashboardWidgetKind,
  PrismaClient,
} from '@prisma/client';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from '../../src/dashboard/dashboard.persistence.error';
import { DashboardAggregatePersistenceInput } from '../../src/dashboard/dashboard.persistence.types';
import { DashboardRepository } from '../../src/dashboard/dashboard.repository';
import { DashboardWidgetResolver } from '../../src/dashboard/dashboard-widget.resolver';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PostgreSQL dashboard persistence foundation', () => {
  const prisma = new PrismaClient();
  const repository = new DashboardRepository(
    prisma as unknown as PrismaService,
  );

  let tenantId: string;
  let tenantTwoId: string;
  let membershipId: string;
  let adminMembershipId: string;
  let memberMembershipId: string;
  let inactiveMembershipId: string;
  let membershipTwoId: string;
  let deviceId: string;
  let deviceTwoId: string;
  let capabilityId: string;
  let switchCapabilityId: string;
  let statusDeviceId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: {
        name: `dashboard-persistence-${randomUUID()}`,
      },
    });
    const tenantTwo = await prisma.tenant.create({
      data: {
        name: `dashboard-persistence-${randomUUID()}`,
      },
    });
    tenantId = tenant.id;
    tenantTwoId = tenantTwo.id;

    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId,
      },
    });
    const userTwo = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId: tenantTwoId,
      },
    });

    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        status: 'ACTIVE',
      },
    });
    const adminUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId,
      },
    });
    const memberUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId,
      },
    });
    const inactiveUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId,
      },
    });
    const adminMembership = await prisma.membership.create({
      data: {
        userId: adminUser.id,
        tenantId,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    const memberMembership = await prisma.membership.create({
      data: {
        userId: memberUser.id,
        tenantId,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    });
    const inactiveMembership = await prisma.membership.create({
      data: {
        userId: inactiveUser.id,
        tenantId,
        role: 'ADMIN',
        status: 'REVOKED',
      },
    });
    const membershipTwo = await prisma.membership.create({
      data: {
        userId: userTwo.id,
        tenantId: tenantTwoId,
        status: 'ACTIVE',
      },
    });
    membershipId = membership.id;
    adminMembershipId = adminMembership.id;
    memberMembershipId = memberMembership.id;
    inactiveMembershipId = inactiveMembership.id;
    membershipTwoId = membershipTwo.id;

    const device = await prisma.device.create({
      data: {
        name: 'Dashboard Device',
        tenantId,
      },
    });
    const deviceTwo = await prisma.device.create({
      data: {
        name: 'Other Tenant Device',
        tenantId: tenantTwoId,
      },
    });
    const statusDevice = await prisma.device.create({
      data: {
        name: 'Dashboard Status Device',
        tenantId,
      },
    });

    deviceId = device.id;
    deviceTwoId = deviceTwo.id;
    statusDeviceId = statusDevice.id;

    const capability = await prisma.capability.create({
      data: {
        deviceId,
        key: 'temperature',
        semanticType: 'temperature',
        dataType: 'number',
        constraints: { min: -40, max: 125, precision: 1 },
        isReadable: true,
        isReportable: true,
      },
    });
    capabilityId = capability.id;

    const switchCapability = await prisma.capability.create({
      data: {
        deviceId,
        key: 'enabled',
        semanticType: 'enabled',
        dataType: 'boolean',
        isReadable: true,
        isWritable: true,
        isReportable: false,
      },
    });
    switchCapabilityId = switchCapability.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists and atomically replaces a tenant-owned aggregate with optimistic revision control', async () => {
    const created = await repository.createPersonalDashboard(
      aggregateInput('Initial dashboard'),
    );

    expect(created).toMatchObject({
      tenantId,
      ownerMembershipId: membershipId,
      revision: 1,
      name: 'Initial dashboard',
    });
    expect(created.layouts).toHaveLength(1);
    expect(created.widgets).toHaveLength(1);
    expect(created.layouts[0].items).toHaveLength(1);
    expect(created.widgets[0].bindings).toHaveLength(1);

    const replaced = await repository.replacePersonalDashboard({
      ...aggregateInput('Updated dashboard'),
      dashboardId: created.id,
      expectedRevision: created.revision,
    });

    expect(replaced).toMatchObject({
      id: created.id,
      revision: 2,
      name: 'Updated dashboard',
    });

    await expect(
      repository.replacePersonalDashboard({
        ...aggregateInput('Stale update'),
        dashboardId: created.id,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.RevisionConflict,
    });

    await expect(
      repository.findPersonalDashboard(tenantId, membershipId, created.id),
    ).resolves.toMatchObject({
      revision: 2,
      name: 'Updated dashboard',
    });
  });

  it('rejects cross-tenant membership and binding targets without leaking records', async () => {
    await expect(
      repository.createPersonalDashboard({
        ...aggregateInput('Wrong membership'),
        ownerMembershipId: membershipTwoId,
      }),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid,
    });

    const wrongDeviceInput = aggregateInput('Wrong device');
    wrongDeviceInput.bindings = [
      {
        id: randomUUID(),
        widgetId: wrongDeviceInput.widgets[0].id,
        alias: 'status',
        intent: DashboardBindingIntent.READ,
        mode: DashboardBindingMode.DEVICE_STATUS,
        deviceId: deviceTwoId,
      },
    ];

    await expect(
      repository.createPersonalDashboard(wrongDeviceInput),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.BindingTargetInvalid,
    });

    await expect(
      prisma.dashboard.create({
        data: {
          tenantId,
          ownerMembershipId: membershipTwoId,
          name: 'Composite membership violation',
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });
  });

  it('enforces composite binding integrity, restricts external deletion, and cascades dashboard-owned records', async () => {
    const constraintInput = aggregateInput('Constraint dashboard');
    constraintInput.widgets[0].kind = DashboardWidgetKind.CARD;
    constraintInput.bindings = [
      {
        id: randomUUID(),
        widgetId: constraintInput.widgets[0].id,
        alias: 'status',
        intent: DashboardBindingIntent.READ,
        mode: DashboardBindingMode.DEVICE_STATUS,
        deviceId: statusDeviceId,
      },
    ];

    const aggregate = await repository.createPersonalDashboard(constraintInput);
    const widgetId = aggregate.widgets[0].id;

    await expect(
      prisma.dashboardWidgetBinding.create({
        data: {
          tenantId,
          widgetId,
          alias: 'cross-tenant-device',
          intent: DashboardBindingIntent.READ,
          mode: DashboardBindingMode.DEVICE_STATUS,
          deviceId: deviceTwoId,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });

    await expect(
      prisma.device.delete({
        where: {
          id: statusDeviceId,
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2003',
    });

    await prisma.dashboard.delete({
      where: {
        id: aggregate.id,
      },
    });

    await expect(
      Promise.all([
        prisma.dashboardLayout.count({
          where: {
            dashboardId: aggregate.id,
          },
        }),
        prisma.dashboardWidget.count({
          where: {
            dashboardId: aggregate.id,
          },
        }),
        prisma.dashboardLayoutItem.count({
          where: {
            tenantId,
            widgetId,
          },
        }),
        prisma.dashboardWidgetBinding.count({
          where: {
            tenantId,
            widgetId,
          },
        }),
      ]),
    ).resolves.toEqual([0, 0, 0, 0]);

    await expect(
      prisma.device.delete({
        where: {
          id: statusDeviceId,
        },
      }),
    ).resolves.toMatchObject({
      id: statusDeviceId,
    });
  });

  it('enforces capability-driven widget compatibility and resolves safe metadata', async () => {
    const switchInput = aggregateInput('Switch dashboard');
    switchInput.widgets[0].kind = DashboardWidgetKind.SWITCH;
    switchInput.widgets[0].presentationConfig = {
      onLabel: 'On',
      offLabel: 'Off',
      confirmCommand: true,
    };
    switchInput.bindings = [
      {
        id: randomUUID(),
        widgetId: switchInput.widgets[0].id,
        alias: 'command',
        intent: DashboardBindingIntent.WRITE,
        mode: DashboardBindingMode.COMMAND,
        deviceId,
        capabilityId: switchCapabilityId,
      },
    ];

    const created = await repository.createPersonalDashboard(switchInput);
    const resolutionRecord = await repository.findAuthorizedDashboardResolution(
      tenantId,
      membershipId,
      created.id,
    );
    const resolved = new DashboardWidgetResolver().resolveWidgets(
      resolutionRecord.widgets,
    );

    expect(resolved[0]).toMatchObject({
      state: 'READY',
      kind: DashboardWidgetKind.SWITCH,
      bindings: [
        {
          mode: DashboardBindingMode.COMMAND,
          capability: {
            key: 'enabled',
            dataType: 'boolean',
            access: { writable: true },
          },
        },
      ],
    });
    expect(resolved[0].bindings[0].capability).not.toHaveProperty('deviceId');

    const invalidSwitch = aggregateInput('Invalid switch');
    invalidSwitch.widgets[0].kind = DashboardWidgetKind.SWITCH;
    invalidSwitch.bindings = [
      {
        id: randomUUID(),
        widgetId: invalidSwitch.widgets[0].id,
        alias: 'command',
        intent: DashboardBindingIntent.WRITE,
        mode: DashboardBindingMode.COMMAND,
        deviceId,
        capabilityId,
      },
    ];
    await expect(
      repository.createPersonalDashboard(invalidSwitch),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid,
    });

    const mapInput = aggregateInput('Map disabled');
    mapInput.widgets[0].kind = DashboardWidgetKind.MAP;
    mapInput.bindings = [];
    await expect(
      repository.createPersonalDashboard(mapInput),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid,
    });
  });

  it('enforces personal ownership and admin-only tenant-shared mutation', async () => {
    const personal = await repository.createPersonalDashboard(
      aggregateInput('Owner personal'),
    );

    await expect(
      repository.findAuthorizedDashboard(
        tenantId,
        memberMembershipId,
        personal.id,
      ),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
    });

    await expect(
      repository.listAuthorizedDashboards(tenantId, inactiveMembershipId, 100),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid,
    });

    const sharedInput = {
      ...aggregateInput('Shared dashboard'),
      ownerMembershipId: adminMembershipId,
    };
    await expect(
      repository.createDashboard(
        { ...sharedInput, ownerMembershipId: memberMembershipId },
        DashboardAudience.TENANT_SHARED,
        true,
      ),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired,
    });

    const shared = await repository.createDashboard(
      sharedInput,
      DashboardAudience.TENANT_SHARED,
      true,
    );

    await expect(
      repository.findAuthorizedDashboard(
        tenantId,
        memberMembershipId,
        shared.id,
      ),
    ).resolves.toMatchObject({ id: shared.id, audience: 'TENANT_SHARED' });

    await expect(
      repository.replaceAuthorizedDashboard(
        {
          ...aggregateInput('Member rejected'),
          ownerMembershipId: memberMembershipId,
          dashboardId: shared.id,
          expectedRevision: shared.revision,
        },
        false,
      ),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired,
    });

    const updated = await repository.replaceAuthorizedDashboard(
      {
        ...aggregateInput('Admin updated shared'),
        ownerMembershipId: adminMembershipId,
        dashboardId: shared.id,
        expectedRevision: shared.revision,
      },
      true,
    );
    expect(updated).toMatchObject({ revision: 2, audience: 'TENANT_SHARED' });

    const memberList = await repository.listAuthorizedDashboards(
      tenantId,
      memberMembershipId,
      100,
    );
    expect(memberList.map((dashboard) => dashboard.id)).toContain(shared.id);
    expect(memberList.map((dashboard) => dashboard.id)).not.toContain(
      personal.id,
    );

    await expect(
      repository.deleteAuthorizedDashboard(
        tenantId,
        memberMembershipId,
        shared.id,
        updated.revision,
        false,
      ),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired,
    });

    await repository.deleteAuthorizedDashboard(
      tenantId,
      adminMembershipId,
      shared.id,
      updated.revision,
      true,
    );
    await expect(
      repository.findAuthorizedDashboard(
        tenantId,
        adminMembershipId,
        shared.id,
      ),
    ).rejects.toMatchObject<Partial<DashboardPersistenceError>>({
      code: DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
    });
  });

  function aggregateInput(name: string): DashboardAggregatePersistenceInput {
    const layoutId = randomUUID();
    const widgetId = randomUUID();

    return {
      tenantId,
      ownerMembershipId: membershipId,
      name,
      schemaVersion: '1.0.0',
      layouts: [
        {
          id: layoutId,
          breakpoint: DashboardBreakpoint.DESKTOP,
          columns: 12,
          rowHeight: 48,
          gap: 8,
        },
      ],
      widgets: [
        {
          id: widgetId,
          kind: DashboardWidgetKind.GAUGE,
          title: 'Temperature',
          schemaVersion: '1.0.0',
          presentationConfig: {
            precision: 1,
          },
        },
      ],
      layoutItems: [
        {
          id: randomUUID(),
          layoutId,
          widgetId,
          x: 0,
          y: 0,
          width: 4,
          height: 3,
          minWidth: 2,
          minHeight: 2,
        },
      ],
      bindings: [
        {
          id: randomUUID(),
          widgetId,
          alias: 'value',
          intent: DashboardBindingIntent.READ,
          mode: DashboardBindingMode.LATEST,
          deviceId,
          capabilityId,
        },
      ],
    };
  }
});
