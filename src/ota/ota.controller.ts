import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OtaRolloutStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { RbacAuditService } from '../rbac/rbac-audit.service';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  CreateFirmwareArtifactDto,
  CreateRolloutDto,
  RecordRolloutProgressDto,
  TransitionRolloutDto,
} from './dto/ota.dto';
import { OtaRolloutRepository } from './ota-rollout.repository';

/**
 * Module 15 REST surface: the write half of firmware & OTA.
 *
 * `OtaRolloutRepository` shipped a complete forward-only rollout state machine, a domain
 * validator, six unit tests, and a `FirmwareArtifact` / `OtaRollout` schema — and none of it
 * was reachable. `OtaModule` registered only the validator, so the repository could not be
 * injected anywhere; no controller declared a rollout route; and the Super Admin "Firmware &
 * OTA" screen issued exactly one GET. A rollout could therefore only be created by writing
 * straight to `ota_rollouts`, and the console's rollout list could never show a row this
 * product created. Wave 3's rollback evidence is produced by `run-wave3-esp32-simulation.mjs`
 * against a local HTTPS server, which means the platform-side rollout machinery was never
 * exercised at all.
 *
 * Gating: `AdminRoleGuard`, not `@RequirePermission`. `FirmwareArtifact` and `OtaRollout`
 * have no owner column, so an owner-or-admin rule is not expressible. Scene/Schedule are also
 * ownerless but derive authorization from referenced devices; OTA instead uses an admin role
 * because a rollout pushes firmware to every targeted device
 * in the tenant, so "any member may do it" is not acceptable either. The precedent for a
 * tenant-wide, ownerless, high-blast-radius action is the org surface
 * (`organization.controller.ts`): role-gated, tenant-scoped. The catalog has no `firmware.*`
 * permission and inventing one would change the authorisation contract rather than expose
 * an existing one, so it is deliberately not done here.
 *
 * Tenant scope comes from the verified `tenantContext`, never from a body field, so a caller
 * cannot address another tenant's artifact or rollout by id.
 */
