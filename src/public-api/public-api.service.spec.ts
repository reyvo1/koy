import { PrismaService } from '../prisma/prisma.service';
import { PublicApiService } from './public-api.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let captured: Record<string, unknown>;

describe('PublicApiService', () => {
  let create: jest.Mock;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let updateMany: jest.Mock;
  let service: PublicApiService;

  beforeEach(() => {
    captured = {};
    create = jest.fn().mockImplementation(({ data }) => {
      captured = data;
      return Promise.resolve({ id: 'key1', ...data });
    });
    findUnique = jest.fn().mockImplementation(() => {
      if (!captured.keyHash) return Promise.resolve(null);
      return Promise.resolve(null);
    });
    update = jest.fn().mockResolvedValue({});
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    service = new PublicApiService({
      apiKey: { create, findUnique, update, updateMany },
    } as unknown as PrismaService);
  });

  it('creates a hashed key and returns plaintext exactly once', async () => {
    const result = await service.createApiKey({
      tenantId,
      name: 'Integration key',
      scopes: ['TELEMETRY_READ'],
    });

    expect(result.plaintext).toHaveLength(64);
    expect(result.keyPrefix).toBe(result.plaintext.slice(0, 12));
    expect(captured.keyHash).not.toBe(result.plaintext);
    expect(captured.keyHash).toHaveLength(64);
  });

  it('rejects invalid scopes', async () => {
    await expect(
      service.createApiKey({
        tenantId,
        name: 'bad',
        scopes: ['NOT_A_SCOPE'],
      }),
    ).rejects.toMatchObject({ code: 'API_KEY_SCOPES_INVALID' });
  });

  it('signs webhook payloads deterministically (HMAC-SHA256)', async () => {
    const { createHmac } = require('node:crypto');
    const payload = { event: 'telemetry.received', id: 1 };
    const sig1 = service.signWebhookPayload('secret', payload);
    const sig2 = service.signWebhookPayload('secret', payload);
    const sig3 = service.signWebhookPayload('other', payload);

    expect(sig1).toBe(sig2);
    expect(sig1).not.toBe(sig3);
    expect(createHmac('sha256', 'secret').update(JSON.stringify(payload)).digest('hex')).toBe(sig1);
  });

  it('authenticates a valid presented key end-to-end', async () => {
    const created = await service.createApiKey({
      tenantId,
      name: 'e2e',
      scopes: ['DEVICE_CONTROL'],
    });
    // Simulate stored row lookup returning the hashed record.
    findUnique.mockImplementation(({ where }) => {
      if (where.keyPrefix === created.keyPrefix) {
        return Promise.resolve({
          id: created.id,
          tenantId,
          keyPrefix: created.keyPrefix,
          keyHash: require('node:crypto')
            .createHash('sha256')
            .update(created.plaintext)
            .digest('hex'),
          status: 'ACTIVE',
          expiresAt: null,
          scopes: ['DEVICE_CONTROL'],
        });
      }
      return Promise.resolve(null);
    });

    const auth = await service.authenticate(created.plaintext);
    expect(auth).toEqual({ tenantId, scopes: ['DEVICE_CONTROL'] });
    expect(update).toHaveBeenCalledTimes(1); // lastUsedAt touch
  });
});
