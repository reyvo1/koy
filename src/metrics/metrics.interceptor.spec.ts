import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  const createContext = (
    route = '/devices/:id',
    method = 'GET',
    statusCode = 200,
  ) => {
    const request = {
      method,
      routeOptions: { url: route },
    };
    const reply = { statusCode };

    return {
      context: {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => reply,
        }),
      } as unknown as ExecutionContext,
      reply,
    };
  };

  it('records successful requests using the route template', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const { context } = createContext('/devices/:id', 'get', 204);
    const next: CallHandler = { handle: () => of(undefined) };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(metrics.renderPrometheus()).toContain(
      'iot_http_requests_total{method="GET",route="/devices/:id",status_code="204"} 1',
    );
  });

  it('uses the exception status for failed requests', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const { context } = createContext('/commands', 'POST', 200);
    const next: CallHandler = {
      handle: () => throwError(() => new BadRequestException('invalid')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toThrow(BadRequestException);

    expect(metrics.renderPrometheus()).toContain(
      'iot_http_requests_total{method="POST",route="/commands",status_code="400"} 1',
    );
  });

  it('does not record the metrics scrape endpoint', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const { context } = createContext('/metrics');
    const next: CallHandler = { handle: () => of('metrics') };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(metrics.renderPrometheus()).not.toContain('iot_http_requests_total');
  });

  it('does not instrument non-HTTP execution contexts', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'rpc',
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(metrics.renderPrometheus()).not.toContain('iot_http_requests_total');
  });

  it('uses a bounded unmatched label when no route template is available', async () => {
    const metrics = new MetricsService();
    const interceptor = new MetricsInterceptor(metrics);
    const request = { method: 'GET' };
    const reply = { statusCode: 200 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => reply,
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of(undefined) }),
    );

    expect(metrics.renderPrometheus()).toContain('route="unmatched"');
  });
});
