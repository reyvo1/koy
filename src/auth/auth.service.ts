import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainConflictException,
  DomainUnauthorizedException,
} from '../common/errors/domain-exceptions';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LoginLockoutService } from './login-lockout.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationService: NotificationService,
    private loginLockout: LoginLockoutService,
  ) {}

  private hashToken(token: string): Promise<string> {
    return argon2.hash(token);
  }

  private lookupToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: dto.email, tenantId: dto.tenantId } },
    });
    if (existingUser)
      throw new DomainConflictException(
        ERROR_CODES.AuthUserAlreadyExists,
        'User already exists',
      );

    const passwordHash = await argon2.hash(dto.password);
    const vToken = crypto.randomBytes(32).toString('hex');
    const vTokenHash = await this.hashToken(vToken);
    const vTokenLookup = this.lookupToken(vToken);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          email: dto.email,
          tenantId: dto.tenantId,
          verificationTokenHash: vTokenHash,
          verificationTokenLookup: vTokenLookup,
          credential: { create: { passwordHash } },
          // Self-registration creates the membership the tenant-scoped guards look for, but
          // it deliberately grants neither console access nor tenant access:
          //
          //  - role stays MEMBER, so the admin-web login proxy refuses the account
          //    (`role !== 'ADMIN' && role !== 'PLATFORM_ADMIN'`) even after verification.
          //  - status starts PENDING, so `TenantContextGuard` — which requires ACTIVE —
          //    rejects every tenant-scoped request.
          //
          // An administrator promotes the account through the ordinary user-management
          // path (`PATCH /admin/tenant-users/:userId`, role/status). Handing ADMIN out at
          // registration instead would let anyone who knows a tenant UUID escalate
          // themselves to tenant administrator, which is why this is a two-step approval
          // rather than a convenience default.
          memberships: {
            create: { tenantId: dto.tenantId, role: 'MEMBER', status: 'PENDING' },
          },
        },
      });
      await this.notificationService.sendVerificationToken(
        dto.tenantId,
        dto.email,
        vToken,
        transaction,
      );
    });
    return {
      message: 'Registration successful. Check your email for verification.',
    };
  }

  async verifyEmail(token: string) {
    const lookup = this.lookupToken(token);
    const user = await this.prisma.user.findUnique({
      where: { verificationTokenLookup: lookup },
    });
    if (
      !user ||
      !user.verificationTokenHash ||
      !(await argon2.verify(user.verificationTokenHash, token))
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.AuthVerificationTokenInvalid,
        'Invalid token',
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationTokenHash: null,
        verificationTokenLookup: null,
      },
    });
    return { message: 'Verified' };
  }

  async login(dto: LoginDto) {
    const identityKey = `${dto.tenantId}:${dto.email.toLowerCase()}`;
    if (await this.loginLockout.isLockedOut(identityKey)) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthAccountLocked,
        'Account temporarily locked due to repeated failed logins',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email_tenantId: { email: dto.email, tenantId: dto.tenantId } },
      include: { credential: true },
    });
    if (!user || !user.credential || !user.isVerified)
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthCredentialsInvalid,
        'Invalid credentials or unverified',
      );

    const isMatch = await argon2.verify(
      user.credential.passwordHash,
      dto.password,
    );
    if (!isMatch) {
      await this.loginLockout.recordFailure(identityKey);
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthCredentialsInvalid,
        'Invalid credentials',
      );
    }

    await this.loginLockout.clearFailures(identityKey);

    // Create session family
    const family = await this.prisma.refreshTokenFamily.create({
      data: { userId: user.id, tenantId: user.tenantId },
    });

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_tenantId: { userId: user.id, tenantId: user.tenantId },
      },
      select: { role: true },
    });

    return {
      ...(await this.generateTokens(user.id, user.tenantId, family.id)),
      role: membership?.role ?? 'MEMBER',
    };
  }

  async generateTokens(userId: string, tenantId: string, familyId: string) {
    const payload = { sub: userId, tenantId };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = await this.hashToken(refreshToken);
    const tokenLookup = this.lookupToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        tokenLookup,
        familyId,
        userId,
        tenantId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string) {
    const lookup = this.lookupToken(refreshToken);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Fetch token record
      const record = await tx.refreshToken.findUnique({
        where: { tokenLookup: lookup },
        include: { family: true },
      });
      if (!record) return { status: 'invalid' };

      // 2. Check family revocation
      if (record.family.isRevoked) return { status: 'compromised' };

      // 3. Reuse/Revoked check
      if (record.isRevoked) {
        await tx.refreshTokenFamily.update({
          where: { id: record.familyId },
          data: { isRevoked: true },
        });
        return { status: 'compromised' };
      }

      // 4. Expiry check
      if (record.expiresAt < new Date()) {
        await tx.refreshToken.update({
          where: { id: record.id },
          data: { isRevoked: true },
        });
        return { status: 'expired' };
      }

      // 5. Hash mismatch check
      if (!(await argon2.verify(record.tokenHash, refreshToken))) {
        await tx.refreshTokenFamily.update({
          where: { id: record.familyId },
          data: { isRevoked: true },
        });
        return { status: 'invalid' };
      }

      // 6. Atomic consumption
      const consumed = await tx.refreshToken.updateMany({
        where: { id: record.id, isRevoked: false },
        data: { isRevoked: true },
      });

      if (consumed.count === 0) {
        await tx.refreshTokenFamily.update({
          where: { id: record.familyId },
          data: { isRevoked: true },
        });
        return { status: 'compromised' };
      }

      // 7. Generate replacement
      const newRefreshToken = crypto.randomBytes(64).toString('hex');
      const newTokenHash = await this.hashToken(newRefreshToken);
      const newTokenLookup = this.lookupToken(newRefreshToken);

      await tx.refreshToken.create({
        data: {
          tokenHash: newTokenHash,
          tokenLookup: newTokenLookup,
          familyId: record.familyId,
          userId: record.userId,
          tenantId: record.tenantId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Housekeeping, opportunistic and user-scoped. Every login and every rotation adds a row, and
      // once a token is past its expiry it can never be accepted again -- step 4 above refuses it --
      // yet nothing ever removes it, so the table grows with sessions that have been over for
      // months. Deleting this user's expired rows on rotation keeps the table proportional to live
      // sessions. Revoked-but-unexpired rows stay: those are what make replay detection work.
      await tx.refreshToken.deleteMany({
        where: { userId: record.userId, expiresAt: { lt: new Date() } },
      });

      const accessToken = this.jwtService.sign({
        sub: record.userId,
        tenantId: record.tenantId,
      });
      return {
        status: 'success',
        data: { accessToken, refreshToken: newRefreshToken },
      };
    });

    if (result.status === 'compromised')
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthRefreshTokenCompromised,
        'Token reuse detected - Session compromised',
      );
    if (result.status === 'expired')
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthRefreshTokenExpired,
        'Token expired',
      );
    if (result.status === 'invalid')
      throw new DomainUnauthorizedException(
        ERROR_CODES.AuthRefreshTokenInvalid,
        'Invalid token',
      );

    return result.data;
  }

  async logout(userId: string, tenantId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: { userId, tenantId },
        data: { isRevoked: true },
      });

      await tx.refreshTokenFamily.updateMany({
        where: { userId, tenantId },
        data: { isRevoked: true },
      });
    });

    return { message: 'Logged out' };
  }

  async forgotPassword(email: string, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { email_tenantId: { email, tenantId } },
    });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = await this.hashToken(resetToken);
      const resetTokenLookup = this.lookupToken(resetToken);

      await this.prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: {
            resetTokenHash,
            resetTokenLookup,
            resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await this.notificationService.sendResetToken(
          tenantId,
          email,
          resetToken,
          transaction,
        );
      });
    }
    return { message: 'If user exists, reset email sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const lookup = this.lookupToken(token);
    const user = await this.prisma.user.findUnique({
      where: { resetTokenLookup: lookup },
    });
    if (
      !user ||
      !user.resetTokenHash ||
      !user.resetTokenExpires ||
      user.resetTokenExpires < new Date() ||
      !(await argon2.verify(user.resetTokenHash, token))
    ) {
      throw new DomainBadRequestException(
        ERROR_CODES.AuthPasswordResetTokenInvalid,
        'Invalid or expired token',
      );
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.userCredential.update({
        where: { userId: user.id },
        data: { passwordHash },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: null,
          resetTokenLookup: null,
          resetTokenExpires: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      }),
      this.prisma.refreshTokenFamily.updateMany({
        where: { userId: user.id },
        data: { isRevoked: true },
      }),
    ]);
    return { message: 'Password reset' };
  }
}
