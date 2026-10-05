import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { IntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import {
  IntegrationRegistryService,
  INTEGRATION_CREDENTIAL_REF_PREFIX,
  INTEGRATION_LIMITS,
} from './integration-registry.service';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

const PROVIDERS = ['ALEXA', 'GOOGLE_HOME', 'HOME_ASSISTANT', 'MQTT_BRIDGE'] as const;

class RegisterIntegrationDto {
  @IsIn(PROVIDERS)
  provider: (typeof PROVIDERS)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(INTEGRATION_LIMITS.maxDisplayNameLength)
  displayName: string;

  /**
   * A reference into the tenant's secret store, never the secret itself. The service stores it
   * verbatim, so a caller that pastes a raw key here writes a live credential into a table that
   * is listed by the operator UI.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(INTEGRATION_LIMITS.maxCredentialRefLength)
  credentialRef: string;
}

const invalid = (message: string) => new DomainBadRequestException(ERROR_CODES.ValidationFailed, message);

/**
 * User-facing surface for the integration registry.
 *
 * `src/integrations/` had a service, a spec and a module but no controller, and both
 * `integrations` and `integration_sync_state` held zero rows — the registry could only be
 * populated by a test.
 *
 * Deliberately narrow. `setStatus` and `recordSync` are adapter-facing. MQTT_BRIDGE now has a
 * real EMQX-backed adapter, while ALEXA/GOOGLE_HOME/HOME_ASSISTANT remain unimplemented. There is
 * still no generic operator `connect` command because connection needs provider-specific runtime
 * configuration and secret resolution; exposing a universal button would claim a lifecycle the
 * adapters do not share. Registry create/list/delete is the truthful common surface.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin/integrations')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class IntegrationRegistryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: IntegrationRegistryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the active tenant’s registered integrations (tenant admin)' })
  async list(@Request() request: { user: { tenantContext: { tenantId: string } } }) {
    const rows = await this.prisma.integration.findMany({
      where: { tenantId: request.user.tenantContext.tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        provider: true,
        displayName: true,
        status: true,
        lastError: true,
        createdAt: true,
      },
    });
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      // `credentialRef` is deliberately not selected: the list is an operator surface, and the
      // reference is the only pointer to a secret the platform holds.
      note: 'credentialRef tidak ditampilkan di daftar.',
    };
  }

  @Post()
  @ApiOperation({ summary: 'Register an external ecosystem for the active tenant (tenant admin)' })
  async register(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Body() dto: RegisterIntegrationDto,
  ) {
    try {
      const { id } = await this.registry.register({
        tenantId: request.user.tenantContext.tenantId,
        provider: dto.provider,
        displayName: dto.displayName,
        credentialRef: dto.credentialRef,
      });
      return {
        id,
        status: IntegrationStatus.REGISTERED,
        note: 'Integrasi terdaftar. Status REGISTERED hanya membuktikan registry; koneksi provider memerlukan adapter dan konfigurasi runtime yang sesuai.',
      };
    } catch (error) {
      // The service signals invalid input with `Object.assign(new Error(...), { code })`. A
      // plain Error is not an HttpException, so the global filter renders it as 500 — turning
      // a client mistake into a server fault. Translated here rather than left to escape.
      const code = (error as { code?: string })?.code;
      if (code === 'INTEGRATION_NAME_INVALID') {
        throw invalid(`displayName wajib diisi dan maksimal ${INTEGRATION_LIMITS.maxDisplayNameLength} karakter.`);
      }
      if (code === 'INTEGRATION_CREDENTIAL_REF_INVALID') {
        throw invalid(
          `credentialRef wajib berupa referensi ${INTEGRATION_CREDENTIAL_REF_PREFIX}... dan maksimal ${INTEGRATION_LIMITS.maxCredentialRefLength} karakter.`,
        );
      }
      if (code === 'P2002') {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'Provider ini sudah terdaftar di tenant ini.',
        );
      }
      throw error;
    }
  }

  @Delete(':integrationId')
  @ApiOperation({ summary: 'Remove a registered integration (tenant admin)' })
  async remove(
    @Request() request: { user: { tenantContext: { tenantId: string } } },
    @Param('integrationId') integrationId: string,
  ) {
    const row = await this.prisma.integration.findFirst({
      where: { id: integrationId, tenantId: request.user.tenantContext.tenantId },
      select: { id: true },
    });
    if (!row) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Integrasi tidak ditemukan');
    }
    await this.prisma.integration.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  }
}
