import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { BillingQuotaService } from '../billing/billing-quota.service';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  COMMAND_LOG_LIMITS,
  DeviceCommandLogService,
} from './device-command-log.service';
import { DeviceLocationService } from './device-location.service';
import {
  DomainBadRequestException,
  DomainPaymentRequiredException,
} from '../common/errors/domain-exceptions';
import { DeviceService } from './device.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import {
  RbacPermissionGuard,
  RequirePermission,
} from '../rbac/rbac-permission.guard';
import { CreateDeviceDto, AssignOwnerDto } from './dto/device.dto';
import { DeviceAccessGuard, RequireDeviceAccess } from './device-access.guard';

@Controller('devices')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard, DeviceAccessGuard)
export class DeviceController {
  constructor(
    private deviceService: DeviceService,
    private billingQuota: BillingQuotaService,
  
    private readonly commandLogService: DeviceCommandLogService,
    private readonly locationService: DeviceLocationService,
  ) {}

  @Post(':id/provision')
  @RequirePermission('device.provision')
  async provision(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.provision(req.user.tenantContext.tenantId, id);
  }

  @Patch(':id/owner')
  @RequirePermission('device.assignOwner')
  async assignOwner(@Request() req: any, @Param('id') id: string, @Body() dto: AssignOwnerDto) {
    return this.deviceService.assignOwner(req.user.tenantContext.tenantId, id, dto.userId);
  }

  @Patch(':id/revoke')
  @RequirePermission('device.update')
  async revoke(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.revoke(req.user.tenantContext.tenantId, id);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.deviceService.findAll(req.user.tenantContext.tenantId, {
      userId: req.user.userId,
      membershipId: req.user.tenantContext.membershipId,
      role: req.user.tenantContext.role,
    });
  }

  /**
   * GET /devices/:id/command-log — what was sent to this device, and what came back.
   *
   * Reads `DeviceCommand`, not telemetry: this is the platform's outbound half of the story and
   * telemetry is the device's own. The technician log tab asked for exactly this and was told it did
   * not exist.
   *
   * Declared before `:id` for the same reason every sibling is — a literal segment must be matched
   * before a parameter, or this route would be swallowed by `findOne`.
   */
  /**
   * GET /devices/:id/location — latest fix and bounded history for one device.
   *
   * Declared before `:id/command-log` so the two literal segments stay distinct, and before `:id` so
   * the parameter route cannot swallow it.
   */
  /**
   * POST /devices/:id/location — record a GPS fix.
   *
   * Append-only on purpose: each fix is a row, because the question a NOC actually asks is "where was
   * this device when it went offline", and a single overwritten position answers that wrongly. See
   * `DeviceLocationService`.
   *
   * `recordedAt` is accepted rather than stamped, so a device that buffered fixes while offline
   * reports them when it reconnects without the whole batch collapsing onto one timestamp.
   */
  @Post(':id/location')
  @RequireDeviceAccess('CONTROL')
  async recordLocation(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { latitude?: number; longitude?: number; label?: string; recordedAt?: string },
  ) {
    return this.locationService.recordFix({
      tenantId: req.user.tenantContext.tenantId,
      deviceId: id,
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      label: body.label ?? null,
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
    });
  }

  @Get(':id/location')
  @RequireDeviceAccess('VIEW')
  async location(
    @Request() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit === undefined ? undefined : Number(limit);
    if (parsed !== undefined && !Number.isInteger(parsed)) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'limit harus bilangan bulat.');
    }
    return this.locationService.historyFor({
      tenantId: req.user.tenantContext.tenantId,
      deviceId: id,
      limit: parsed,
    });
  }

  @Get(':id/command-log')
  @RequireDeviceAccess('VIEW')
  async commandLog(
    @Request() req: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit === undefined ? undefined : Number(limit);
    if (parsed !== undefined && !Number.isInteger(parsed)) {
      throw new DomainBadRequestException(ERROR_CODES.BadRequest, 'limit must be an integer.');
    }
    return this.commandLogService.listForDevice(
      req.user.tenantContext.tenantId,
      id,
      parsed ?? COMMAND_LOG_LIMITS.defaultLimit,
    );
  }

  @Get(':id')
  @RequireDeviceAccess('VIEW')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.findOne(req.user.tenantContext.tenantId, id);
  }

  @Get(':id/health')
  @RequireDeviceAccess('VIEW')
  async health(@Request() req: any, @Param('id') id: string) {
    return this.deviceService.checkHealth(req.user.tenantContext.tenantId, id);
  }

  @Post()
  @RequirePermission('device.update')
  async create(@Request() req: any, @Body() dto: CreateDeviceDto) {
    // Enforce the plan's device quota before creating.
    //
    // BillingQuotaService shipped fully implemented — plan lookup, device count, deny
    // logging — but nothing ever called it, so a tenant could provision devices past its
    // plan's limit indefinitely while the quota screen reported the plan as enforced.
    // A quota that is displayed but not applied is worse than no quota: it looks like a
    // control and is not one.
    const quota = await this.billingQuota.checkDeviceQuota({
      tenantId: req.user.tenantContext.tenantId,
      additionalDevices: 1,
    });
    if (!quota.allowed) {
      // `quota` is null when the tenant has no subscription at all, and the quota check now
      // fails closed in that case. Telling such a tenant "Kuota perangkat habis: 6/null"
      // would point the operator at the wrong problem: nothing is exhausted, there is simply
      // no plan to measure against.
      //
      // This must be an `HttpException`. The previous shape —
      // `Object.assign(new Error(msg), { code, status: 402 })` — is a plain `Error` with a
      // `status` property that `GlobalExceptionFilter` never reads, so the denial answered
      // 500 INTERNAL_ERROR. Observed live before this fix: `http.error.unhandled` with
      // statusCode 500 carrying code BILLING_DEVICE_QUOTA_EXCEEDED.
      const message =
        quota.reason === 'NO_SUBSCRIPTION'
          ? 'Tenant ini belum punya langganan, jadi kuota perangkatnya tidak dapat diukur. ' +
            'Tetapkan paket tenant terlebih dahulu.'
          : `Kuota perangkat habis: ${quota.currentCount}/${quota.quota}. ` +
            'Naikkan paket tenant atau cabut perangkat yang tidak dipakai.';
      throw new DomainPaymentRequiredException(
        ERROR_CODES.BillingDeviceQuotaExceeded,
        message,
      );
    }
    return this.deviceService.create(req.user.tenantContext.tenantId, dto);
  }
}
