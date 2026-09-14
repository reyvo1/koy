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
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PublicApiService } from '../public-api/public-api.service';
import { AdminRoleGuard } from './admin-role.guard';
import { PlatformRoleGuard } from './platform-role.guard';
import { AdminOperationsRequest } from './admin-operational-summary.types';
import {
  CreateApiKeyDto,
  PlatformCreateApiKeyDto,
} from './dto/admin-api-keys.dto';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * Admin API-key lifecycle (Modul 21 exposed to the panel): create returns the
 * plaintext exactly once; revoke flips status so existing integrations fail
 * closed on the next request.
 */
@ApiTags('admin-operations')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('admin')
export class AdminApiKeysController {
  constructor(
    private readonly publicApi: PublicApiService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('platform-api-keys')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'List API keys across tenants (platform admin)' })
  async listPlatformKeys() {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    });
    return {
      total: keys.length,
      items: keys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        status: key.status,
        scopes: key.scopes,
        tenantName: key.tenant.name,
        lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
        expiresAt: key.expiresAt?.toISOString() ?? null,
        createdAt: key.createdAt.toISOString(),
      })),
    };
  }

  @Post('platform-api-keys')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Create an API key for any tenant (platform admin)' })
  async createPlatformKey(@Body() dto: PlatformCreateApiKeyDto) {
    const result = await this.publicApi.createApiKey({
      tenantId: dto.tenantId,
      name: dto.name,
      scopes: [...dto.scopes],
    });
    return { ...result, expiresInSeconds: null, note: 'Plaintext hanya ditampilkan sekali.' };
  }

  @Delete('platform-api-keys/:keyId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard, PlatformRoleGuard)
  @ApiOperation({ summary: 'Revoke any API key (platform admin)' })
  async revokePlatformKey(@Param('keyId') keyId: string) {
    return this.revoke(keyId);
  }

  @Post('api-keys')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Create an API key for the active tenant (tenant admin)' })
  async createTenantKey(
    @Request() request: AdminOperationsRequest,
    @Body() dto: CreateApiKeyDto,
  ) {
    const result = await this.publicApi.createApiKey({
      tenantId: request.user.tenantContext.tenantId,
      name: dto.name,
      scopes: [...dto.scopes],
    });
    return { ...result, expiresInSeconds: null, note: 'Plaintext hanya ditampilkan sekali.' };
  }

  @Delete('api-keys/:keyId')
  @UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
  @ApiOperation({ summary: 'Revoke an API key of the active tenant (tenant admin)' })
  async revokeTenantKey(
    @Request() request: AdminOperationsRequest,
    @Param('keyId') keyId: string,
  ) {
    return this.revoke(keyId, request.user.tenantContext.tenantId);
  }

  private async revoke(keyId: string, tenantId?: string) {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!key || (tenantId && key.tenantId !== tenantId)) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'API key tidak ditemukan');
    }
    if (key.status === ApiKeyStatus.REVOKED) {
      return { id: keyId, status: 'REVOKED', message: 'Key sudah dicabut' };
    }
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { status: ApiKeyStatus.REVOKED },
    });
    return { id: keyId, status: 'REVOKED', message: 'API key dicabut; integrasi aktif akan ditolak' };
  }
}
