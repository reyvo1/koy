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
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import {
  RbacPermissionGuard,
  RequirePermission,
} from '../rbac/rbac-permission.guard';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * Device groups (ADR-005) — logical grouping tenant-scoped. Hapus grup
 * tidak menghapus perangkat; keanggotaan dibatasi perangkat tenant sendiri.
 */

interface TenantRequest {
  user: { tenantContext: { tenantId: string; membershipId: string; role: string } };
}

const NAME_MAX = 80;

function parseCreateBody(body: unknown): { name: string; description?: string } {
  if (!body || typeof body !== 'object') {
    throw new DomainBadRequestException(
      ERROR_CODES.DashboardInvalidInput,
      'Body tidak valid',
    );
  }
  const record = body as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > NAME_MAX) {
    throw new DomainBadRequestException(
      ERROR_CODES.DashboardInvalidInput,
      `Nama grup wajib 1..${NAME_MAX} karakter`,
    );
  }
  const description =
    typeof record.description === 'string' && record.description.trim()
      ? record.description.trim().slice(0, 300)
      : undefined;
  return { name, description };
}

function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new DomainBadRequestException(
      ERROR_CODES.DashboardInvalidInput,
      `${field} tidak valid`,
    );
  }
}

@Controller('device-groups')
@UseGuards(JwtAuthGuard, TenantContextGuard, RbacPermissionGuard)
export class DeviceGroupController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @RequirePermission('device.update')
  async create(
    @Request() request: TenantRequest,
    @Body() body: { name?: string; description?: string; deviceIds?: string[] },
  ) {
    const parsed = parseCreateBody(body);
    const tenantId = request.user.tenantContext.tenantId;
    const deviceIds = [
      ...new Set(
        (Array.isArray(body?.deviceIds) ? body.deviceIds : []) as string[],
      ),
    ];
    for (const id of deviceIds) assertUuid(id, 'deviceId');

    if (deviceIds.length > 0) {
      const tenantDevices = await this.prisma.device.findMany({
        where: { tenantId, id: { in: deviceIds } },
        select: { id: true },
      });
      const tenantDeviceIds = new Set(tenantDevices.map((device) => device.id));
      if (deviceIds.some((deviceId) => !tenantDeviceIds.has(deviceId))) {
        throw new DomainBadRequestException(
          ERROR_CODES.DashboardInvalidInput,
          'Ada deviceId tidak dikenal pada tenant ini',
        );
      }
    }

    try {
      const group = await this.prisma.deviceGroup.create({
        data: {
          tenantId,
          name: parsed.name,
          description: parsed.description,
          members: {
            create: deviceIds.map((deviceId) => ({
              deviceId,
            })),
          },
        },
        select: { id: true, name: true, createdAt: true },
      });
      return { ...group, createdAt: group.createdAt.toISOString() };
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      if (code === 'P2002') {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'Nama grup sudah dipakai — pilih nama lain',
        );
      }
      if (code === 'P2003') {
        throw new DomainBadRequestException(
          ERROR_CODES.DashboardInvalidInput,
          'Ada deviceId tidak dikenal pada tenant ini',
        );
      }
      throw cause;
    }
  }

  @Get()
  async list(@Request() request: TenantRequest) {
    const tenantId = request.user.tenantContext.tenantId;
    const groups = await this.prisma.deviceGroup.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      include: {
        members: {
          // Historical builds did not validate same-tenant membership on write.
          // Filter on read as defense-in-depth so legacy poisoned rows cannot
          // expose another tenant's device metadata.
          where: { device: { tenantId } },
          include: { device: { select: { id: true, name: true, status: true } } },
        },
      },
    });
    return {
      total: groups.length,
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        createdAt: g.createdAt.toISOString(),
        devices: g.members.map((m) => ({
          id: m.device.id,
          name: m.device.name,
          status: m.device.status,
        })),
      })),
    };
  }

  @Post(':groupId/members')
  @RequirePermission('device.update')
  async addMember(
    @Request() request: TenantRequest,
    @Param('groupId') groupId: string,
    @Body() body: { deviceId?: string },
  ) {
    assertUuid(groupId, 'groupId');
    assertUuid(body?.deviceId, 'deviceId');
    const tenantId = request.user.tenantContext.tenantId;
    const [group, device] = await Promise.all([
      this.prisma.deviceGroup.findFirst({
        where: { id: groupId, tenantId },
        select: { id: true },
      }),
      this.prisma.device.findFirst({
        where: { id: body.deviceId, tenantId },
        select: { id: true },
      }),
    ]);
    if (!group) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Grup tidak ditemukan');
    }
    if (!device) {
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardInvalidInput,
        'deviceId tidak dikenal pada tenant ini',
      );
    }
    try {
      await this.prisma.deviceGroupMember.create({
        data: { groupId, deviceId: body?.deviceId ?? '' },
      });
      return { groupId, deviceId: body?.deviceId, added: true };
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      if (code === 'P2002') {
        throw new DomainConflictException(ERROR_CODES.Conflict, 'Perangkat sudah di grup');
      }
      if (code === 'P2003') {
        throw new DomainBadRequestException(
          ERROR_CODES.DashboardInvalidInput,
          'deviceId tidak dikenal pada tenant ini',
        );
      }
      throw cause;
    }
  }

  @Delete(':groupId/members/:deviceId')
  @RequirePermission('device.update')
  async removeMember(
    @Request() request: TenantRequest,
    @Param('groupId') groupId: string,
    @Param('deviceId') deviceId: string,
  ) {
    assertUuid(groupId, 'groupId');
    assertUuid(deviceId, 'deviceId');
    const result = await this.prisma.deviceGroupMember.deleteMany({
      where: {
        groupId,
        deviceId,
        group: { tenantId: request.user.tenantContext.tenantId },
      },
    });
    if (result.count === 0) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Anggota tidak ditemukan');
    }
    return { groupId, deviceId, removed: true };
  }

  @Delete(':groupId')
  @RequirePermission('device.update')
  async remove(
    @Request() request: TenantRequest,
    @Param('groupId') groupId: string,
  ) {
    assertUuid(groupId, 'groupId');
    const result = await this.prisma.deviceGroup.deleteMany({
      where: { id: groupId, tenantId: request.user.tenantContext.tenantId },
    });
    if (result.count === 0) {
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Grup tidak ditemukan');
    }
    return { id: groupId, deleted: true };
  }
}