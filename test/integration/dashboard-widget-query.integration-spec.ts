import { randomUUID } from 'node:crypto';
import {
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardBreakpoint,
  DashboardWidgetKind,
  PrismaClient,
} from '@prisma/client';
import { CapabilityValidator } from '../../src/device/capability.validator';
import { DeviceAccessService } from '../../src/device/device-access.service';
import { DashboardRepository } from '../../src/dashboard/dashboard.repository';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { DashboardWidgetQueryService } from '../../src/dashboard/dashboard-widget-query.service';
import { DashboardWidgetResolver } from '../../src/dashboard/dashboard-widget.resolver';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TelemetryAggregationService } from '../../src/telemetry/telemetry-aggregation.service';
import { TelemetryService } from '../../src/telemetry/telemetry.service';

const NOW = new Date('2026-07-19T01:00:00.000Z');

describe('PostgreSQL dashboard telemetry widget query integration', () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const resolver = new DashboardWidgetResolver();
  const repository = new DashboardRepository(prismaService, resolver);
  const telemetry = new TelemetryService(
    prismaService,
    new CapabilityValidator(),
  );
  const aggregation = new TelemetryAggregationService(prismaService);
  const queryService = new DashboardWidgetQueryService(
    telemetry,
    aggregation,
    () => NOW,
  );
  const deviceAccess = new DeviceAccessService(prismaService);
  const dashboardService = new DashboardService(
    repository,
    resolver,
    queryService,
    deviceAccess,
  );

  let tenantId: string;
  let userId: string;
  let membershipId: string;
  let deviceId: string;
  let capabilityId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: `dashboard-query-${randomUUID()}` },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        tenantId,
      },
    });
    userId = user.id;
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId,
        status: 'ACTIVE',
      },
    });
    membershipId = membership.id;
    const device = await prisma.device.create({
      data: {
        name: 'Dashboard Query Device',
        tenantId,
        ownerId: user.id,
        status: 'ACTIVE',
      },
    });
    deviceId = device.id;
    const capability = await prisma.capability.create({
      data: {
        deviceId,
        key: 'temperature',
        semanticType: 'temperature',
        dataType: 'number',
        unit: 'celsius',
        constraints: { min: -40, max: 125, precision: 1 },
        isReadable: true,
        isReportable: true,
      },
    });
    capabilityId = capability.id;

    await prisma.telemetry.createMany({
      data: [
        {
          tenantId,
          deviceId,
          eventId: randomUUID(),
          payload: { temperature: 20, humidity: 55 },
          createdAt: new Date('2026-07-19T00:10:00.000Z'),
        },
        {
          tenantId,
          deviceId,
          eventId: randomUUID(),
          payload: { temperature: 24 },
          createdAt: new Date('2026-07-19T00:50:00.000Z'),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns only tenant-authorized latest telemetry for one widget', async () => {
    const widgetId = randomUUID();
    const layoutId = randomUUID();
    const dashboard = await repository.createPersonalDashboard({
      tenantId,
      ownerMembershipId: membershipId,
      name: 'Latest dashboard',
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
            min: -40,
            max: 125,
            staleAfterSeconds: 900,
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
    });

    await expect(
      dashboardService.queryWidgetData(
        { tenantId, membershipId, userId, role: 'MEMBER' },
        dashboard.id,
        widgetId,
      ),
    ).resolves.toMatchObject({
      dashboardId: dashboard.id,
      widgetId,
      state: 'READY',
      bindings: [
        {
          state: 'READY',
          data: { value: 24 },
        },
      ],
    });
  });

  it('executes existing bounded aggregation with server-derived range', async () => {
    const widgetId = randomUUID();
    const layoutId = randomUUID();
    const dashboard = await repository.createPersonalDashboard({
      tenantId,
      ownerMembershipId: membershipId,
      name: 'Aggregate dashboard',
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
          kind: DashboardWidgetKind.CHART,
          title: 'Temperature history',
          schemaVersion: '1.0.0',
        },
      ],
      layoutItems: [
        {
          id: randomUUID(),
          layoutId,
          widgetId,
          x: 0,
          y: 0,
          width: 6,
          height: 4,
        },
      ],
      bindings: [
        {
          id: randomUUID(),
          widgetId,
          alias: 'series',
          intent: DashboardBindingIntent.REPORT,
          mode: DashboardBindingMode.AGGREGATE,
          deviceId,
          capabilityId,
          queryConfig: { bucket: '1h', rangeHours: 24 },
        },
      ],
    });

    await expect(
      dashboardService.queryWidgetData(
        { tenantId, membershipId, userId, role: 'MEMBER' },
        dashboard.id,
        widgetId,
      ),
    ).resolves.toMatchObject({
      dashboardId: dashboard.id,
      widgetId,
      state: 'READY',
      bindings: [
        {
          data: {
            from: '2026-07-18T01:00:00.000Z',
            to: NOW.toISOString(),
            bucket: '1h',
            buckets: expect.any(Array),
          },
        },
      ],
    });
  });
});
