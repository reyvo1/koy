import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from '../notification/notification.service';
import { LoginLockoutService } from './login-lockout.service';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let notifications: { sendVerificationToken: jest.Mock; sendResetToken: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {
            user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            $transaction: jest.fn(async (cb) => {
                const tx = {
                    user: { create: jest.fn(), update: jest.fn() },
                    refreshToken: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
                    refreshTokenFamily: { update: jest.fn() }
                };
                return await cb(tx);
            })
        } },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: NotificationService, useValue: { sendVerificationToken: jest.fn(), sendResetToken: jest.fn() } },
        { provide: LoginLockoutService, useValue: { isLockedOut: jest.fn().mockResolvedValue(false), recordFailure: jest.fn(), clearFailures: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    notifications = module.get(NotificationService);
  });

  describe('auth notification persistence', () => {
    it('persists registration and verification notification in one transaction', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      jest.spyOn(argon2, 'hash').mockResolvedValue('argon-hash');
      const tx = { user: { create: jest.fn().mockResolvedValue({ id: 'u1' }) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

      await service.register({
        email: 'user@example.com',
        password: 'StrongPassword123!',
        tenantId: 'tenant-1',
      } as any);

      expect(tx.user.create).toHaveBeenCalledTimes(1);
      expect(notifications.sendVerificationToken).toHaveBeenCalledWith(
        'tenant-1',
        'user@example.com',
        expect.any(String),
        tx,
      );
    });

    it('persists password reset token and reset notification in one transaction', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'u1' });
      jest.spyOn(argon2, 'hash').mockResolvedValue('argon-reset-hash');
      const tx = { user: { update: jest.fn().mockResolvedValue({ id: 'u1' }) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(tx));

      await service.forgotPassword('user@example.com', 'tenant-1');

      expect(tx.user.update).toHaveBeenCalledTimes(1);
      expect(notifications.sendResetToken).toHaveBeenCalledWith(
        'tenant-1',
        'user@example.com',
        expect.any(String),
        tx,
      );
    });
  });

  describe('refreshTokens', () => {
    it('already-revoked refresh token revokes the persistent RefreshTokenFamily and rejects', async () => {
        const tx = {
            refreshToken: { findUnique: jest.fn().mockResolvedValue({ id: 'rt1', familyId: 'f1', isRevoked: true, family: { isRevoked: false } }) },
            refreshTokenFamily: { update: jest.fn().mockResolvedValue({}) }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));

        await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
        expect(tx.refreshTokenFamily.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { isRevoked: true } });
    });

    it('already-revoked RefreshTokenFamily rejects', async () => {
        const tx = {
            refreshToken: { findUnique: jest.fn().mockResolvedValue({ id: 'rt1', familyId: 'f1', isRevoked: false, family: { isRevoked: true } }) }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));

        await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
    });

    it('expired refresh token is revoked and rejected', async () => {
        const tx = {
            refreshToken: { 
                findUnique: jest.fn().mockResolvedValue({ id: 'rt1', familyId: 'f1', isRevoked: false, family: { isRevoked: false }, expiresAt: new Date(Date.now() - 1000) }),
                update: jest.fn().mockResolvedValue({})
            }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));

        await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
        expect(tx.refreshToken.update).toHaveBeenCalledWith({ where: { id: 'rt1' }, data: { isRevoked: true } });
    });

    it('Argon2 hash mismatch persistently revokes the family and rejects', async () => {
        jest.spyOn(argon2, 'verify').mockResolvedValue(false);
        const tx = {
            refreshToken: { 
                findUnique: jest.fn().mockResolvedValue({ id: 'rt1', familyId: 'f1', isRevoked: false, family: { isRevoked: false }, tokenHash: 'hash', expiresAt: new Date(Date.now() + 10000) }),
            },
            refreshTokenFamily: { update: jest.fn().mockResolvedValue({}) }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));

        await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
        expect(tx.refreshTokenFamily.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { isRevoked: true } });
    });

    it('concurrent token consumption where consumed.count === 0 persistently revokes the family and rejects', async () => {
        const tx = {
            refreshToken: { 
                findUnique: jest.fn().mockResolvedValue({ 
                    id: 'rt1', familyId: 'f1', userId: 'u1', tenantId: 't1', isRevoked: false, 
                    family: { isRevoked: false }, 
                    expiresAt: new Date(Date.now() + 10000), 
                    tokenHash: 'hash' 
                }),
                updateMany: jest.fn().mockResolvedValue({ count: 0 })
            },
            refreshTokenFamily: { update: jest.fn().mockResolvedValue({}) }
        };
        jest.spyOn(argon2, 'verify').mockResolvedValue(true);
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));

        await expect(service.refreshTokens('old-token')).rejects.toThrow(UnauthorizedException);
        expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
            where: { id: 'rt1', isRevoked: false },
            data: { isRevoked: true }
        });
        expect(tx.refreshTokenFamily.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { isRevoked: true } });
    });

    it('missing refresh token record rejects as invalid token', async () => {
        const tx = {
            refreshToken: { findUnique: jest.fn().mockResolvedValue(null) },
            refreshTokenFamily: { update: jest.fn() }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => await cb(tx));
        await expect(service.refreshTokens('unknown-token')).rejects.toThrow('Invalid token');
        expect(tx.refreshTokenFamily.update).not.toHaveBeenCalled();
    });

    it('successful refresh atomically consumes the old token and creates a replacement token with the same familyId', async () => {
        const events: string[] = [];
        jest.spyOn(argon2, 'verify').mockResolvedValue(true);
        const tx = {
            refreshToken: { 
                findUnique: jest.fn().mockResolvedValue({ 
                    id: 'rt1', userId: 'u1', tenantId: 't1', familyId: 'f1', isRevoked: false, 
                    family: { isRevoked: false }, tokenHash: 'hash', 
                    expiresAt: new Date(Date.now() + 10000) 
                }),
                updateMany: jest.fn().mockImplementation(async () => {
                    return { count: 1 };
                }),
                create: jest.fn().mockImplementation(async (_args) => {
                    events.push('replacement-created');
                    return { id: 'rt2', tokenLookup: 'new-lookup' };
                }),
                // Housekeeping for this user's expired tokens runs on the same rotation transaction.
                deleteMany: jest.fn().mockResolvedValue({ count: 0 })
            },
            refreshTokenFamily: { update: jest.fn() }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            const result = await cb(tx);
            events.push('transaction-resolved');
            return result;
        });
        jest.spyOn(service['jwtService'], 'sign').mockReturnValue('new-access-token');

        const result = await service.refreshTokens('old-token');
        events.push('caller-received-result');
        
        expect(events).toEqual(['replacement-created', 'transaction-resolved', 'caller-received-result']);
        expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
            where: { id: 'rt1', isRevoked: false },
            data: { isRevoked: true }
        });
        const createCall = tx.refreshToken.create.mock.calls[0][0];
        expect(createCall.data).toMatchObject({ familyId: 'f1', userId: 'u1', tenantId: 't1' });
        // The opportunistic housekeeping is user-scoped and expiry-bounded: it must never touch another
        // user's rows, and it must never delete a token that is still valid (those are what make replay
        // detection work).
        expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({
            where: { userId: 'u1', expiresAt: { lt: expect.any(Date) } }
        });
        expect(service['lookupToken'](result.refreshToken)).toBe(createCall.data.tokenLookup);
        expect(result.accessToken).toBe('new-access-token');
        expect(result.refreshToken).toBeDefined();
        expect(typeof result.refreshToken).toBe('string');
        expect(tx.refreshTokenFamily.update).not.toHaveBeenCalled();
    });

    it('family revocation transaction completes before UnauthorizedException', async () => {
        const events: string[] = [];
        const tx = {
            refreshToken: { findUnique: jest.fn().mockResolvedValue({ id: 'rt1', familyId: 'f1', isRevoked: true, family: { isRevoked: false } }) },
            refreshTokenFamily: { 
                update: jest.fn().mockImplementation(async () => {
                    events.push('family-revoked');
                    return {};
                }) 
            }
        };
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            const result = await cb(tx);
            events.push('transaction-resolved');
            return result;
        });

        try {
            await service.refreshTokens('old-token');
        } catch (e) {
            events.push('public-exception-observed');
        }

        expect(events).toEqual(['family-revoked', 'transaction-resolved', 'public-exception-observed']);
    });
  });
});
