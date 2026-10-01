import { Test } from '@nestjs/testing';
import {
  WebhookDeliveryStatus,
  WebhookDispatchService,
  WebhookRepository,
} from './webhook-runtime.service';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';

/**
 * The webhook runtime that did not exist.
 *
 * `webhook_endpoints` and `webhook_deliveries` were in the schema, and
 * `PublicApiService.signWebhookPayload` existed, with **zero** call sites — so a reader of the
 * repository saw a webhook feature and no behaviour behind it. Nothing could register an
 * endpoint, and nothing signed anything.
 *
 * The assertions here are the ones a receiver would actually depend on: a signature that
 * verifies, a secret that is never readable a second time, a foreign endpoint id that does not
 * confirm its own existence, and one dead receiver not stopping delivery to the rest.
 */
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const makePrisma = () => ({
  webhookEndpoint: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => ({
      ...data,
      id: 'endpoint-1',
      enabled: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    delete: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  webhookDelivery: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const publicApiDouble = {
  signWebhookPayload: jest.fn((secret: string, payload: unknown) =>
    // Same construction as the real helper, so the assertion is about the wiring and not
    // about a second implementation agreeing with itself.
    require('node:crypto')
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex'),
  ),
};

describe('WebhookRepository', () => {
  it('never returns a signing secret through the list surface', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      {
        id: 'endpoint-1',
        url: 'https://receiver.example.com/hook',
        signingSecret: 'whsec_super_secret_value',
        events: ['device.registered'],
        enabled: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const repository = new WebhookRepository(prisma as never);

    const items = await repository.listEndpoints(tenantId);

    // A credential is returned once, at creation. A list surface that hands out signing
    // secrets to any tenant admin is a credential store with a read API.
    expect(JSON.stringify(items)).not.toContain('whsec_super_secret_value');
    expect(items[0]).not.toHaveProperty('signingSecret');
    expect(items[0].url).toBe('https://receiver.example.com/hook');
  });

  it('scopes every lookup by tenant, not by id alone', async () => {
    const prisma = makePrisma();
    const repository = new WebhookRepository(prisma as never);

    await expect(repository.findEndpoint(tenantId, 'endpoint-1')).rejects.toBeInstanceOf(
      DomainNotFoundException,
    );
    // The scope is in the query, not in a JavaScript ownership decision afterwards.
    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: { id: 'endpoint-1', tenantId },
    });
  });

  it('refuses to disable an endpoint belonging to another tenant', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    const repository = new WebhookRepository(prisma as never);

    await expect(repository.setEnabled(tenantId, 'foreign-endpoint', false)).rejects.toBeInstanceOf(
      DomainNotFoundException,
    );
    // No unscoped write may happen on the way to the rejection.
    expect(prisma.webhookEndpoint.updateMany).not.toHaveBeenCalled();
  });

  it('deletes through a scoped read first, so a foreign id is rejected before any delete', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findFirst.mockResolvedValue(null);
    const repository = new WebhookRepository(prisma as never);

    await expect(repository.deleteEndpoint(tenantId, 'foreign')).rejects.toBeInstanceOf(
      DomainNotFoundException,
    );
    expect(prisma.webhookEndpoint.delete).not.toHaveBeenCalled();
  });

  it('treats a wildcard subscription as matching any event', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'a', enabled: true, events: ['*'], signingSecret: 's1', url: 'https://a' },
      { id: 'b', enabled: true, events: ['device.registered'], signingSecret: 's2', url: 'https://b' },
      { id: 'c', enabled: true, events: ['alert.raised'], signingSecret: 's3', url: 'https://c' },
    ]);
    const repository = new WebhookRepository(prisma as never);

    const matched = await repository.endpointsForEvent(tenantId, 'device.registered');

    expect(matched.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });
});

