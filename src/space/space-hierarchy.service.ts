import { Injectable, Logger } from '@nestjs/common';
import { SpaceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const SPACE_LIMITS = {
  maxNameLength: 120,
  maxDepth: 4, // SITE(0) -> BUILDING(1) -> FLOOR(2) -> ROOM(3); depth max index 3
} as const;

const CHILD_OF: Record<SpaceKind, SpaceKind | null> = {
  SITE: null,
  BUILDING: 'SITE',
  FLOOR: 'BUILDING',
  ROOM: 'FLOOR',
};

export type SpaceDomainErrorCode =
  | 'SPACE_NAME_INVALID'
  | 'SPACE_PARENT_REQUIRED'
  | 'SPACE_PARENT_KIND_INVALID'
  | 'SPACE_DEPTH_EXCEEDED';

export class SpaceDomainError extends Error {
  constructor(
    public readonly code: SpaceDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SpaceDomainError';
  }
}

/**
 * Module 17 Slice 17.1 — bounded space-hierarchy creation. Enforces
 * Site → Building → Floor → Room ordering and a maximum depth of 4 levels.
 * Device placement is one-room-per-device via a unique constraint.
 */
@Injectable()
export class SpaceHierarchyService {
  private readonly logger = new Logger(SpaceHierarchyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSpace(input: {
    tenantId: string;
    name: string;
    kind: SpaceKind;
    parentId?: string;
  }): Promise<{ id: string }> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > SPACE_LIMITS.maxNameLength) {
      throw new SpaceDomainError(
        'SPACE_NAME_INVALID',
        `name must be 1..${SPACE_LIMITS.maxNameLength} characters`,
      );
    }

    let path: string;
    let depth: number;

    if (input.kind === SpaceKind.SITE) {
      if (input.parentId) {
        throw new SpaceDomainError(
          'SPACE_PARENT_KIND_INVALID',
          'a SITE cannot have a parent',
        );
      }
      path = `/${name}`;
      depth = 0;
    } else {
      if (!input.parentId) {
        throw new SpaceDomainError(
          'SPACE_PARENT_REQUIRED',
          `${input.kind} requires a parent ${CHILD_OF[input.kind]}`,
        );
      }
      const parent = await this.prisma.space.findFirst({
        where: { id: input.parentId, tenantId: input.tenantId },
      });
      if (!parent || parent.kind !== CHILD_OF[input.kind]) {
        throw new SpaceDomainError(
          'SPACE_PARENT_KIND_INVALID',
          `${input.kind} must be nested under ${CHILD_OF[input.kind]}`,
        );
      }
      depth = parent.depth + 1;
      if (depth > SPACE_LIMITS.maxDepth - 1 + 1) {
        throw new SpaceDomainError('SPACE_DEPTH_EXCEEDED', 'hierarchy too deep');
      }
      path = `${parent.path}/${name}`;
    }

    const created = await this.prisma.space.create({
      data: {
        tenantId: input.tenantId,
        name,
        kind: input.kind,
        parentId: input.parentId ?? null,
        path,
        depth,
      },
    });

    this.logger.log({
      event: 'space.created',
      outcome: 'created',
      spaceId: created.id,
      kind: input.kind,
    });
    return { id: created.id };
  }

  /** Place a device into a ROOM; unique(deviceId) enforces single placement. */
  async placeDevice(input: {
    tenantId: string;
    roomId: string;
    deviceId: string;
  }): Promise<void> {
    const room = await this.prisma.space.findFirst({
      where: {
        id: input.roomId,
        tenantId: input.tenantId,
        kind: SpaceKind.ROOM,
      },
    });
    if (!room) {
      throw new SpaceDomainError(
        'SPACE_PARENT_KIND_INVALID',
        'placement target must be an existing ROOM',
      );
    }
    await this.prisma.spaceDevicePlacement.create({
      data: {
        tenantId: input.tenantId,
        roomId: input.roomId,
        deviceId: input.deviceId,
      },
    });
  }

  async listTree(tenantId: string) {
    return this.prisma.space.findMany({
      where: { tenantId },
      orderBy: [{ depth: 'asc' }, { path: 'asc' }],
    });
  }
}
