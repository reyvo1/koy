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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SpaceKind } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextGuard } from '../users/guards/tenant-context.guard';
import { AdminOperationsRequest } from '../admin-operations/admin-operational-summary.types';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  DomainConflictException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  SPACE_LIMITS,
  SpaceDomainError,
  SpaceHierarchyService,
} from './space-hierarchy.service';

const VALID_KINDS: SpaceKind[] = [
  SpaceKind.SITE,
  SpaceKind.BUILDING,
  SpaceKind.FLOOR,
  SpaceKind.ROOM,
];

@ApiTags('spaces')
@ApiBearerAuth()
@ApiHeader({
  name: 'X-Tenant-Id',
  required: true,
  description: 'Trusted tenant selector validated against active membership',
})
@Controller('spaces')
@UseGuards(JwtAuthGuard, TenantContextGuard, AdminRoleGuard)
export class SpaceController {
  constructor(
    private readonly hierarchy: SpaceHierarchyService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * DELETE /spaces/:spaceId — remove a node. Children cascade; nodes that
   * still hold device placements are rejected with a bounded conflict.
   */
  @Delete(':spaceId')
  @ApiOperation({ summary: 'Delete a space node (bounded)' })
  async remove(
    @Request() request: AdminOperationsRequest,
    @Param('spaceId') spaceId: string,
  ) {
    try {
      const result = await this.prisma.space.deleteMany({
        where: { id: spaceId, tenantId: request.user.tenantContext.tenantId },
      });
      if (result.count === 0) {
        throw new DomainNotFoundException(ERROR_CODES.NotFound, 'Lokasi tidak ditemukan');
      }
      return { id: spaceId, deleted: true };
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      if (code === 'P2003') {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'Lokasi masih menampung perangkat atau node anak — kosongkan dulu',
        );
      }
      throw cause;
    }
  }

  /**
   * GET /spaces — bounded flat list of the tenant's space hierarchy
   * (SITE/BUILDING/FLOOR/ROOM). Read-only, tenant-scoped.
   */
  @Get()
  @ApiOperation({ summary: 'List tenant space hierarchy (bounded)' })
  @ApiResponse({ status: 200, description: 'Space nodes' })
  async list(@Request() request: AdminOperationsRequest) {
    const tenantId = request.user.tenantContext.tenantId;
    const nodes = await this.hierarchy.listTree(tenantId);
    return {
      total: nodes.length,
      items: nodes.slice(0, MAX_SPACES_TAKE).map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        parentId: node.parentId,
        path: node.path,
        depth: node.depth,
      })),
    };
  }

  /**
   * POST /spaces — create a SITE/BUILDING/FLOOR/ROOM node. Domain rules
   * (parent kind ordering, depth limit) enforced by SpaceHierarchyService.
   */
  @Post()
  @ApiOperation({ summary: 'Create a space hierarchy node (bounded)' })
  @ApiResponse({ status: 201, description: 'Created space id' })
  async create(
    @Request() request: AdminOperationsRequest,
    @Body() body: unknown,
  ) {
    const input = parseCreateSpaceBody(body);
    const created = await this.hierarchy.createSpace({
      tenantId: request.user.tenantContext.tenantId,
      ...input,
    });
    return { id: created.id };
  }
}

const MAX_SPACES_TAKE = 500;

/** Bounded create-space body validation without class-validator dependency. */
function parseCreateSpaceBody(body: unknown): {
  name: string;
  kind: SpaceKind;
  parentId?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new SpaceDomainError('SPACE_NAME_INVALID', 'body must be an object');
  }
  const record = body as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  if (!name || name.length > SPACE_LIMITS.maxNameLength) {
    throw new SpaceDomainError(
      'SPACE_NAME_INVALID',
      `name must be 1..${SPACE_LIMITS.maxNameLength} characters`,
    );
  }
  const kind = record.kind;
  if (typeof kind !== 'string' || !VALID_KINDS.includes(kind as SpaceKind)) {
    throw new SpaceDomainError(
      'SPACE_PARENT_KIND_INVALID',
      `kind must be one of ${VALID_KINDS.join(', ')}`,
    );
  }
  let parentId: string | undefined;
  if (record.parentId !== undefined && record.parentId !== null) {
    if (
      typeof record.parentId !== 'string' ||
      record.parentId.length === 0 ||
      record.parentId.length > 64
    ) {
      throw new SpaceDomainError(
        'SPACE_PARENT_KIND_INVALID',
        'parentId must be a bounded id string',
      );
    }
    parentId = record.parentId;
  }
  return { name, kind: kind as SpaceKind, parentId };
}
