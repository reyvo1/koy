import { createProductionFastifyAdapter } from './production-fastify-adapter';
import {
  PRODUCTION_HTTP_BODY_LIMIT_BYTES,
  PRODUCTION_HTTP_REQUEST_TIMEOUT_MS,
} from '../security/production-security.config';

describe('production Fastify security boundary', () => {
  it('applies an explicit payload limit and request timeout', () => {
    const fastify = createProductionFastifyAdapter().getInstance();

    expect(fastify.initialConfig.bodyLimit).toBe(
      PRODUCTION_HTTP_BODY_LIMIT_BYTES,
    );
    expect(
      (fastify.initialConfig as Record<string, unknown>).requestTimeout,
    ).toBe(PRODUCTION_HTTP_REQUEST_TIMEOUT_MS);
  });

  it('trusts forwarded client addresses only from loopback proxies', async () => {
    const fastify = createProductionFastifyAdapter().getInstance();

    fastify.get('/client-ip', (request) => ({
      ip: request.ip,
      ips: request.ips,
    }));

    const trusted = await fastify.inject({
      method: 'GET',
      url: '/client-ip',
      headers: {
        'x-forwarded-for': '203.0.113.10',
      },
      remoteAddress: '127.0.0.1',
    });
    const untrusted = await fastify.inject({
      method: 'GET',
      url: '/client-ip',
      headers: {
        'x-forwarded-for': '203.0.113.11',
      },
      remoteAddress: '198.51.100.5',
    });

    expect(trusted.json()).toEqual({
      ip: '203.0.113.10',
      ips: ['127.0.0.1', '203.0.113.10'],
    });
    expect(untrusted.json()).toEqual({
      ip: '198.51.100.5',
      ips: ['198.51.100.5'],
    });

    await fastify.close();
  });

  it('rejects request bodies above the configured production limit', async () => {
    const fastify = createProductionFastifyAdapter().getInstance();

    fastify.post('/payload', (request) => request.body);

    const response = await fastify.inject({
      method: 'POST',
      url: '/payload',
      payload: {
        value: 'x'.repeat(PRODUCTION_HTTP_BODY_LIMIT_BYTES),
      },
    });

    expect(response.statusCode).toBe(413);

    await fastify.close();
  });
});
