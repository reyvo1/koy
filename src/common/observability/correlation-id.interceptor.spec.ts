import { CorrelationIdInterceptor, CORRELATION_ID_HEADER } from './correlation-id.interceptor';

describe('CorrelationIdInterceptor', () => {
  const makeContext = (headers: Record<string, string | string[]>) => {
    const replyHeaders: Record<string, string> = {};
    const request = {
      method: 'GET',
      headers,
      url: '/devices/d1/telemetry/latest?limit=5',
      routeOptions: { url: '/devices/:deviceId/telemetry/latest' },
    };
    const reply = { header: (k: string, v: string) => { replyHeaders[k] = v; }, statusCode: 200 };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    };
    return { context, request, reply, replyHeaders };
  };

  const handler = { handle: () => ({ pipe: (ops: unknown) => ops }) };

  it('honors a well-formed incoming correlation id', () => {
    const interceptor = new CorrelationIdInterceptor();
    const { context, replyHeaders } = makeContext({
      [CORRELATION_ID_HEADER]: 'my-correlation-id-123',
    });

    interceptor.intercept(context as any, handler as any);

    expect(replyHeaders[CORRELATION_ID_HEADER]).toBe('my-correlation-id-123');
  });

  it('generates a UUID when the incoming id is malformed', () => {
    const interceptor = new CorrelationIdInterceptor();
    const { context, replyHeaders } = makeContext({
      [CORRELATION_ID_HEADER]: '../../etc/passwd',
    });

    interceptor.intercept(context as any, handler as any);

    expect(replyHeaders[CORRELATION_ID_HEADER]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('exposes the correlation id on the request for downstream logging', () => {
    const interceptor = new CorrelationIdInterceptor();
    const { context, request, replyHeaders } = makeContext({});

    interceptor.intercept(context as any, handler as any);

    expect((request as any).correlationId).toBe(
      replyHeaders[CORRELATION_ID_HEADER],
    );
  });
});
