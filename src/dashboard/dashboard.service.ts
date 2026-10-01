import { Injectable, Logger, Optional } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { Prisma } from '@prisma/client';
import { CreateDashboardDto, ReplaceDashboardDto } from './dto/dashboard.dto';
import { DashboardTenantContext } from './dashboard-request-context';
import { mapDashboardPersistenceError } from './dashboard-error.mapper';
import {
  DashboardAggregateRecord,
  DashboardRepository,
  DashboardSummaryRecord,
  DashboardWidgetResolutionRecord,
} from './dashboard.repository';
import { DashboardAggregatePersistenceInput } from './dashboard.persistence.types';
import { DashboardWidgetResolver } from './dashboard-widget.resolver';
import { DashboardWidgetQueryService } from './dashboard-widget-query.service';
import { DeviceAccessService } from '../device/device-access.service';

const ADMIN_ROLE = 'ADMIN';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly repository: DashboardRepository,
    private readonly widgetResolver: DashboardWidgetResolver = new DashboardWidgetResolver(),
    private readonly widgetQueryService?: DashboardWidgetQueryService,
    @Optional() private readonly deviceAccessService?: DeviceAccessService,
  ) {}

  async create(context: DashboardTenantContext, dto: CreateDashboardDto) {
    try {
      await this.assertDashboardBindingAccess(context, dto.bindings);
      const dashboard = await this.repository.createDashboard(
        this.toPersistenceInput(context, dto),
        dto.audience,
        this.isAdmin(context),
      );
      this.logger.log({
        event: 'dashboard.api.created',
        outcome: 'succeeded',
        audience: dto.audience,
      });
      return this.toAggregateResponse(
        await this.filterAggregateDeviceAccess(context, dashboard),
      );
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.created',
        outcome: 'rejected',
        audience: dto.audience,
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async list(context: DashboardTenantContext, limit: number) {
    try {
      const dashboards = await this.repository.listAuthorizedDashboards(
        context.tenantId,
        context.membershipId,
        limit,
      );
      this.logger.log({
        event: 'dashboard.api.listed',
        outcome: 'succeeded',
      });
      return {
        items: dashboards.map((dashboard) => this.toSummaryResponse(dashboard)),
        limit,
      };
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.listed',
        outcome: 'rejected',
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async findOne(context: DashboardTenantContext, dashboardId: string) {
    try {
      const dashboard = await this.repository.findAuthorizedDashboard(
        context.tenantId,
        context.membershipId,
        dashboardId,
      );
      this.logger.log({
        event: 'dashboard.api.read',
        outcome: 'succeeded',
        audience: dashboard.audience,
      });
      return this.toAggregateResponse(
        await this.filterAggregateDeviceAccess(context, dashboard),
      );
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.read',
        outcome: 'rejected',
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async resolve(context: DashboardTenantContext, dashboardId: string) {
    try {
      const dashboard = await this.repository.findAuthorizedDashboardResolution(
        context.tenantId,
        context.membershipId,
        dashboardId,
      );
      const authorizedDashboard = await this.filterResolutionDeviceAccess(
        context,
        dashboard,
      );
      const widgets = this.widgetResolver.resolveWidgets(
        authorizedDashboard.widgets,
      );
      const ready = widgets.filter((widget) => widget.state === 'READY').length;
      const invalid = widgets.filter(
        (widget) => widget.state === 'INVALID',
      ).length;
      const unsupported = widgets.filter(
        (widget) => widget.state === 'UNSUPPORTED',
      ).length;

      this.logger.log({
        event: 'dashboard.api.resolved',
        outcome: invalid === 0 && unsupported === 0 ? 'succeeded' : 'partial',
        widgetCount: widgets.length,
        readyWidgetCount: ready,
        invalidWidgetCount: invalid,
        unsupportedWidgetCount: unsupported,
      });

      return {
        dashboardId: dashboard.id,
        schemaVersion: dashboard.schemaVersion,
        revision: dashboard.revision,
        summary: {
          total: widgets.length,
          ready,
          invalid,
          unsupported,
        },
        widgets,
      };
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.resolved',
        outcome: 'rejected',
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async queryWidgetData(
    context: DashboardTenantContext,
    dashboardId: string,
    widgetId: string,
  ) {
    const startedAt = process.hrtime.bigint();

    try {
      const dashboard = await this.repository.findAuthorizedDashboardResolution(
        context.tenantId,
        context.membershipId,
        dashboardId,
      );
      const authorizedDashboard = await this.filterResolutionDeviceAccess(
        context,
        dashboard,
      );
      const widget = this.widgetResolver
        .resolveWidgets(authorizedDashboard.widgets)
        .find((candidate) => candidate.id === widgetId);

      if (!widget) {
        throw new DomainNotFoundException(
          ERROR_CODES.DashboardWidgetNotFound,
          'Dashboard widget not found',
        );
      }

      if (!this.widgetQueryService) {
        throw new Error('Dashboard widget query service is unavailable');
      }

      const result = await this.widgetQueryService.queryWidget(
        context.tenantId,
        widget,
      );
      const failedBindingCount =
        result.summary.error +
        result.summary.invalid +
        result.summary.unsupported;

      this.logger.log({
        event: 'dashboard.widget_query.completed',
        outcome: failedBindingCount === 0 ? 'succeeded' : 'partial',
        widgetKind: widget.kind,
        state: result.state,
        bindingCount: result.summary.total,
        failedBindingCount,
        durationMs: this.elapsedMilliseconds(startedAt),
      });

      return {
        dashboardId: dashboard.id,
        schemaVersion: dashboard.schemaVersion,
        revision: dashboard.revision,
        ...result,
      };
    } catch (error) {
      this.logger.log({
        event: 'dashboard.widget_query.completed',
        outcome: 'rejected',
        durationMs: this.elapsedMilliseconds(startedAt),
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async replace(
    context: DashboardTenantContext,
    dashboardId: string,
    dto: ReplaceDashboardDto,
  ) {
    try {
      await this.assertDashboardBindingAccess(context, dto.bindings);
      const dashboard = await this.repository.replaceAuthorizedDashboard(
        {
          ...this.toPersistenceInput(context, dto),
          dashboardId,
          expectedRevision: dto.expectedRevision,
        },
        this.isAdmin(context),
      );
      this.logger.log({
        event: 'dashboard.api.updated',
        outcome: 'succeeded',
        audience: dashboard.audience,
      });
      return this.toAggregateResponse(
        await this.filterAggregateDeviceAccess(context, dashboard),
      );
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.updated',
        outcome: 'rejected',
      });
      return mapDashboardPersistenceError(error);
    }
  }

  async delete(
    context: DashboardTenantContext,
    dashboardId: string,
    expectedRevision: number,
  ) {
    try {
      await this.repository.deleteAuthorizedDashboard(
        context.tenantId,
        context.membershipId,
        dashboardId,
        expectedRevision,
        this.isAdmin(context),
      );
      this.logger.log({
        event: 'dashboard.api.deleted',
        outcome: 'succeeded',
      });
      return { deleted: true };
    } catch (error) {
      this.logger.log({
        event: 'dashboard.api.deleted',
        outcome: 'rejected',
      });
      return mapDashboardPersistenceError(error);
    }
  }

  private async assertDashboardBindingAccess(
    context: DashboardTenantContext,
    bindings: ReadonlyArray<{
      deviceId: string;
      intent: string;
      mode: string;
    }>,
  ): Promise<void> {
    if (this.isAdministrativeContext(context) || bindings.length === 0) return;

    const decisions = await this.resolveDashboardDeviceAccess(
      context,
      bindings.map((binding) => binding.deviceId),
    );

    for (const binding of bindings) {
      const decision = decisions.get(binding.deviceId);
      const requiresControl =
        binding.intent === 'WRITE' || binding.mode === 'COMMAND';
      const allowed = requiresControl
        ? decision?.canControl === true
        : decision?.canView === true;

      if (!allowed) {
        throw new DomainForbiddenException(
          ERROR_CODES.RbacPermissionDenied,
          requiresControl
            ? 'Dashboard binding requires device CONTROL access'
            : 'Dashboard binding requires device VIEW access',
        );
      }
    }
  }

  private async filterAggregateDeviceAccess(
    context: DashboardTenantContext,
    dashboard: DashboardAggregateRecord,
  ): Promise<DashboardAggregateRecord> {
    if (this.isAdministrativeContext(context)) return dashboard;

    const decisions = await this.resolveDashboardDeviceAccess(
      context,
      dashboard.widgets.flatMap((widget) =>
        widget.bindings.map((binding) => binding.deviceId),
      ),
    );

    return {
      ...dashboard,
      widgets: dashboard.widgets.map((widget) => ({
        ...widget,
        bindings: widget.bindings.filter(
          (binding) => decisions.get(binding.deviceId)?.canView === true,
        ),
      })),
    } as DashboardAggregateRecord;
  }

  private async filterResolutionDeviceAccess(
    context: DashboardTenantContext,
    dashboard: DashboardWidgetResolutionRecord,
  ): Promise<DashboardWidgetResolutionRecord> {
    if (this.isAdministrativeContext(context)) return dashboard;

    const decisions = await this.resolveDashboardDeviceAccess(
      context,
      dashboard.widgets.flatMap((widget) =>
        widget.bindings.map((binding) => binding.deviceId),
      ),
    );

    return {
      ...dashboard,
      widgets: dashboard.widgets.map((widget) => ({
        ...widget,
        bindings: widget.bindings.flatMap((binding) => {
          const decision = decisions.get(binding.deviceId);
          if (!decision?.canView) return [];

          if (!binding.capability || decision.canControl) {
            return [binding];
          }

          return [
            {
              ...binding,
              capability: {
                ...binding.capability,
                // Capability metadata remains readable, but writable reflects
                // both technical capability and the current user's CONTROL grant.
                isWritable: false,
              },
            },
          ];
        }),
      })),
    };
  }

  private async resolveDashboardDeviceAccess(
    context: DashboardTenantContext,
    deviceIds: readonly string[],
  ) {
    if (!context.userId || !this.deviceAccessService) {
      // MEMBER dashboard reads must fail closed when user identity or the
      // centralized access evaluator is unavailable.
      return new Map();
    }

    return this.deviceAccessService.resolveMany(
      {
        tenantId: context.tenantId,
        membershipId: context.membershipId,
        userId: context.userId,
        role: context.role,
      },
      deviceIds,
    );
  }

  private isAdministrativeContext(context: DashboardTenantContext): boolean {
    return context.role === 'ADMIN' || context.role === 'PLATFORM_ADMIN';
  }

  private elapsedMilliseconds(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }

  private toPersistenceInput(
    context: DashboardTenantContext,
    dto: CreateDashboardDto | ReplaceDashboardDto,
  ): DashboardAggregatePersistenceInput {
    return {
      tenantId: context.tenantId,
      ownerMembershipId: context.membershipId,
      name: dto.name,
      description: dto.description,
      schemaVersion: dto.schemaVersion,
      layouts: dto.layouts,
      widgets: dto.widgets.map((widget) => ({
        ...widget,
        presentationConfig: widget.presentationConfig as
          Prisma.InputJsonValue | undefined,
      })),
      layoutItems: dto.layoutItems,
      bindings: dto.bindings.map((binding) => ({
        ...binding,
        queryConfig: binding.queryConfig as Prisma.InputJsonValue | undefined,
      })),
    };
  }

  private toSummaryResponse(record: DashboardSummaryRecord) {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      audience: record.audience,
      schemaVersion: record.schemaVersion,
      revision: record.revision,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toAggregateResponse(record: DashboardAggregateRecord) {
    return {
      ...this.toSummaryResponse(record),
      layouts: record.layouts.map((layout) => ({
        id: layout.id,
        breakpoint: layout.breakpoint,
        columns: layout.columns,
        rowHeight: layout.rowHeight,
        gap: layout.gap,
        items: layout.items.map((item) => ({
          id: item.id,
          // `layoutId` is echoed even though the item is nested inside its layout. The write
          // DTO carries layout items as a flat top-level `layoutItems` array in which the
          // parent layout must be named explicitly (`DashboardLayoutItemDto.layoutId` is
          // @IsUUID, not optional). A read response that omits it forces every client doing
          // read-modify-write to re-attach the parent by hand, and the round-trip fails
          // validation with "layoutId must be a UUID" on a document the server itself wrote.
          layoutId: layout.id,
          widgetId: item.widgetId,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          minWidth: item.minWidth,
          minHeight: item.minHeight,
        })),
      })),
      widgets: record.widgets.map((widget) => ({
        id: widget.id,
        kind: widget.kind,
        title: widget.title,
        schemaVersion: widget.schemaVersion,
        presentationConfig: widget.presentationConfig,
        bindings: widget.bindings.map((binding) => ({
          id: binding.id,
          // Same reason as `layoutId` above: `DashboardBindingDto.widgetId` is a required
          // UUID, and the write DTO takes bindings as a flat array with no nesting to imply
          // the parent widget. Without it the aggregate is readable but not writable, and
          // the failure ("widgetId must be a UUID") names a field the client was never given.
          widgetId: widget.id,
          alias: binding.alias,
          intent: binding.intent,
          mode: binding.mode,
          deviceId: binding.deviceId,
          capabilityId: binding.capabilityId,
          queryConfig: binding.queryConfig,
        })),
      })),
    };
  }

  private isAdmin(context: DashboardTenantContext): boolean {
    return context.role === ADMIN_ROLE || context.role === 'PLATFORM_ADMIN';
  }
}
