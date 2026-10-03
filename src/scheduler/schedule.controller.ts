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
  DomainForbiddenException,
  DomainNotFoundException,
  DomainServiceUnavailableException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import { isSchedulerRuntimeEnabled } from './scheduler-runtime-policy';
import { RbacAuditService } from '../rbac/rbac-audit.service';
import { SceneRepository } from '../scene/scene.repository';
import { SceneAccessService } from '../scene/scene-access.service';
import type { DeviceAccessContext } from '../device/device-access.service';

@Controller('schedules')
@UseGuards(JwtAuthGuard, TenantContextGuard)
export class ScheduleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ScheduleDomainValidator,
    private readonly audit: RbacAuditService,
    private readonly scenes: SceneRepository,
    private readonly sceneAccess: SceneAccessService,
  ) {}

  private accessContext(request: any): DeviceAccessContext {
    return {
      tenantId: request.user.tenantContext.tenantId,
      membershipId: request.user.tenantContext.membershipId,
      userId: request.user.userId,
      role: request.user.tenantContext.role,
    };
  }

  private async assertTargetSceneAccess(request: any, targetSceneId: string | null, level: 'VIEW' | 'CONTROL') {
    if (!targetSceneId) {
      if (request.user.tenantContext.role === 'ADMIN' || request.user.tenantContext.role === 'PLATFORM_ADMIN') return;
      throw new DomainForbiddenException(ERROR_CODES.RbacPermissionDenied, 'Schedule without a target scene is restricted to administrators');
    }
    const scene = await this.scenes.findTenantScene(request.user.tenantContext.tenantId, targetSceneId);
    await this.sceneAccess.assertSceneAccess(this.accessContext(request), scene, level);
  }

  /**
   * Records who changed a schedule after target-scene device authorization succeeds.
   *
   * `Schedule` has no owner column, so authorization follows its target Scene. VIEW is required
   * for schedule reads and CONTROL over every Scene action device is required for mutations.
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
        'permitted after tenant membership plus target-scene device authorization',
    });
  }

  @Post()
  async create(@Request() request: any, @Body() body: Record<string, unknown>) {
    this.validator.validate(body);
    const tenantId = request.user.tenantContext.tenantId;
    const targetSceneId = String(body.targetSceneId);
    const targetScene = await this.scenes.findTenantScene(tenantId, targetSceneId).catch(() => null);
    if (!targetScene) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Scene target tidak ditemukan untuk tenant aktif');
    }
    await this.sceneAccess.assertSceneAccess(this.accessContext(request), targetScene, 'CONTROL');

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
    const rows = await this.prisma.schedule.findMany({
      where: { tenantId: request.user.tenantContext.tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (request.user.tenantContext.role === 'ADMIN' || request.user.tenantContext.role === 'PLATFORM_ADMIN') return rows;
    const visible = [];
    for (const row of rows) {
      try {
        await this.assertTargetSceneAccess(request, row.targetSceneId, 'VIEW');
        visible.push(row);
      } catch {
        // A MEMBER must not learn schedule metadata for a scene whose devices are not viewable.
      }
    }
    return visible;
  }

  @Get(':scheduleId')
  async get(
    @Request() request: any,
    @Param('scheduleId') scheduleId: string,
  ) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenantId: request.user.tenantContext.tenantId },
    });
    if (!schedule) return null;
    await this.assertTargetSceneAccess(request, schedule.targetSceneId, 'VIEW');
    return schedule;
  }

  @Post(':scheduleId/enable')
  async setEnabled(
    @Request() request: any,
    @Param('scheduleId') scheduleId: string,
    @Body() body: { enabled: boolean },
  ) {
    const schedule = await this.prisma.schedule.findFirstOrThrow({
      where: {
        id: scheduleId,
        tenantId: request.user.tenantContext.tenantId,
      },
    });
    await this.assertTargetSceneAccess(request, schedule.targetSceneId, 'CONTROL');
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

    this.recordScheduleMutation(request, scheduleId, 'UPDATE');
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
    const schedule = await this.prisma.schedule.findFirst({ where: { id: scheduleId, tenantId: request.user.tenantContext.tenantId } });
    if (!schedule) throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Jadwal tidak ditemukan');
    await this.assertTargetSceneAccess(request, schedule.targetSceneId, 'VIEW');
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
    const schedule = await this.prisma.schedule.findFirst({ where: { id: scheduleId, tenantId: request.user.tenantContext.tenantId } });
    if (!schedule) throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Jadwal tidak ditemukan');
    await this.assertTargetSceneAccess(request, schedule.targetSceneId, 'CONTROL');
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