@ApiTags('ota')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('ota')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class OtaController {
  constructor(
    private readonly rollouts: OtaRolloutRepository,
    private readonly audit: RbacAuditService,
  ) {}

  @Post('firmware-artifacts')
  @ApiOperation({ summary: 'Register a firmware artifact (URL + SHA-256 reference)' })
  async createArtifact(
    @Request() request: OtaRequest,
    @Body() dto: CreateFirmwareArtifactDto,
  ) {
    const tenantId = this.tenantId(request);
    const artifact = await this.translated(() =>
      this.rollouts.createArtifact(tenantId, {
        version: dto.version,
        artifactUrl: dto.artifactUrl,
        sha256: dto.sha256,
        sizeBytes: dto.sizeBytes,
        compatibleModels: dto.compatibleModels,
        releaseNotes: dto.releaseNotes,
      }),
    );
    this.record(request, artifact.id, 'CREATE', `version=${dto.version}`);
    return {
      id: artifact.id,
      version: artifact.version,
      sha256: artifact.sha256,
      sizeBytes: Number(artifact.sizeBytes),
      compatibleModels: artifact.compatibleModels,
      createdAt: artifact.createdAt.toISOString(),
    };
  }

  @Post('rollouts')
  @ApiOperation({ summary: 'Create a DRAFT rollout targeting 1..500 devices' })
  async createRollout(@Request() request: OtaRequest, @Body() dto: CreateRolloutDto) {
    const tenantId = this.tenantId(request);
    const rollout = await this.translated(() =>
      this.rollouts.createRollout({
        tenantId,
        firmwareId: dto.firmwareId,
        targetDeviceIds: dto.targetDeviceIds,
      }),
    );
    this.record(
      request,
      rollout.id,
      'CREATE',
      `firmwareId=${dto.firmwareId} targets=${dto.targetDeviceIds.length}`,
    );
    return {
      id: rollout.id,
      firmwareId: rollout.firmwareId,
      status: rollout.status,
      targetCount: (rollout.targetDeviceIds as string[]).length,
    };
  }

  @Post('rollouts/:rolloutId/transition')
  @ApiOperation({
    summary: 'Advance a rollout through the forward-only state machine',
  })
  async transition(
    @Request() request: OtaRequest,
    @Param('rolloutId') rolloutId: string,
    @Body() dto: TransitionRolloutDto,
  ) {
    const tenantId = this.tenantId(request);
    await this.translated(() =>
      this.rollouts.transition(tenantId, rolloutId, dto.status as OtaRolloutStatus),
    );
    this.record(request, rolloutId, 'UPDATE', `status=${dto.status}`);
    return { id: rolloutId, status: dto.status };
  }

  @Post('rollouts/:rolloutId/progress')
  @ApiOperation({
    summary: 'Report per-device OTA outcomes; finalises the rollout when all targets report',
  })
  async recordProgress(
    @Request() request: OtaRequest,
    @Param('rolloutId') rolloutId: string,
    @Body() dto: RecordRolloutProgressDto,
  ) {
    const tenantId = this.tenantId(request);
    const result = await this.translated(() =>
      this.rollouts.recordProgress({
        tenantId,
        rolloutId,
        succeededDeviceIds: dto.succeededDeviceIds,
        failedDeviceIds: dto.failedDeviceIds,
      }),
    );
    this.record(
      request,
      rolloutId,
      'UPDATE',
      `succeeded=${result.completedCount} failed=${result.failedCount} status=${result.status}`,
    );
    return { id: rolloutId, ...result };
  }

  @Get('rollouts/:rolloutId')
  @ApiOperation({ summary: 'Read one rollout of the active tenant' })
  async read(@Request() request: OtaRequest, @Param('rolloutId') rolloutId: string) {
    const tenantId = this.tenantId(request);
    return this.translated(async () => {
      const rollout = await this.rollouts.findRollout(tenantId, rolloutId);
      if (!rollout) {
        throw new DomainNotFoundException(
          ERROR_CODES.OtaRolloutNotFound,
          'Rollout not found in this tenant.',
        );
      }
      return {
        id: rollout.id,
        firmwareId: rollout.firmwareId,
        status: rollout.status,
        targetDeviceIds: rollout.targetDeviceIds,
        completedDeviceIds: rollout.completedDeviceIds,
        failedDeviceIds: rollout.failedDeviceIds,
        createdAt: rollout.createdAt.toISOString(),
      };
    });
  }

  private tenantId(request: OtaRequest): string {
    const tenantId = request.user?.tenantContext?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.length === 0) {
      // TenantContextGuard has already rejected a request without one, so reaching this is
      // a contract violation rather than something a client can fix.
      throw new DomainBadRequestException(
        ERROR_CODES.TenantMembershipInvalid,
        'Tenant membership context is required to manage firmware rollouts.',
      );
    }
    return tenantId;
  }

  /**
   * Records who changed a rollout, without deciding who may.
   *
   * `OtaRollout` has no owner column, so an owner-or-admin rule is not expressible. Without
   * this row a firmware push would leave no trace anywhere, because the policy engine is only
   * reached through `RbacPermissionGuard` and this controller is role-gated instead. The
   * `detail` states that permission came from the tenant-admin role gate, so the row is never
   * mistaken for an owner check that passed.
   */
  private record(
    request: OtaRequest,
    resourceId: string,
    action: 'CREATE' | 'UPDATE',
    detail: string,
  ): void {
    const { tenantId, membershipId } = request.user.tenantContext;
    void this.audit.recordMutation({
      tenantId,
      membershipId,
      resourceType: 'ota',
      resourceId,
      action,
      detail: `${detail}; permitted by AdminRoleGuard, ota has no owner column`,
    });
  }

  /**
   * `OtaRolloutRepository` and `OtaDomainValidator` signal refusals by throwing a plain
   * Error / `OtaDomainError` carrying a `code`. `GlobalExceptionFilter` only maps
   * HttpException, so without this translation every operator mistake would reach the client
   * as 500 INTERNAL_ERROR — a bad sha256 reported as a server fault, which is exactly the
   * class of ambiguous result the acceptance evidence rules refuse to accept as a pass.
   */
  private async translated<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw this.toDomainError(error);
    }
  }

  private toDomainError(error: unknown): unknown {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code !== 'string' || !code.startsWith('OTA_')) {
      return error;
    }
    switch (code) {
      case ERROR_CODES.OtaVersionInvalid:
      case ERROR_CODES.OtaUrlInvalid:
      case ERROR_CODES.OtaSha256Invalid:
      case ERROR_CODES.OtaSizeInvalid:
      case ERROR_CODES.OtaModelsInvalid:
      case ERROR_CODES.OtaTargetsInvalid:
      case ERROR_CODES.OtaInvalidIdentity:
        return new DomainBadRequestException(code, (error as Error).message);
      case ERROR_CODES.OtaTargetsNotInTenant:
        // 400, not 403: a device that is not in this tenant is simply not addressable
        // here, and a 403 would confirm the id exists somewhere.
        return new DomainBadRequestException(
          code,
          'Satu atau lebih perangkat target bukan milik tenant ini.',
        );
      case ERROR_CODES.OtaVersionAlreadyExists:
        // 409 with no detail about the stored artifact: a duplicate POST must not become a
        // read of the digest the caller did not supply.
        return new DomainConflictException(
          code,
          'Versi firmware sudah terdaftar untuk tenant ini.',
        );
      case ERROR_CODES.OtaStatusTransitionInvalid:
        return new DomainConflictException(
          code,
          'Rollout state changes must follow the forward-only state machine.',
        );
      case ERROR_CODES.OtaRolloutNotFound:
        return new DomainNotFoundException(code, 'Rollout not found in this tenant.');
      case ERROR_CODES.OtaTransitionConflict:
      case ERROR_CODES.OtaRolloutNotInProgress:
        return new DomainConflictException(code, (error as Error).message);
      default:
        return error;
    }
  }
}

export interface OtaRequest {
  user: {
    userId: string;
    tenantContext: { tenantId: string; membershipId: string; role: string };
  };
}
