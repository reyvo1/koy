import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, Server } from 'node:https';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { NotificationService } from '../../src/notification/notification.service';
import type { ClaimedNotificationDelivery } from '../../src/notification/notification.service';
import { WebhookTransport } from '../../src/notification/webhook.transport';
import type { NotificationTransportInput } from '../../src/notification/webhook.transport';
import { PrismaService } from '../../src/prisma/prisma.service';

jest.setTimeout(30000);

function toWebhookInput(
  item: ClaimedNotificationDelivery,
): NotificationTransportInput {
  return {
    notificationId: item.id,
    deliveryLeaseId: item.deliveryLeaseId,
    channel: item.channel,
    destination: item.destination,
    subject: item.subject,
    body: item.body,
  };
}

describe('Wave 2 notification runtime integration', () => {
  const prismaA = new PrismaClient();
  const prismaB = new PrismaClient();
  const serviceA = new NotificationService(
    prismaA as unknown as PrismaService,
  );
  const serviceB = new NotificationService(
    prismaB as unknown as PrismaService,
  );
  const webhookA = new WebhookTransport(serviceA);

  let tenantId = '';
  let server: Server | undefined;
  let baseUrl = '';
  let retryEndpointCalls = 0;
  const received: Array<{
    url: string;
    idempotencyKey?: string;
    notificationId?: string;
    body: unknown;
  }> = [];
  const priorTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  beforeAll(async () => {
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
    tenantId = (
      await prismaA.tenant.create({
        data: { name: `wave2-notification-${randomUUID()}` },
      })
    ).id;

    const key = readFileSync(
      join(process.cwd(), 'test/fixtures/wave2-localhost-tls.key.pem'),
    );
    const cert = readFileSync(
      join(process.cwd(), 'test/fixtures/wave2-localhost-tls.cert.pem'),
    );

    server = createServer({ key, cert }, (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        received.push({
          url: request.url ?? '/',
          idempotencyKey: request.headers['idempotency-key'] as
            | string
            | undefined,
          notificationId: request.headers['x-iot-notification-id'] as
            | string
            | undefined,
          body: raw ? JSON.parse(raw) : null,
        });

        if (request.url === '/terminal-400') {
          response.statusCode = 400;
        } else if (request.url === '/retry-503') {
          retryEndpointCalls += 1;
          response.statusCode = retryEndpointCalls === 1 ? 503 : 204;
        } else {
          response.statusCode = 204;
        }
        response.end();
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `https://127.0.0.1:${address.port}`;

    // Test-only trust override for the local self-signed HTTPS receiver. The
    // production transport still requires HTTPS and keeps its normal TLS path.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  });

  afterAll(async () => {
    if (priorTlsSetting === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = priorTlsSetting;
    }
    try {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (tenantId) {
        await prismaA.notification.deleteMany({ where: { tenantId } });
        await prismaA.tenant.deleteMany({ where: { id: tenantId } });
      }
    } finally {
      await Promise.all([prismaA.$disconnect(), prismaB.$disconnect()]);
    }
  });

  beforeEach(() => {
    received.length = 0;
    retryEndpointCalls = 0;
  });

  it('claims exactly one lease across two database clients and delivers through a real local HTTPS receiver', async () => {
    const queued = await serviceA.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      destination: `${baseUrl}/ok`,
      body: 'wave2 delivery proof',
      idempotencyKey: `wave2-ok-${randomUUID()}`,
    });

    const [claimA, claimB] = await Promise.all([
      serviceA.claimDueBatch(1),
      serviceB.claimDueBatch(1),
    ]);
    const items = [...claimA.items, ...claimB.items].filter(
      (item) => item.id === queued.notificationId,
    );
    expect(items).toHaveLength(1);

    await webhookA.deliverAndRecord(toWebhookInput(items[0]));

    const durable = await prismaA.notification.findUniqueOrThrow({
      where: { id: queued.notificationId },
    });
    expect(durable).toMatchObject({
      status: 'SENT',
      attemptCount: 1,
      nextRetryAt: null,
      deliveryLeaseId: null,
      deliveryLeaseAt: null,
    });
    expect(durable.sentAt).toBeInstanceOf(Date);
    expect(received).toEqual([
      expect.objectContaining({
        url: '/ok',
        idempotencyKey: `iot-notification:${queued.notificationId}`,
        notificationId: queued.notificationId,
        body: expect.objectContaining({
          notificationId: queued.notificationId,
          channel: 'WEBHOOK',
          body: 'wave2 delivery proof',
        }),
      }),
    ]);
  });

  it('records HTTP 400 as terminal instead of retrying it', async () => {
    const queued = await serviceA.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      destination: `${baseUrl}/terminal-400`,
      body: 'terminal failure proof',
      idempotencyKey: `wave2-terminal-${randomUUID()}`,
    });
    const claim = await serviceA.claimDueBatch(10);
    const item = claim.items.find((candidate) => candidate.id === queued.notificationId);
    expect(item).toBeDefined();

    await expect(
      webhookA.deliverAndRecord(toWebhookInput(item!)),
    ).rejects.toMatchObject({
      code: 'WEBHOOK_HTTP_400',
    });

    await expect(
      prismaA.notification.findUniqueOrThrow({ where: { id: queued.notificationId } }),
    ).resolves.toMatchObject({
      status: 'EXHAUSTED',
      attemptCount: 1,
      lastErrorCode: 'WEBHOOK_HTTP_400',
      nextRetryAt: null,
      deliveryLeaseId: null,
    });
  });

  it('persists a retryable 503 backoff, reclaims it, and succeeds on the next real HTTPS attempt', async () => {
    const queued = await serviceA.enqueue({
      tenantId,
      channel: 'WEBHOOK',
      destination: `${baseUrl}/retry-503`,
      body: 'retry proof',
      idempotencyKey: `wave2-retry-${randomUUID()}`,
    });
    const firstClaim = await serviceA.claimDueBatch(10);
    const first = firstClaim.items.find(
      (candidate) => candidate.id === queued.notificationId,
    );
    expect(first).toBeDefined();

    await expect(
      webhookA.deliverAndRecord(toWebhookInput(first!)),
    ).rejects.toMatchObject({
      code: 'WEBHOOK_HTTP_503',
    });
    const pending = await prismaA.notification.findUniqueOrThrow({
      where: { id: queued.notificationId },
    });
    expect(pending.status).toBe('PENDING');
    expect(pending.attemptCount).toBe(1);
    expect(pending.lastErrorCode).toBe('WEBHOOK_HTTP_503');
    expect(pending.nextRetryAt).toBeInstanceOf(Date);

    await prismaA.notification.update({
      where: { id: queued.notificationId },
      data: { nextRetryAt: new Date(Date.now() - 1_000) },
    });
    const secondClaim = await serviceB.claimDueBatch(10);
    const second = secondClaim.items.find(
      (candidate) => candidate.id === queued.notificationId,
    );
    expect(second).toBeDefined();
    expect(second!.deliveryLeaseId).not.toBe(first!.deliveryLeaseId);

    await webhookA.deliverAndRecord(toWebhookInput(second!));

    await expect(
      prismaA.notification.findUniqueOrThrow({ where: { id: queued.notificationId } }),
    ).resolves.toMatchObject({
      status: 'SENT',
      attemptCount: 2,
      lastErrorCode: null,
      nextRetryAt: null,
      deliveryLeaseId: null,
    });
    expect(retryEndpointCalls).toBe(2);
  });
});
