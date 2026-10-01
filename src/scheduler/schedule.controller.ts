import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleDomainValidator } from './schedule-domain.validator';
import {
  DomainBadRequestException,
  DomainNotFoundException,
  DomainServiceUnavailableException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { isSchedulerRuntimeEnabled } from './scheduler-runtime-policy';
import { RbacAuditService } from '../rbac/rbac-audit.service';

@Controller('schedules')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ScheduleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ScheduleDomainValidator,
    private readonly audit: RbacAuditService,
  ) {}

  /**
   * Records who changed a schedule, without deciding who may.
   *
   * `Schedule` has no owner column, so an owner-or-admin rule is not expressible and a role gate
   * would either lock ordinary members out of scheduling or permit everything. These mutations
   * previously left no trace at all, because the policy engine is only reached through
   * `RbacPermissionGuard`. The `detail` says permission came from tenant scope alone, so the row
   * is never mistaken for a role check that passed.
   */
  private recordScheduleMutation(
    request: any,
    scheduleId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
  ): void {
    const { tenantId, membershipId } = request.user.tenantContext;
    void this.audit.recordMutation({
      tenantId,
      membershipId,
      resourceType: 'schedule',
      resourceId: scheduleId,
      action,
      detail:
        'permitted by active tenant membership; schedule has no owner column and no role gate',
    });
  }

  @Post()
  async create(@Request() request: any, @Body() body: Record<string, unknown>) {
    this.validator.validate(body);
    const tenantId = request.user.tenantContext.tenantId;
    const targetSceneId = String(body.targetSceneId);
    const targetScene = await this.prisma.scene.findFirst({
      where: { id: targetSceneId, tenantId },
      select: { id: true },
    });
    if (!targetScene) {
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        'Scene target tidak ditemukan untuk tenant aktif',
      );
    }

    const kind = body.kind as 'CRON' | 'COUNTDOWN';
    const created = await this.prisma.schedule.create({
      data: {
        tenantId,
        name: String(body.name).trim(),
        enabled: false,
        kind,
        expression: kind === 'CRON' ? String(body.expression).trim() : '',
        timezone: (this.validator.resolveTimezone(body.timezone) ?? 'UTC') as string,
        targetSceneId,
        countdownSeconds:
          kind === 'COUNTDOWN'
            ? Math.floor(Number(body.countdownSeconds))
            : null,
        maxRuns: body.maxRuns != null ? Number(body.maxRuns) : null,
        repeat:
          body.repeat === 'ONCE' || body.repeat === 'LIMITED'
            ? (body.repeat as 'ONCE' | 'LIMITED')
            : 'INDEFINITE',
        missedRunPolicy:
          body.missedRunPolicy === 'RUN_IMMEDIATELY'
            ? 'RUN_IMMEDIATELY'
            : 'SKIP_TO_NEXT',
      },
    });
    this.recordScheduleMutation(request, created.id, 'CREATE');
    return created;
  }

  @Get()
  async list(@Request() request: any) {
    return this.prisma.schedule.findMany({
      where: { tenantId: request.user.tenantContext.tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  @Get(':scheduleId')
  async get(
    @Request() request: any,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        tenantId: request.user.tenantContext.tenantId,
      },
    });
  }

  @Post(':scheduleId/enable')
  async setEnabled(
    @Request() request: any,
    @Param('scheduleId') scheduleId: string,
    @Body() body: { enabled: boolean },
  ) {
    this.recordScheduleMutation(request, scheduleId, 'UPDATE');
    const schedule = await this.prisma.schedule.findFirstOrThrow({
      where: {
        id: scheduleId,
        tenantId: request.user.tenantContext.tenantId,
      },
    });
    if (typeof body?.enabled !== 'boolean') {
      throw new DomainBadRequestException(
        ERROR_CODES.BadRequest,
        'enabled wajib boolean',
      );
    }
    const enabled = body.enabled;
    if (enabled && !isSchedulerRuntimeEnabled()) {
      throw new DomainServiceUnavailableException(
        ERROR_CODES.ServiceUnavailable,
        'Runtime scheduler belum diaktifkan oleh operator.',
      );
    }
    const countdownNextRunAt =
      schedule.kind === 'COUNTDOWN'
        ? enabled && schedule.countdownSeconds
          ? new Date(Date.now() + schedule.countdownSeconds * 1000)
          : null
        : undefined;

    return this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        enabled,
        ...(schedule.kind === 'COUNTDOWN'
          ? { nextRunAt: countdownNextRunAt }
          : {}),
      },
    });
  }

  @Get(':scheduleId/runs')
  async runs(
    @Request() request: any,
    @Param('scheduleId') scheduleId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.prisma.scheduleRun.findMany({
      where: {
        tenantId: request.user.tenantContext.tenantId,
        scheduleId,
      },
      select: {
        id: true,
        scheduledFor: true,
        status: true,
        claimedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: [{ scheduledFor: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  @Delete(':scheduleId')
  async remove(@Request() request: any, @Param('scheduleId') scheduleId: string) {
    this.recordScheduleMutation(request, scheduleId, 'DELETE');
    const result = await this.prisma.schedule.deleteMany({
      where: { id: scheduleId, tenantId: request.user.tenantContext.tenantId },
    });
    if (result.count === 0) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Jadwal tidak ditemukan');
    }
    return { id: scheduleId, deleted: true };
  }
}
