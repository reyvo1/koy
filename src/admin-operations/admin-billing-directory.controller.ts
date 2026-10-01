import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';

const MAX_LIST_TAKE = 200;

/**
 * Bounded billing + API-key directory views (blueprint §1 Super Admin).
 * Read-only; tenant-scoped where applicable.
 */
@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
export class AdminBillingDirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('billing/subscriptions')
  @ApiOperation({ summary: 'List tenant subscriptions with plan quotas' })
  async listSubscriptions() {
    const [subscriptions, plans, usage] = await Promise.all([
      this.prisma.billingSubscription.findMany({
        orderBy: [{ createdAt: 'desc' }],
        take: MAX_LIST_TAKE,
        include: { plan: true },
      }),
      this.prisma.billingPlan.findMany({ take: MAX_LIST_TAKE }),
      this.prisma.billingUsage.findMany({ take: MAX_LIST_TAKE }),
    ]);

    return {
      total: subscriptions.length,
      items: subscriptions.map((subscription) => ({
        id: subscription.id,
        tenantId: subscription.tenantId,
        tier: subscription.plan?.tier ?? 'UNKNOWN',
        status: subscription.status,
        deviceQuota: subscription.plan?.deviceQuota ?? null,
        monthlyPriceCents: subscription.plan?.monthlyPriceCents ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      })),
      plans: plans.map((plan) => ({
        id: plan.id,
        tier: plan.tier,
        deviceQuota: plan.deviceQuota,
        telemetryRetentionDays: plan.telemetryRetentionDays,
        monthlyPriceCents: plan.monthlyPriceCents,
      })),
      usageCount: usage.length,
      usage: usage.map((usage) => ({
        tenantId: usage.tenantId,
        periodStart: usage.periodStart.toISOString(),
        deviceCount: usage.deviceCount,
        telemetryPoints: Number(usage.telemetryPoints),
      })),
    };
  }

  // Tenant-scoped API-key listing lives in AdminApiKeysController, next to the create and
  // revoke routes that share the same guard set.
  //
  // It used to sit here, behind this controller's class-level PlatformRoleGuard, while
  // `POST /admin/api-keys` and `DELETE /admin/api-keys/:id` were guarded only by
  // AdminRoleGuard. The result was a tenant admin who could mint a key, see the plaintext
  // once, and then never list their own keys again — a role that can create and destroy a
  // credential but not see it. Moving it keeps the whole tenant key surface on one
  // authorisation rule.

  @Get('audit-logs')
  @ApiOperation({ summary: 'Recent RBAC + share audit entries (bounded)' })
  async listAuditLogs(@Request() request: AdminOperationsRequest) {
    const tenantId = request.user.tenantContext.tenantId;
    const [rbacLogs, shareLogs] = await Promise.all([
      this.prisma.rbacAuditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.shareAuditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const merged = [
      ...rbacLogs.map((log) => ({
        id: log.id,
        source: 'RBAC' as const,
        action: log.action,
        resourceType: log.resourceType,
        resourceId: log.resourceId,
        allowed: log.allowed,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
      ...shareLogs.map((log) => ({
        id: log.id,
        source: 'SHARE' as const,
        action: log.action,
        resourceType: 'device_share',
        resourceId: log.grantId,
        allowed: true,
        detail: log.detail,
        createdAt: log.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 150);

    return { total: merged.length, items: merged };
  }

  @Get('firmware')
  @ApiOperation({ summary: 'List firmware artifacts + OTA rollouts (bounded)' })
  async listFirmware(@Request() request: AdminOperationsRequest) {
    const tenantId = request.user.tenantContext.tenantId;
    const [artifacts, rollouts] = await Promise.all([
      this.prisma.firmwareArtifact.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.otaRollout.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      total: artifacts.length,
      items: artifacts.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        sha256Prefix: `${artifact.sha256.slice(0, 4)}…${artifact.sha256.slice(-4)}`,
        sizeBytes: Number(artifact.sizeBytes),
        createdAt: artifact.createdAt.toISOString(),
      })),
      rollouts: rollouts.map((rollout) => ({
        id: rollout.id,
        firmwareId: rollout.firmwareId,
        status: rollout.status,
        targetCount: Array.isArray(rollout.targetDeviceIds)
          ? rollout.targetDeviceIds.length
          : 0,
        completedCount: Array.isArray(rollout.completedDeviceIds)
          ? rollout.completedDeviceIds.length
          : 0,
        failedCount: Array.isArray(rollout.failedDeviceIds)
          ? rollout.failedDeviceIds.length
          : 0,
        updatedAt: rollout.updatedAt.toISOString(),
      })),
    };
  }
}