describe('WebhookDispatchService', () => {
  it('signs with the endpoint secret and records the delivery', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'a', enabled: true, events: ['device.registered'], signingSecret: 's1', url: 'https://a' },
    ]);
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    (global as never as { fetch: unknown }).fetch = fetchMock;

    const service = new WebhookDispatchService(
      prisma as never,
      new WebhookRepository(prisma as never),
      publicApiDouble as never,
    );
    const results = await service.dispatch(tenantId, 'device.registered', { deviceId: 'd1' });

    // The existing helper is called, not reimplemented: a second HMAC implementation here
    // could drift from the one a receiver verifies against, and the failure is invisible
    // until a consumer rejects production traffic.
    expect(publicApiDouble.signWebhookPayload).toHaveBeenCalledWith('s1', { deviceId: 'd1' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-iot-signature']).toBe(
      require('node:crypto')
        .createHmac('sha256', 's1')
        .update(JSON.stringify({ deviceId: 'd1' }))
        .digest('hex'),
    );
    expect(headers['x-iot-event']).toBe('device.registered');

    expect(results).toEqual([
      { endpointId: 'a', event: 'device.registered', status: WebhookDeliveryStatus.DELIVERED, statusCode: 200, attempts: 1 },
    ]);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, endpointId: 'a', ok: true, statusCode: 200 }),
      }),
    );
  });

  it('records a failed delivery and still delivers to the remaining endpoints', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'dead', enabled: true, events: ['*'], signingSecret: 's1', url: 'https://dead' },
      { id: 'alive', enabled: true, events: ['*'], signingSecret: 's2', url: 'https://alive' },
    ]);
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ status: 204, ok: true });
    (global as never as { fetch: unknown }).fetch = fetchMock;

    const service = new WebhookDispatchService(
      prisma as never,
      new WebhookRepository(prisma as never),
      publicApiDouble as never,
    );
    const results = await service.dispatch(tenantId, 'alert.raised', { alertId: 'a1' });

    // One dead receiver must not stop the batch, and the evidence of the attempt is the
    // delivery row rather than a thrown error.
    expect(results.map((r) => r.status)).toEqual([
      WebhookDeliveryStatus.FAILED,
      WebhookDeliveryStatus.DELIVERED,
    ]);
    expect(results[0].statusCode).toBeNull();
    expect(prisma.webhookDelivery.create).toHaveBeenCalledTimes(2);
  });

  it('records a 500 as a failure without treating it as delivered', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'a', enabled: true, events: ['*'], signingSecret: 's1', url: 'https://a' },
    ]);
    (global as never as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ status: 500, ok: false });

    const service = new WebhookDispatchService(
      prisma as never,
      new WebhookRepository(prisma as never),
      publicApiDouble as never,
    );
    const results = await service.dispatch(tenantId, 'alert.raised', {});

    expect(results[0].status).toBe(WebhookDeliveryStatus.FAILED);
    expect(results[0].statusCode).toBe(500);
    expect(prisma.webhookDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ok: false, statusCode: 500 }) }),
    );
  });

  it('stores no secret on the delivery row, so the audit trail is not a credential store', async () => {
    const prisma = makePrisma();
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { id: 'a', enabled: true, events: ['*'], signingSecret: 'whsec_very_secret', url: 'https://a' },
    ]);
    (global as never as { fetch: unknown }).fetch = jest.fn().mockResolvedValue({ status: 200, ok: true });

    const service = new WebhookDispatchService(
      prisma as never,
      new WebhookRepository(prisma as never),
      publicApiDouble as never,
    );
    await service.dispatch(tenantId, 'alert.raised', {});

    const [call] = prisma.webhookDelivery.create.mock.calls;
    expect(JSON.stringify(call)).not.toContain('whsec_very_secret');
  });

  it('recent deliveries are scoped to the tenant', async () => {
    const prisma = makePrisma();
    const service = new WebhookDispatchService(
      prisma as never,
      new WebhookRepository(prisma as never),
      publicApiDouble as never,
    );
    await service.recentDeliveries(tenantId);
    expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });
});

describe('WebhookModule wiring', () => {
  it('resolves the dispatch service, so the PublicApiModule import is real', async () => {
    // Nest resolves DI per module. A service registered only in `AppModule` is not injectable
    // here, and a green build does not catch it — only a boot does.
    const { WebhookModule } = await import('./webhook.module');
    const moduleRef = await Test.createTestingModule({
      imports: [WebhookModule],
    })
      .overrideProvider('PublicApiService')
      .useValue(publicApiDouble)
      .compile();

    expect(moduleRef.get(WebhookDispatchService)).toBeInstanceOf(WebhookDispatchService);
    await moduleRef.close();
  });
});

describe('tenant isolation across the surface', () => {
  it('never resolves one tenant’s endpoint under another tenant’s id', async () => {
    const prisma = makePrisma();
    // A row that exists, but belongs to someone else.
    prisma.webhookEndpoint.findFirst.mockImplementation(({ where }: { where: { tenantId: string } }) =>
      Promise.resolve(where.tenantId === otherTenantId ? { id: 'e', tenantId: otherTenantId } : null),
    );
    const repository = new WebhookRepository(prisma as never);

    await expect(repository.findEndpoint(tenantId, 'e')).rejects.toBeInstanceOf(
      DomainNotFoundException,
    );
    await expect(repository.findEndpoint(otherTenantId, 'e')).resolves.toMatchObject({
      id: 'e',
    });
  });
});
