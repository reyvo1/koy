import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { ERROR_CODES } from '../common/errors/error-code';

@Injectable()
export class MetricsAccessGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedToken = this.configService.get<string>(
      'METRICS_ACCESS_TOKEN',
    );

    if (!expectedToken) {
      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        return true;
      }

      throw new UnauthorizedException({
        code: ERROR_CODES.MetricsAccessDenied,
        message: 'Metrics access denied',
      });
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = request.headers.authorization;
    const providedToken = this.extractBearerToken(authorization);

    if (!providedToken || !this.matches(expectedToken, providedToken)) {
      throw new UnauthorizedException({
        code: ERROR_CODES.MetricsAccessDenied,
        message: 'Metrics access denied',
      });
    }

    return true;
  }

  private extractBearerToken(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }

    const match = /^Bearer\s+(.+)$/i.exec(value.trim());
    return match?.[1];
  }

  private matches(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);

    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }
}
