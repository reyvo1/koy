import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const route = this.resolveRoute(request);

    if (route === '/metrics') {
      return next.handle();
    }

    const startedAt = process.hrtime.bigint();
    let statusCode = reply.statusCode || 200;

    return next.handle().pipe(
      catchError((error: unknown) => {
        statusCode = this.resolveErrorStatus(error);
        return throwError(() => error);
      }),
      finalize(() => {
        if (statusCode < 400) {
          statusCode = reply.statusCode || statusCode;
        }

        const durationSeconds =
          Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

        this.metrics.recordHttpRequest(
          request.method,
          route,
          statusCode,
          durationSeconds,
        );
      }),
    );
  }

  private resolveRoute(request: FastifyRequest): string {
    const route = request.routeOptions?.url ?? request.routerPath;

    if (!route || !route.startsWith('/')) {
      return 'unmatched';
    }

    return route;
  }

  private resolveErrorStatus(error: unknown): number {
    if (
      error &&
      typeof error === 'object' &&
      'getStatus' in error &&
      typeof (error as { getStatus?: unknown }).getStatus === 'function'
    ) {
      const status = (error as { getStatus: () => unknown }).getStatus();

      if (typeof status === 'number' && Number.isInteger(status)) {
        return status;
      }
    }

    return 500;
  }
}
