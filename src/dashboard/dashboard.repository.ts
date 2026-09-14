import { Injectable, Logger } from '@nestjs/common';
import {
  DashboardAudience,
  DashboardBindingIntent,
  DashboardBindingMode,
  DeviceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from './dashboard.persistence.error';
import {
  DashboardAggregatePersistenceInput,
  DashboardWidgetBindingPersistenceInput,
  ReplaceDashboardAggregatePersistenceInput,
} from './dashboard.persistence.types';
import { DashboardWidgetResolver } from './dashboard-widget.resolver';
import {
  DashboardResolutionCapability,
  DashboardResolutionWidgetInput,
} from './dashboard-widget-resolution.types';

const DASHBOARD_SCHEMA_VERSION = '1.0.0';
const ADMIN_ROLES = new Set(['ADMIN', 'PLATFORM_ADMIN']);
const MAX_LAYOUTS = 3;
const MAX_WIDGETS = 100;
const MAX_BINDINGS_PER_WIDGET = 16;
const MAX_ROWS = 256;
const MAX_COLUMNS = 24;
const MAX_PRESENTATION_CONFIG_BYTES = 8 * 1024;
const MAX_QUERY_CONFIG_BYTES = 4 * 1024;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_CONFIG_KEY =
  /(password|credential|secret|token|rtsp|mqtt|sql|script|javascript|stylesheet|css|vendor.?key)/i;
const FORBIDDEN_CONFIG_VALUE =
  /(rtsp:\/\/|mqtts?:\/\/|javascript:|<script|\{\{|\bselect\b[\s\S]*\bfrom\b)/i;

const dashboardAggregateInclude = {
  layouts: {
    include: {
      items: {
        orderBy: { id: 'asc' as const },
      },
    },
    orderBy: { breakpoint: 'asc' as const },
  },
  widgets: {
    include: {
      bindings: {
        orderBy: { alias: 'asc' as const },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.DashboardInclude;

const dashboardResolutionInclude = {
  widgets: {
    include: {
      bindings: {
        include: {
          device: {
            select: {
              id: true,
              status: true,
            },
          },
          capability: {
            select: {
              id: true,
              deviceId: true,
              key: true,
              semanticType: true,
              dataType: true,
              unit: true,
              constraints: true,
              isReadable: true,
              isWritable: true,
              isReportable: true,
              schemaVersion: true,
            },
          },
        },
        orderBy: { alias: 'asc' as const },
      },
    },
    orderBy: { id: 'asc' as const },
  },
} satisfies Prisma.DashboardInclude;

export type DashboardAggregateRecord = Prisma.DashboardGetPayload<{
  include: typeof dashboardAggregateInclude;
}>;

export interface DashboardSummaryRecord {
  id: string;
  name: string;
  description: string | null;
  audience: DashboardAudience;
  schemaVersion: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidgetResolutionRecord {
  id: string;
  revision: number;
  schemaVersion: string;
  widgets: DashboardResolutionWidgetInput[];
}

interface DashboardBindingTargets {
  devices: Map<
    string,
    {
      id: string;
      status: DeviceStatus;
    }
  >;
  capabilities: Map<string, DashboardResolutionCapability>;
}

@Injectable()
export class DashboardRepository {
  private readonly logger = new Logger(DashboardRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly widgetResolver: DashboardWidgetResolver = new DashboardWidgetResolver(),
  ) {}

  async createDashboard(
    input: DashboardAggregatePersistenceInput,
    audience: DashboardAudience,
    canManageShared: boolean,
  ): Promise<DashboardAggregateRecord> {
    this.validateAggregateInput(input);
    return this.prisma.$transaction(async (transaction) => {
      const actorMembership = await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );
      if (
        audience === DashboardAudience.TENANT_SHARED &&
        (!canManageShared || !ADMIN_ROLES.has(actorMembership.role))
      ) {
        this.sharedAdminRequired();
      }
      const bindingTargets = await this.assertBindingTargets(
        transaction,
        input,
      );
      this.widgetResolver.assertPersistable(
        this.toResolutionWidgets(input, bindingTargets),
      );
      const dashboard = await transaction.dashboard.create({
        data: {
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          name: input.name.trim(),
          description: this.normalizeDescription(input.description),
          audience,
          schemaVersion: input.schemaVersion ?? DASHBOARD_SCHEMA_VERSION,
        },
        select: { id: true },
      });
      await this.replaceChildren(transaction, dashboard.id, input);
      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        dashboard.id,
      );
      this.logger.log({
        event: 'dashboard.persistence.created',
        outcome: 'succeeded',
        audience,
      });
      return aggregate;
    });
  }

  async findAuthorizedDashboard(
    tenantId: string,
    actorMembershipId: string,
    dashboardId: string,
  ): Promise<DashboardAggregateRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(actorMembershipId, 'actorMembershipId');
    this.assertUuid(dashboardId, 'dashboardId');
    await this.assertActiveMembershipForRead(tenantId, actorMembershipId);

    const dashboard = await this.prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        tenantId,
        OR: [
          { audience: DashboardAudience.TENANT_SHARED },
          {
            audience: DashboardAudience.PERSONAL,
            ownerMembershipId: actorMembershipId,
          },
        ],
      },
      include: dashboardAggregateInclude,
    });
    if (!dashboard) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    }
    return dashboard;
  }

  async findAuthorizedDashboardResolution(
    tenantId: string,
    actorMembershipId: string,
    dashboardId: string,
  ): Promise<DashboardWidgetResolutionRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(actorMembershipId, 'actorMembershipId');
    this.assertUuid(dashboardId, 'dashboardId');
    await this.assertActiveMembershipForRead(tenantId, actorMembershipId);

    const dashboard = await this.prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        tenantId,
        OR: [
          { audience: DashboardAudience.TENANT_SHARED },
          {
            audience: DashboardAudience.PERSONAL,
            ownerMembershipId: actorMembershipId,
          },
        ],
      },
      include: dashboardResolutionInclude,
    });

    if (!dashboard) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    }

    return {
      id: dashboard.id,
      revision: dashboard.revision,
      schemaVersion: dashboard.schemaVersion,
      widgets: dashboard.widgets.map((widget) => ({
        id: widget.id,
        kind: widget.kind,
        title: widget.title,
        schemaVersion: widget.schemaVersion,
        presentationConfig: widget.presentationConfig,
        bindings: widget.bindings.map((binding) => ({
          id: binding.id,
          alias: binding.alias,
          intent: binding.intent,
          mode: binding.mode,
          deviceId: binding.deviceId,
          capabilityId: binding.capabilityId,
          queryConfig: binding.queryConfig,
          device: binding.device,
          capability: binding.capability,
        })),
      })),
    };
  }

  async listAuthorizedDashboards(
    tenantId: string,
    actorMembershipId: string,
    limit: number,
  ): Promise<DashboardSummaryRecord[]> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(actorMembershipId, 'actorMembershipId');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      this.invalid('limit must be between 1 and 100');
    }
    await this.assertActiveMembershipForRead(tenantId, actorMembershipId);

    return this.prisma.dashboard.findMany({
      where: {
        tenantId,
        OR: [
          { audience: DashboardAudience.TENANT_SHARED },
          {
            audience: DashboardAudience.PERSONAL,
            ownerMembershipId: actorMembershipId,
          },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        audience: true,
        schemaVersion: true,
        revision: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async replaceAuthorizedDashboard(
    input: ReplaceDashboardAggregatePersistenceInput,
    canManageShared: boolean,
  ): Promise<DashboardAggregateRecord> {
    this.validateAggregateInput(input);
    this.assertUuid(input.dashboardId, 'dashboardId');
    this.assertExpectedRevision(input.expectedRevision);
    return this.prisma.$transaction(async (transaction) => {
      const actorMembership = await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );
      const dashboard = await transaction.dashboard.findFirst({
        where: { id: input.dashboardId, tenantId: input.tenantId },
        select: { id: true, audience: true, ownerMembershipId: true },
      });
      this.assertMutationAccess(
        dashboard,
        input.ownerMembershipId,
        canManageShared && ADMIN_ROLES.has(actorMembership.role),
      );
      const bindingTargets = await this.assertBindingTargets(
        transaction,
        input,
      );
      this.widgetResolver.assertPersistable(
        this.toResolutionWidgets(input, bindingTargets),
      );
      const revisionUpdate = await transaction.dashboard.updateMany({
        where: {
          id: input.dashboardId,
          tenantId: input.tenantId,
          audience: dashboard!.audience,
          ...(dashboard!.audience === DashboardAudience.PERSONAL
            ? { ownerMembershipId: input.ownerMembershipId }
            : {}),
          revision: input.expectedRevision,
        },
        data: {
          name: input.name.trim(),
          description: this.normalizeDescription(input.description),
          schemaVersion: input.schemaVersion ?? DASHBOARD_SCHEMA_VERSION,
          revision: { increment: 1 },
        },
      });
      if (revisionUpdate.count !== 1) this.revisionConflict();
      await this.replaceChildren(transaction, input.dashboardId, input);
      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.dashboardId,
      );
      this.logger.log({
        event: 'dashboard.persistence.replaced',
        outcome: 'succeeded',
        audience: dashboard!.audience,
      });
      return aggregate;
    });
  }

  async deleteAuthorizedDashboard(
    tenantId: string,
    actorMembershipId: string,
    dashboardId: string,
    expectedRevision: number,
    canManageShared: boolean,
  ): Promise<void> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(actorMembershipId, 'actorMembershipId');
    this.assertUuid(dashboardId, 'dashboardId');
    this.assertExpectedRevision(expectedRevision);
    await this.prisma.$transaction(async (transaction) => {
      const actorMembership = await this.assertActiveMembership(
        transaction,
        tenantId,
        actorMembershipId,
      );
      const dashboard = await transaction.dashboard.findFirst({
        where: { id: dashboardId, tenantId },
        select: { audience: true, ownerMembershipId: true },
      });
      this.assertMutationAccess(
        dashboard,
        actorMembershipId,
        canManageShared && ADMIN_ROLES.has(actorMembership.role),
      );
      const deleted = await transaction.dashboard.deleteMany({
        where: {
          id: dashboardId,
          tenantId,
          audience: dashboard!.audience,
          ...(dashboard!.audience === DashboardAudience.PERSONAL
            ? { ownerMembershipId: actorMembershipId }
            : {}),
          revision: expectedRevision,
        },
      });
      if (deleted.count !== 1) this.revisionConflict();
      this.logger.log({
        event: 'dashboard.persistence.deleted',
        outcome: 'succeeded',
        audience: dashboard!.audience,
      });
    });
  }

  async createPersonalDashboard(
    input: DashboardAggregatePersistenceInput,
  ): Promise<DashboardAggregateRecord> {
    return this.createDashboard(input, DashboardAudience.PERSONAL, true);
  }

  async findPersonalDashboard(
    tenantId: string,
    ownerMembershipId: string,
    dashboardId: string,
  ): Promise<DashboardAggregateRecord> {
    this.assertUuid(tenantId, 'tenantId');
    this.assertUuid(ownerMembershipId, 'ownerMembershipId');
    this.assertUuid(dashboardId, 'dashboardId');
    await this.assertActiveMembershipForRead(tenantId, ownerMembershipId);

    const dashboard = await this.prisma.dashboard.findFirst({
      where: {
        id: dashboardId,
        tenantId,
        ownerMembershipId,
        audience: DashboardAudience.PERSONAL,
      },
      include: dashboardAggregateInclude,
    });

    if (!dashboard) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    }

    return dashboard;
  }

  async replacePersonalDashboard(
    input: ReplaceDashboardAggregatePersistenceInput,
  ): Promise<DashboardAggregateRecord> {
    this.validateAggregateInput(input);
    this.assertUuid(input.dashboardId, 'dashboardId');

    if (
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    ) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.InvalidInput,
        'expectedRevision must be a positive integer',
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.assertActiveMembership(
        transaction,
        input.tenantId,
        input.ownerMembershipId,
      );

      const dashboard = await transaction.dashboard.findFirst({
        where: {
          id: input.dashboardId,
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          audience: DashboardAudience.PERSONAL,
        },
        select: {
          id: true,
        },
      });

      if (!dashboard) {
        throw new DashboardPersistenceError(
          DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
          'Dashboard not found',
        );
      }

      const bindingTargets = await this.assertBindingTargets(
        transaction,
        input,
      );
      this.widgetResolver.assertPersistable(
        this.toResolutionWidgets(input, bindingTargets),
      );

      const revisionUpdate = await transaction.dashboard.updateMany({
        where: {
          id: input.dashboardId,
          tenantId: input.tenantId,
          ownerMembershipId: input.ownerMembershipId,
          audience: DashboardAudience.PERSONAL,
          revision: input.expectedRevision,
        },
        data: {
          name: input.name.trim(),
          description: this.normalizeDescription(input.description),
          schemaVersion: input.schemaVersion ?? DASHBOARD_SCHEMA_VERSION,
          revision: {
            increment: 1,
          },
        },
      });

      if (revisionUpdate.count !== 1) {
        this.logger.warn({
          event: 'dashboard.persistence.revision_conflict',
          outcome: 'rejected',
        });
        throw new DashboardPersistenceError(
          DASHBOARD_PERSISTENCE_ERROR_CODES.RevisionConflict,
          'Dashboard revision conflict',
        );
      }

      await this.replaceChildren(transaction, input.dashboardId, input);

      const aggregate = await this.loadAggregate(
        transaction,
        input.tenantId,
        input.dashboardId,
      );

      this.logger.log({
        event: 'dashboard.persistence.replaced',
        outcome: 'succeeded',
      });

      return aggregate;
    });
  }

  private assertMutationAccess(
    dashboard: {
      audience: DashboardAudience;
      ownerMembershipId: string;
    } | null,
    actorMembershipId: string,
    canManageShared: boolean,
  ): void {
    if (
      !dashboard ||
      (dashboard.audience === DashboardAudience.PERSONAL &&
        dashboard.ownerMembershipId !== actorMembershipId)
    ) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    }
    if (
      dashboard.audience === DashboardAudience.TENANT_SHARED &&
      !canManageShared
    ) {
      this.sharedAdminRequired();
    }
  }

  private assertExpectedRevision(expectedRevision: number): void {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      this.invalid('expectedRevision must be a positive integer');
    }
  }

  private sharedAdminRequired(): never {
    throw new DashboardPersistenceError(
      DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired,
      'Tenant-shared dashboards require an active tenant administrator',
    );
  }

  private revisionConflict(): never {
    this.logger.warn({
      event: 'dashboard.persistence.revision_conflict',
      outcome: 'rejected',
    });
    throw new DashboardPersistenceError(
      DASHBOARD_PERSISTENCE_ERROR_CODES.RevisionConflict,
      'Dashboard revision conflict',
    );
  }

  private async replaceChildren(
    transaction: Prisma.TransactionClient,
    dashboardId: string,
    input: DashboardAggregatePersistenceInput,
  ): Promise<void> {
    await transaction.dashboardLayout.deleteMany({
      where: {
        dashboardId,
        tenantId: input.tenantId,
      },
    });
    await transaction.dashboardWidget.deleteMany({
      where: {
        dashboardId,
        tenantId: input.tenantId,
      },
    });

    if (input.layouts.length > 0) {
      await transaction.dashboardLayout.createMany({
        data: input.layouts.map((layout) => ({
          id: layout.id,
          tenantId: input.tenantId,
          dashboardId,
          breakpoint: layout.breakpoint,
          columns: layout.columns,
          rowHeight: layout.rowHeight,
          gap: layout.gap,
        })),
      });
    }

    if (input.widgets.length > 0) {
      await transaction.dashboardWidget.createMany({
        data: input.widgets.map((widget) => ({
          id: widget.id,
          tenantId: input.tenantId,
          dashboardId,
          kind: widget.kind,
          title: widget.title.trim(),
          schemaVersion: widget.schemaVersion ?? DASHBOARD_SCHEMA_VERSION,
          ...(widget.presentationConfig === undefined
            ? {}
            : { presentationConfig: widget.presentationConfig }),
        })),
      });
    }

    if (input.layoutItems.length > 0) {
      await transaction.dashboardLayoutItem.createMany({
        data: input.layoutItems.map((item) => ({
          id: item.id,
          tenantId: input.tenantId,
          layoutId: item.layoutId,
          widgetId: item.widgetId,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          minWidth: item.minWidth,
          minHeight: item.minHeight,
        })),
      });
    }

    if (input.bindings.length > 0) {
      await transaction.dashboardWidgetBinding.createMany({
        data: input.bindings.map((binding) => ({
          id: binding.id,
          tenantId: input.tenantId,
          widgetId: binding.widgetId,
          alias: binding.alias.trim(),
          intent: binding.intent,
          mode: binding.mode,
          deviceId: binding.deviceId,
          capabilityId: binding.capabilityId,
          ...(binding.queryConfig === undefined
            ? {}
            : { queryConfig: binding.queryConfig }),
        })),
      });
    }
  }

  private async loadAggregate(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    dashboardId: string,
  ): Promise<DashboardAggregateRecord> {
    const dashboard = await transaction.dashboard.findUnique({
      where: {
        id_tenantId: {
          id: dashboardId,
          tenantId,
        },
      },
      include: dashboardAggregateInclude,
    });

    if (!dashboard) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    }

    return dashboard;
  }

  private async assertActiveMembershipForRead(
    tenantId: string,
    membershipId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        id_tenantId: {
          id: membershipId,
          tenantId,
        },
      },
      select: { status: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid,
        'Active dashboard membership not found',
      );
    }
  }

  private async assertActiveMembership(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string,
  ): Promise<{ role: string }> {
    const membership = await transaction.membership.findUnique({
      where: {
        id_tenantId: {
          id: membershipId,
          tenantId,
        },
      },
      select: {
        status: true,
        role: true,
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid,
        'Active dashboard owner membership not found',
      );
    }

    return { role: membership.role };
  }

  private async assertBindingTargets(
    transaction: Prisma.TransactionClient,
    input: DashboardAggregatePersistenceInput,
  ): Promise<DashboardBindingTargets> {
    const deviceIds = [
      ...new Set(input.bindings.map((binding) => binding.deviceId)),
    ];

    const devices =
      deviceIds.length === 0
        ? []
        : await transaction.device.findMany({
            where: {
              tenantId: input.tenantId,
              id: {
                in: deviceIds,
              },
            },
            select: {
              id: true,
              status: true,
            },
          });

    if (devices.length !== deviceIds.length) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.BindingTargetInvalid,
        'Dashboard binding device not found in tenant',
      );
    }

    const capabilityReferences = this.uniqueCapabilityReferences(
      input.bindings,
    );
    const capabilities =
      capabilityReferences.length === 0
        ? []
        : await transaction.capability.findMany({
            where: {
              OR: capabilityReferences.map(({ capabilityId, deviceId }) => ({
                id: capabilityId,
                deviceId,
              })),
            },
            select: {
              id: true,
              deviceId: true,
              key: true,
              semanticType: true,
              dataType: true,
              unit: true,
              constraints: true,
              isReadable: true,
              isWritable: true,
              isReportable: true,
              schemaVersion: true,
            },
          });

    const capabilityMap = new Map(
      capabilities.map((capability) => [
        `${capability.id}:${capability.deviceId}`,
        capability,
      ]),
    );
    const missing = capabilityReferences.some(
      ({ capabilityId, deviceId }) =>
        !capabilityMap.has(`${capabilityId}:${deviceId}`),
    );

    if (missing) {
      throw new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.BindingTargetInvalid,
        'Dashboard binding capability does not belong to the selected device',
      );
    }

    return {
      devices: new Map(devices.map((device) => [device.id, device])),
      capabilities: capabilityMap,
    };
  }

  private toResolutionWidgets(
    input: DashboardAggregatePersistenceInput,
    targets: DashboardBindingTargets,
  ): DashboardResolutionWidgetInput[] {
    const bindingsByWidget = new Map<
      string,
      DashboardResolutionWidgetInput['bindings']
    >();

    for (const binding of input.bindings) {
      const capabilityKey = binding.capabilityId
        ? `${binding.capabilityId}:${binding.deviceId}`
        : null;
      const resolvedBinding = {
        id: binding.id,
        alias: binding.alias,
        intent: binding.intent,
        mode: binding.mode,
        deviceId: binding.deviceId,
        capabilityId: binding.capabilityId ?? null,
        queryConfig: (binding.queryConfig ?? null) as Prisma.JsonValue | null,
        device: targets.devices.get(binding.deviceId) ?? null,
        capability: capabilityKey
          ? (targets.capabilities.get(capabilityKey) ?? null)
          : null,
      };
      const widgetBindings = bindingsByWidget.get(binding.widgetId) ?? [];
      widgetBindings.push(resolvedBinding);
      bindingsByWidget.set(binding.widgetId, widgetBindings);
    }

    return input.widgets.map((widget) => ({
      id: widget.id,
      kind: widget.kind,
      title: widget.title,
      schemaVersion: widget.schemaVersion ?? DASHBOARD_SCHEMA_VERSION,
      presentationConfig: (widget.presentationConfig ??
        null) as Prisma.JsonValue | null,
      bindings: bindingsByWidget.get(widget.id) ?? [],
    }));
  }

  private uniqueCapabilityReferences(
    bindings: DashboardWidgetBindingPersistenceInput[],
  ): Array<{ capabilityId: string; deviceId: string }> {
    const references = new Map<
      string,
      { capabilityId: string; deviceId: string }
    >();

    for (const binding of bindings) {
      if (!binding.capabilityId) {
        continue;
      }

      references.set(`${binding.capabilityId}:${binding.deviceId}`, {
        capabilityId: binding.capabilityId,
        deviceId: binding.deviceId,
      });
    }

    return [...references.values()];
  }

  private validateAggregateInput(
    input: DashboardAggregatePersistenceInput,
  ): void {
    this.assertUuid(input.tenantId, 'tenantId');
    this.assertUuid(input.ownerMembershipId, 'ownerMembershipId');
    this.assertBoundedTrimmedString(input.name, 'name', 120);

    if (input.description !== undefined) {
      this.assertBoundedTrimmedString(
        input.description,
        'description',
        500,
        true,
      );
    }

    if (
      (input.schemaVersion ?? DASHBOARD_SCHEMA_VERSION) !==
      DASHBOARD_SCHEMA_VERSION
    ) {
      this.invalid('Unsupported dashboard schemaVersion');
    }

    if (input.layouts.length > MAX_LAYOUTS) {
      this.invalid(`Dashboard cannot exceed ${MAX_LAYOUTS} layouts`);
    }
    if (input.widgets.length > MAX_WIDGETS) {
      this.invalid(`Dashboard cannot exceed ${MAX_WIDGETS} widgets`);
    }

    const layoutIds = new Set<string>();
    const breakpoints = new Set<string>();
    for (const layout of input.layouts) {
      this.assertUuid(layout.id, 'layout.id');
      if (layoutIds.has(layout.id)) this.invalid('Duplicate layout id');
      if (breakpoints.has(layout.breakpoint))
        this.invalid('Duplicate breakpoint');
      layoutIds.add(layout.id);
      breakpoints.add(layout.breakpoint);

      if (
        !Number.isInteger(layout.columns) ||
        layout.columns < 1 ||
        layout.columns > MAX_COLUMNS
      ) {
        this.invalid(`Layout columns must be between 1 and ${MAX_COLUMNS}`);
      }
      if (
        !Number.isInteger(layout.rowHeight) ||
        layout.rowHeight < 1 ||
        layout.rowHeight > 512
      ) {
        this.invalid('Layout rowHeight must be between 1 and 512');
      }
      if (!Number.isInteger(layout.gap) || layout.gap < 0 || layout.gap > 64) {
        this.invalid('Layout gap must be between 0 and 64');
      }
    }

    const widgetIds = new Set<string>();
    for (const widget of input.widgets) {
      this.assertUuid(widget.id, 'widget.id');
      if (widgetIds.has(widget.id)) this.invalid('Duplicate widget id');
      widgetIds.add(widget.id);
      this.assertBoundedTrimmedString(widget.title, 'widget.title', 120);
      if (
        (widget.schemaVersion ?? DASHBOARD_SCHEMA_VERSION) !==
        DASHBOARD_SCHEMA_VERSION
      ) {
        this.invalid('Unsupported widget schemaVersion');
      }
      this.assertSafeJson(
        widget.presentationConfig,
        MAX_PRESENTATION_CONFIG_BYTES,
        'presentationConfig',
      );
    }

    const placements = new Set<string>();
    for (const item of input.layoutItems) {
      this.assertUuid(item.id, 'layoutItem.id');
      if (!layoutIds.has(item.layoutId) || !widgetIds.has(item.widgetId)) {
        this.invalid('Layout item references an unknown layout or widget');
      }

      const placementKey = `${item.layoutId}:${item.widgetId}`;
      if (placements.has(placementKey)) {
        this.invalid('Widget can appear only once in a layout');
      }
      placements.add(placementKey);

      for (const [field, value] of [
        ['x', item.x],
        ['y', item.y],
        ['width', item.width],
        ['height', item.height],
      ] as const) {
        if (!Number.isInteger(value)) {
          this.invalid(`Layout item ${field} must be an integer`);
        }
      }

      if (
        item.x < 0 ||
        item.y < 0 ||
        item.width < 1 ||
        item.height < 1 ||
        item.x + item.width > MAX_COLUMNS ||
        item.y + item.height > MAX_ROWS
      ) {
        this.invalid('Layout item geometry is outside persistence bounds');
      }

      if (
        (item.minWidth !== undefined &&
          (!Number.isInteger(item.minWidth) ||
            item.minWidth < 1 ||
            item.minWidth > item.width)) ||
        (item.minHeight !== undefined &&
          (!Number.isInteger(item.minHeight) ||
            item.minHeight < 1 ||
            item.minHeight > item.height))
      ) {
        this.invalid('Layout item minimum size is invalid');
      }
    }

    const bindingAliases = new Set<string>();
    const bindingCounts = new Map<string, number>();
    for (const binding of input.bindings) {
      this.assertUuid(binding.id, 'binding.id');
      this.assertUuid(binding.deviceId, 'binding.deviceId');
      if (!widgetIds.has(binding.widgetId)) {
        this.invalid('Binding references an unknown widget');
      }
      if (binding.capabilityId) {
        this.assertUuid(binding.capabilityId, 'binding.capabilityId');
      }
      this.assertBoundedTrimmedString(binding.alias, 'binding.alias', 64);

      const aliasKey = `${binding.widgetId}:${binding.alias.trim()}`;
      if (bindingAliases.has(aliasKey)) {
        this.invalid('Duplicate widget binding alias');
      }
      bindingAliases.add(aliasKey);

      const bindingCount = (bindingCounts.get(binding.widgetId) ?? 0) + 1;
      if (bindingCount > MAX_BINDINGS_PER_WIDGET) {
        this.invalid(
          `Widget cannot exceed ${MAX_BINDINGS_PER_WIDGET} bindings`,
        );
      }
      bindingCounts.set(binding.widgetId, bindingCount);

      this.validateBindingMode(binding);
      this.assertSafeJson(
        binding.queryConfig,
        MAX_QUERY_CONFIG_BYTES,
        'queryConfig',
      );
    }
  }

  private validateBindingMode(
    binding: DashboardWidgetBindingPersistenceInput,
  ): void {
    if (
      binding.mode !== DashboardBindingMode.DEVICE_STATUS &&
      !binding.capabilityId
    ) {
      this.invalid('Capability is required for non-device-status bindings');
    }

    if (
      binding.mode === DashboardBindingMode.COMMAND &&
      binding.intent !== DashboardBindingIntent.WRITE
    ) {
      this.invalid('Command bindings require WRITE intent');
    }

    if (
      binding.mode !== DashboardBindingMode.COMMAND &&
      binding.intent === DashboardBindingIntent.WRITE
    ) {
      this.invalid('WRITE intent is reserved for command bindings');
    }

    if (
      binding.mode === DashboardBindingMode.DEVICE_STATUS &&
      binding.intent !== DashboardBindingIntent.READ
    ) {
      this.invalid('Device status bindings require READ intent');
    }
  }

  private assertSafeJson(
    value: Prisma.InputJsonValue | undefined,
    maxBytes: number,
    field: string,
  ): void {
    if (value === undefined) {
      return;
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      this.invalid(`${field} exceeds ${maxBytes} bytes`);
    }

    this.walkSafeJson(value, field);
  }

  private walkSafeJson(value: Prisma.InputJsonValue, path: string): void {
    if (typeof value === 'string') {
      if (FORBIDDEN_CONFIG_VALUE.test(value)) {
        this.invalid(`${path} contains forbidden content`);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        this.walkSafeJson(value[index], `${path}[${index}]`);
      }
      return;
    }

    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_CONFIG_KEY.test(key)) {
          this.invalid(`${path}.${key} is forbidden`);
        }
        this.walkSafeJson(child as Prisma.InputJsonValue, `${path}.${key}`);
      }
    }
  }

  private normalizeDescription(value: string | undefined): string | null {
    if (value === undefined) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      this.invalid(`${field} must be a UUID`);
    }
  }

  private assertBoundedTrimmedString(
    value: string,
    field: string,
    maxLength: number,
    allowEmpty = false,
  ): void {
    const trimmed = value.trim();

    if (
      (!allowEmpty && trimmed.length === 0) ||
      trimmed.length > maxLength ||
      trimmed !== value
    ) {
      this.invalid(
        `${field} must be trimmed and at most ${maxLength} characters`,
      );
    }
  }

  private invalid(message: string): never {
    throw new DashboardPersistenceError(
      DASHBOARD_PERSISTENCE_ERROR_CODES.InvalidInput,
      message,
    );
  }
}
