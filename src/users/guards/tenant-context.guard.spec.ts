import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantContextGuard } from './tenant-context.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('TenantContextGuard', () => {
  let guard: TenantContextGuard;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = { membership: { findUnique: jest.fn() } } as any;
    guard = new TenantContextGuard(prisma);
  });

  const mockContext = (userId: any, headers: any): ExecutionContext => {
    const request = { user: { userId }, headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as any;
  };

  it('should allow access with ACTIVE membership and verify lookup and context', async () => {
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1',
      tenantId: 't1',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const context = mockContext('u1', { 'x-tenant-id': 't1' });
    const request = context.switchToHttp().getRequest();

    expect(await guard.canActivate(context)).toBe(true);
    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: {
        userId_tenantId: {
          userId: 'u1',
          tenantId: 't1',
        },
      },
    });
    expect(request.user.tenantContext).toEqual({
      tenantId: 't1',
      membershipId: 'm1',
      role: 'MEMBER',
    });
  });

  it('should trim surrounding whitespace in x-tenant-id before membership lookup', async () => {
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue({
      id: 'm1',
      tenantId: 't1',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const context = mockContext('u1', { 'x-tenant-id': '  t1  ' });
    const request = context.switchToHttp().getRequest();

    expect(await guard.canActivate(context)).toBe(true);
    expect(prisma.membership.findUnique).toHaveBeenCalledWith({
      where: {
        userId_tenantId: {
          userId: 'u1',
          tenantId: 't1',
        },
      },
    });
    expect(request.user.tenantContext).toEqual({
      tenantId: 't1',
      membershipId: 'm1',
      role: 'MEMBER',
    });
  });

  it('should reject with missing membership', async () => {
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': 't1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject with PENDING membership', async () => {
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue({
      status: 'PENDING',
    });
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': 't1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject with REVOKED membership', async () => {
    (prisma.membership.findUnique as jest.Mock).mockResolvedValue({
      status: 'REVOKED',
    });
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': 't1' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject with missing x-tenant-id and not call prisma', async () => {
    await expect(guard.canActivate(mockContext('u1', {}))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('should reject with array-valued x-tenant-id and not call prisma', async () => {
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': ['t1', 't2'] })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('should reject with empty string x-tenant-id and not call prisma', async () => {
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': '' })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });

  it('should reject with whitespace-only x-tenant-id and not call prisma', async () => {
    await expect(
      guard.canActivate(mockContext('u1', { 'x-tenant-id': '   ' })),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.membership.findUnique).not.toHaveBeenCalled();
  });
});
