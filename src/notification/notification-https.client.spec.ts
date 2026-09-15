import { readFileSync } from 'node:fs';
import { createServer, Server } from 'node:https';
import { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { NotificationHttpsClient } from './notification-https.client';

jest.setTimeout(10000);

describe('NotificationHttpsClient', () => {
  let server: Server;
  let baseUrl: string;
  let cert: Buffer;
  const received: string[] = [];

  beforeAll(async () => {
    const key = readFileSync(
      join(process.cwd(), 'test/fixtures/wave2-localhost-tls.key.pem'),
    );
    cert = readFileSync(
      join(process.cwd(), 'test/fixtures/wave2-localhost-tls.cert.pem'),
    );
    server = createServer({ key, cert }, (request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        if (request.url === '/timeout') return;
        received.push(Buffer.concat(chunks).toString('utf8'));
        response.statusCode = 204;
        response.end();
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `https://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  beforeEach(() => {
    received.length = 0;
  });

  it('uses an explicit trusted CA without disabling TLS verification globally', async () => {
    const client = NotificationHttpsClient.withTrustedCa(cert);
    await expect(
      client.postJson(
        new URL(`${baseUrl}/ok`),
        { 'x-test': 'wave2' },
        { proof: true },
        1000,
      ),
    ).resolves.toEqual({ statusCode: 204 });
    expect(received).toEqual([JSON.stringify({ proof: true })]);
  });

  it('classifies an untrusted certificate as TLS instead of generic unreachable', async () => {
    const client = new NotificationHttpsClient();
    await expect(
      client.postJson(new URL(`${baseUrl}/ok`), {}, { proof: false }, 1000),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_HTTPS_TLS',
      kind: 'TLS',
    });
  });

  it('classifies a bounded request timeout explicitly', async () => {
    const client = NotificationHttpsClient.withTrustedCa(cert);
    await expect(
      client.postJson(new URL(`${baseUrl}/timeout`), {}, { proof: true }, 50),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_HTTPS_TIMEOUT',
      kind: 'TIMEOUT',
      causeCode: 'ETIMEDOUT',
    });
  });

  it('classifies socket/connect failures as network without hiding the cause code', async () => {
    const client = NotificationHttpsClient.withTrustedCa(cert);
    await expect(
      client.postJson(new URL('https://127.0.0.1:1/unreachable'), {}, {}, 500),
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_HTTPS_NETWORK',
      kind: 'NETWORK',
      causeCode: expect.any(String),
    });
  });
});
