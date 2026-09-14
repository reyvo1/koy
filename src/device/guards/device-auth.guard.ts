import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../../common/errors/error-code';
import { DomainUnauthorizedException } from '../../common/errors/domain-exceptions';
import { DeviceStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const deviceId = this.getRequiredHeader(
      request.headers['x-device-id'],
      'Missing device credentials',
    );
    const secret = this.getRequiredHeader(
      request.headers['x-device-secret'],
      'Missing device credentials',
    );

    const device = await this.prisma.device.findUnique({
      where: {
        id: deviceId,
      },
      include: {
        credential: true,
      },
    });

    if (
      !device ||
      !device.credential ||
      device.status === DeviceStatus.REVOKED
    ) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceCredentialsInvalid,
        'Invalid device credentials',
      );
    }

    const isValidSecret = await argon2.verify(
      device.credential.passwordHash,
      secret,
    );

    if (!isValidSecret) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceCredentialsInvalid,
        'Invalid device credentials',
      );
    }

    request.device = device;

    return true;
  }

  private getRequiredHeader(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string') {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceCredentialsInvalid,
        errorMessage,
      );
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceCredentialsInvalid,
        errorMessage,
      );
    }

    return normalizedValue;
  }
}
