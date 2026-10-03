import {
  Controller,
  Get,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { NotificationService } from './notification.service';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';

/**
 * Tenant-scoped notification delivery log.
 *
 * The delivery worker, the transports and the durable queue all shipped without any HTTP
 * surface, so an operator had no way to answer the only question that matters about a
 * notification system: did it actually send, and if not, why not? Admin Web's
 * `/tenant/notifikasi` page silently redirected to analytics findings, which is a
 * different domain entirely and told the operator nothing about delivery.
 *
 * This controller is read-only by design. The write path stays internal: notifications
 * are produced by the system's own workflows (auth verification, password reset, command
 * dispatch), never hand-written by an operator, so there is no create route an operator
 * could misuse. Delivery is retried by the worker, not by hand.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  async list(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notifications.listForOperator(
      request.user.tenantContext.tenantId,
      status,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('summary')
  async summary(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
  ) {
    return this.notifications.summarize(request.user.tenantContext.tenantId);
  }

  @Get(':notificationId')
  async findOne(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('notificationId') notificationId: string,
  ) {
    return this.notifications.findForOperator(
      request.user.tenantContext.tenantId,
      notificationId,
    );
  }
}
