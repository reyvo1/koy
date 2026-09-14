import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { ERROR_CODES } from '../common/errors/error-code';

const SENSITIVE_AUTH_PATHS = new Set([
  '/auth/register',
  '/auth/verify-email',
  '/auth/login',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
]);

const RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
`;

interface RateLimitResult {
  current: number;
  ttlMs: number;
}

@Injectable()
export class SensitiveEndpointRateLimitGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const path = this.resolvePath(request);

    if (!SENSITIVE_AUTH_PATHS.has(path)) {
      return true;
    }

    const max = this.configService.getOrThrow<number>(
      'SENSITIVE_RATE_LIMIT_MAX',
    );
    const windowMs = this.configService.getOrThrow<number>(
      'SENSITIVE_RATE_LIMIT_WINDOW_MS',
    );

    let result: RateLimitResult;

    try {
      result = await this.increment(path, request.ip, windowMs);
    } catch {
      throw new ServiceUnavailableException({
        code: ERROR_CODES.RateLimitUnavailable,
        message: 'Authentication rate limit is temporarily unavailable',
      });
    }

    if (result.current > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil(result.ttlMs / 1000));
      reply.header('Retry-After', String(retryAfterSeconds));

      throw new HttpException(
        {
          code: ERROR_CODES.AuthRateLimitExceeded,
          message: 'Too many authentication requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private async increment(
    path: string,
    clientIp: string,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const identity = createHash('sha256')
      .update(`${path}:${clientIp}`)
      .digest('hex');
    const key = `iot:rate-limit:auth:${identity}`;
    const response = (await this.redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      key,
      windowMs,
    )) as [number, number];

    return {
      current: Number(response[0]),
      ttlMs: Number(response[1]),
    };
  }

  private resolvePath(request: FastifyRequest): string {
    return request.url.split('?')[0] || '/';
  }
}
