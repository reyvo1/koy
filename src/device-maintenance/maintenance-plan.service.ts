import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RbacAuditService } from '../rbac/rbac-audit.service';
import type { MaintenanceRequest } from './device-maintenance.controller';

@Injectable()
export class MaintenancePlanService {
  private readonly logger = new Logger(MaintenancePlanService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: RbacAuditService,
  ) {}
  get runtimeEnabled() {
    return process.env.MAINTENANCE_SCHEDULER_ENABLED === 'true';
  }
  async list(tenantId: string) {
    const items = await this.prisma.maintenancePlan.findMany({
      where: { tenantId },
      orderBy: { nextDueAt: 'asc' },
      take: 200,
      include: { device: { select: { name: true } } },
    });
    return { items, runtimeEnabled: this.runtimeEnabled, limit: 200 };
  }
  async create(req: MaintenanceRequest, body: any) {
    if (!this.runtimeEnabled)
      throw new ServiceUnavailableException(
        'Scheduler maintenance belum aktif.',
      );
    if (
      !body ||
      body.tenantId !== undefined ||
      typeof body.deviceId !== 'string' ||
      typeof body.reason !== 'string' ||
      !body.reason.trim() ||
      body.reason.length > 500 ||
      !Number.isInteger(body.intervalHours) ||
      body.intervalHours < 1 ||
      body.intervalHours > 8760 ||
      typeof body.nextDueAt !== 'string' ||
      !Number.isFinite(Date.parse(body.nextDueAt))
    )
      throw new BadRequestException('Jadwal maintenance tidak valid.');
    const { tenantId, membershipId } = req.user.tenantContext;
    if (
      !(await this.prisma.device.findFirst({
        where: { id: body.deviceId, tenantId, status: { not: 'REVOKED' } },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Perangkat tidak ditemukan.');
    const plan = await this.prisma.maintenancePlan.create({
      data: {
        tenantId,
        deviceId: body.deviceId,
        actorMembershipId: membershipId,
        reason: body.reason.trim(),
        intervalHours: body.intervalHours,
        nextDueAt: new Date(body.nextDueAt),
      },
    });
    await this.audit.recordMutation({
      tenantId,
      membershipId,
      resourceType: 'maintenance-plan',
      resourceId: plan.id,
      action: 'CREATE',
      detail: 'Created through active tenant admin scope.',
    });
    return plan;
  }
  async setEnabled(req: MaintenanceRequest, id: string, enabled: unknown) {
    if (typeof enabled !== 'boolean')
      throw new BadRequestException('enabled harus boolean.');
    if (enabled && !this.runtimeEnabled)
      throw new ServiceUnavailableException(
        'Scheduler maintenance belum aktif.',
      );
    const { tenantId, membershipId } = req.user.tenantContext;
    const result = await this.prisma.maintenancePlan.updateMany({
      where: { id, tenantId },
      data: { enabled, actorMembershipId: membershipId },
    });
    if (!result.count) throw new NotFoundException('Jadwal tidak ditemukan.');
    await this.audit.recordMutation({
      tenantId,
      membershipId,
      resourceType: 'maintenance-plan',
      resourceId: id,
      action: 'UPDATE',
      detail: enabled
        ? 'Enabled by active tenant admin.'
        : 'Disabled by active tenant admin.',
    });
    return { id, enabled };
  }
  async tick(now = new Date()) {
    if (!this.runtimeEnabled) return { opened: 0, skipped: 0, disabled: true };
    const plans = await this.prisma.maintenancePlan.findMany({
      where: { enabled: true, nextDueAt: { lte: now } },
      orderBy: { nextDueAt: 'asc' },
      take: 100,
    });
    let opened = 0,
      skipped = 0,
      failed = 0;
    for (const plan of plans) {
      try {
        const window = await this.prisma.$transaction(async (tx) => {
          if (!plan.actorMembershipId) {
            await tx.maintenancePlan.updateMany({
              where: { id: plan.id, tenantId: plan.tenantId },
              data: { enabled: false },
            });
            return null;
          }
          const member = await tx.membership.findFirst({
            where: {
              id: plan.actorMembershipId,
              tenantId: plan.tenantId,
              status: 'ACTIVE',
              role: { in: ['ADMIN', 'PLATFORM_ADMIN'] },
            },
            select: { userId: true },
          });
          const device = await tx.device.findFirst({
            where: {
              id: plan.deviceId,
              tenantId: plan.tenantId,
              status: { not: 'REVOKED' },
            },
            select: { id: true },
          });
          if (!member || !device) {
            await tx.maintenancePlan.updateMany({
              where: { id: plan.id, tenantId: plan.tenantId },
              data: { enabled: false },
            });
            return null;
          }
          const period = plan.intervalHours * 3600000;
          const nextDueAt = new Date(
            plan.nextDueAt.getTime() +
              (Math.floor((now.getTime() - plan.nextDueAt.getTime()) / period) +
                1) *
                period,
          );
          const claim = await tx.maintenancePlan.updateMany({
            where: {
              id: plan.id,
              tenantId: plan.tenantId,
              enabled: true,
              nextDueAt: plan.nextDueAt,
              actorMembershipId: plan.actorMembershipId,
            },
            data: { nextDueAt },
          });
          if (!claim.count) return null;
          const existing = await tx.deviceMaintenance.findFirst({
            where: {
              deviceId: plan.deviceId,
              tenantId: plan.tenantId,
              status: 'OPEN',
            },
            select: { id: true },
          });
          if (existing) return null;
          return tx.deviceMaintenance.create({
            data: {
              tenantId: plan.tenantId,
              deviceId: plan.deviceId,
              reason: plan.reason,
              openedByUserId: member.userId,
              planId: plan.id,
              scheduledFor: plan.nextDueAt,
            },
          });
        });
        if (window && plan.actorMembershipId) {
          opened++;
          await this.audit.recordMutation({
            tenantId: plan.tenantId,
            membershipId: plan.actorMembershipId,
            resourceType: 'device-maintenance',
            resourceId: window.id,
            action: 'CREATE',
            detail: `Scheduled occurrence ${plan.nextDueAt.toISOString()} of maintenance plan ${plan.id}; active tenant admin revalidated.`,
          });
        } else skipped++;
      } catch (cause) {
        if (
          cause instanceof Prisma.PrismaClientKnownRequestError &&
          cause.code === 'P2002'
        ) {
          skipped++;
          continue;
        }
        failed++;
        this.logger.error({
          event: 'maintenance.plan.occurrence_failed',
          planId: plan.id,
        });
      }
    }
    return { opened, skipped, failed, disabled: false };
  }
  @Interval(60000)
  async scheduledTick() {
    try {
      await this.tick();
    } catch {
      this.logger.error({ event: 'maintenance.plan.tick_failed' });
    }
  }
}
