import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import {
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

const MAX_LIST_TAKE = 200;

interface CreateUserInput {
  tenantId: string;
  email: string;
  name?: string;
  password: string;
  role: 'MEMBER' | 'ADMIN';
}

@Injectable()
export class AdminUserProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  private directoryMembership<T extends { tenantId: string; role: string; status: string }>(
    memberships: T[],
    tenantId: string,
  ): T {
    const membership = memberships.find((item) => item.tenantId === tenantId);
    if (!membership) {
      throw new DomainConflictException(
        ERROR_CODES.Conflict,
        'User directory membership is inconsistent with tenant ownership',
      );
    }
    return membership;
  }

  async createUser(input: CreateUserInput) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new DomainNotFoundException(
        ERROR_CODES.TenantUserNotFound,
        'Tenant not found',
      );
    }

    const email = input.email.trim();
    const existing = await this.prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId: input.tenantId } },
      select: { id: true },
    });
    if (existing) {
      throw new DomainConflictException(
        ERROR_CODES.AuthUserAlreadyExists,
        'User already exists in this tenant',
      );
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name?.trim() || null,
        tenantId: input.tenantId,
        isVerified: true,
        credential: { create: { passwordHash } },
        memberships: {
          create: {
            tenantId: input.tenantId,
            role: input.role,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        memberships: { select: { role: true } },
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.memberships[0]?.role ?? input.role,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async listAllUsers() {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_LIST_TAKE,
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          tenantId: true,
          createdAt: true,
          tenant: { select: { name: true } },
          memberships: { select: { tenantId: true, role: true, status: true } },
        },
      }),
      this.prisma.user.count(),
    ]);

    return {
      total,
      items: users.map((user) => {
        const membership = this.directoryMembership(
          user.memberships,
          user.tenantId,
        );
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: user.isVerified,
          tenantId: user.tenantId,
          tenantName: user.tenant.name,
          role: membership.role,
          status: membership.status,
          createdAt: user.createdAt.toISOString(),
        };
      }),
    };
  }

  async listAllFindings(limit?: number) {
    const boundedLimit =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.min(Math.floor(limit), 100)
        : 50;

    const findings = await this.prisma.analyticsFinding.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: boundedLimit,
      select: {
        id: true,
        // The NOC console has to name the tenant it is acting on: the acknowledge verb resolves
        // the finding inside the tenant given, and with only `tenantName` the console had no id to
        // send and no way to act on a finding it was displaying.
        tenantId: true,
        deviceId: true,
        capabilityKey: true,
        kind: true,
        severity: true,
        summary: true,
        confidence: true,
        createdAt: true,
        tenant: { select: { name: true } },
      },
    });

    return {
      total: findings.length,
      items: findings.map((finding) => ({
        id: finding.id,
        deviceId: finding.deviceId,
        capabilityKey: finding.capabilityKey,
        kind: finding.kind,
        severity: finding.severity,
        summary: finding.summary,
        confidence: finding.confidence,
        tenantId: finding.tenantId,
        tenantName: finding.tenant.name,
        createdAt: finding.createdAt.toISOString(),
      })),
    };
  }

  private async requireMembership(userId: string, tenantId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { id: true, role: true, status: true, user: { select: { name: true } } },
    });
    if (!membership) {
      throw new DomainNotFoundException(
        ERROR_CODES.TenantUserNotFound,
        'User not found in tenant',
      );
    }
    return membership;
  }

  async updateUser(
    target: { userId: string; tenantId: string },
    patch: { name?: string; role?: 'MEMBER' | 'ADMIN'; status?: 'ACTIVE' | 'REVOKED' },
    actorUserId: string,
  ) {
    if (target.userId === actorUserId && (patch.role || patch.status)) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Cannot change own role or status; ask another admin',
      );
    }

    const membership = await this.requireMembership(
      target.userId,
      target.tenantId,
    );

    if (patch.role && membership.role === 'PLATFORM_ADMIN') {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'PLATFORM_ADMIN role can only be managed via seed',
      );
    }

    if (patch.name !== undefined) {
      await this.prisma.user.update({
        where: { id: target.userId },
        data: { name: patch.name.trim() || null },
      });
    }

    const membershipData: Prisma.MembershipUpdateInput = {};
    if (patch.role) membershipData.role = patch.role;
    if (patch.status) membershipData.status = patch.status;

    if (Object.keys(membershipData).length > 0) {
      await this.prisma.membership.update({
        where: { id: membership.id },
        data: membershipData,
      });
    }

    return {
      id: target.userId,
      name: patch.name !== undefined ? patch.name.trim() || null : membership.user.name,
      role: patch.role ?? membership.role,
      status: patch.status ?? membership.status,
    };
  }

  async deleteUser(
    target: { userId: string; tenantId: string },
    actorUserId: string,
  ) {
    if (target.userId === actorUserId) {
      throw new DomainForbiddenException(
        ERROR_CODES.Forbidden,
        'Cannot delete own account',
      );
    }

    await this.requireMembership(target.userId, target.tenantId);

    try {
      await this.prisma.$transaction([
        this.prisma.refreshToken.deleteMany({
          where: { userId: target.userId },
        }),
        this.prisma.refreshTokenFamily.deleteMany({
          where: { userId: target.userId },
        }),
        this.prisma.userCredential.deleteMany({
          where: { userId: target.userId },
        }),
        this.prisma.membership.deleteMany({
          where: { userId: target.userId, tenantId: target.tenantId },
        }),
        this.prisma.user.delete({ where: { id: target.userId } }),
      ]);
    } catch (cause) {
      const code = (cause as { code?: string } | null)?.code;
      if (code === 'P2003') {
        throw new DomainConflictException(
          ERROR_CODES.Conflict,
          'User still owns related data (dashboard/perangkat); deactivate instead',
        );
      }
      throw cause;
    }

    return { id: target.userId, deleted: true };
  }

  async resetPassword(
    target: { userId: string; tenantId: string },
    password: string,
  ) {
    await this.requireMembership(target.userId, target.tenantId);

    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.userCredential.upsert({
        where: { userId: target.userId },
        update: { passwordHash },
        create: { userId: target.userId, passwordHash },
      }),
      this.prisma.refreshTokenFamily.deleteMany({
        where: { userId: target.userId, tenantId: target.tenantId },
      }),
    ]);

    return { id: target.userId, message: 'Password updated; active sessions revoked' };
  }

  async listTenantUsers(tenantId: string) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_LIST_TAKE,
        select: {
          id: true,
          email: true,
          name: true,
          isVerified: true,
          createdAt: true,
          memberships: { select: { id: true, tenantId: true, role: true, status: true } },
        },
      }),
      this.prisma.user.count({ where: { tenantId } }),
    ]);

    return {
      total,
      items: users.map((user) => {
        const membership = this.directoryMembership(
          user.memberships,
          tenantId,
        );
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: user.isVerified,
          // Exposed because device sharing grants are addressed to a membership, not a user:
          // without the membership id an operator cannot build a share request at all.
          membershipId: membership.id,
          role: membership.role,
          status: membership.status,
          createdAt: user.createdAt.toISOString(),
        };
      }),
    };
  }
}
