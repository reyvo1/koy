import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Module 24 Slice 24.1 — correlation propagation.
 * Assigns (or honors) an `x-correlation-id` on every HTTP request, exposes it
 * on the response for client-side correlation, and logs one bounded
 * request-completion event per request with route, status, duration, and
 * correlation id. Tracing-ready: the id can later be swapped for a W3C
 * traceparent without changing call sites.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationIdInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const incoming = request.headers[CORRELATION_ID_HEADER];
    const correlationId =
      typeof incoming === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(incoming)
        ? incoming
        : randomUUID();

    reply.header(CORRELATION_ID_HEADER, correlationId);
    (request as { correlationId?: string }).correlationId = correlationId;

    const startedAt = Date.now();
    const route = this.resolveRoute(request);

    return next.handle().pipe(
      tap({
        // Bounded structured log; tracing backends can hook here later.
        next: () => {
          this.logger.log({
            event: 'http.request.completed',
            outcome: 'succeeded',
            method: request.method,
            route,
            correlationId,
            durationMs: Date.now() - startedAt,
          });
        },
        error: () => {
          this.logger.error({
            event: 'http.request.completed',
            outcome: 'failed',
            method: request.method,
            route,
            correlationId,
            durationMs: Date.now() - startedAt,
          });
        },
      }),
    );
  }

  private resolveRoute(request: FastifyRequest): string {
    const params = (request.routeOptions as { url?: string } | undefined)?.url;
    return params ?? request.url.split('?')[0] ?? 'unknown';
  }
}
