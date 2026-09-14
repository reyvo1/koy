import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, Server, TLSSocket } from 'node:tls';
import { ConfigService } from '@nestjs/config';
import { generate, parser } from 'mqtt-packet';
import { connect } from 'mqtt';
import { MqttJsPublisherAdapter } from '../src/mqtt/mqtt-js-publisher.adapter';

interface CapturedPublish {
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  messageExpiryInterval?: number;
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolvePromise, reject) => {
    const poll = () => {
      if (predicate()) {
        resolvePromise();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('Timed out waiting for MQTT publisher readiness'));
        return;
      }

      setTimeout(poll, 20);
    };

    poll();
  });
}

describe('MQTT production publisher TLS integration', () => {
  let server: Server;
  let socket: TLSSocket | undefined;
  let capturedResolve: (value: CapturedPublish) => void;
  let capturedReject: (reason: Error) => void;
  let captured: Promise<CapturedPublish>;

  beforeEach(() => {
    captured = new Promise<CapturedPublish>((resolvePromise, reject) => {
      capturedResolve = resolvePromise;
      capturedReject = reject;
    });
  });

  afterEach(async () => {
    socket?.destroy();
    await new Promise<void>((resolvePromise) => {
      if (!server?.listening) {
        resolvePromise();
        return;
      }
      server.close(() => resolvePromise());
    });
  });

  it('verifies TLS identity and receives a non-retained QoS 1 MQTT 5 publish', async () => {
    const certificate = resolve(__dirname, 'fixtures/mqtt-tls/server-cert.pem');
    const key = resolve(__dirname, 'fixtures/mqtt-tls/server-key.pem');

    server = createServer(
      {
        cert: readFileSync(certificate),
        key: readFileSync(key),
      },
      (connectedSocket) => {
        socket = connectedSocket;
        const packetParser = parser({ protocolVersion: 5 });
        connectedSocket.on('data', (chunk) => packetParser.parse(chunk));
        connectedSocket.on('error', (error) => capturedReject(error));
        packetParser.on('error', (error) => capturedReject(error));
        packetParser.on('packet', (packet: any) => {
          if (packet.cmd === 'connect') {
            connectedSocket.write(
              generate(
                {
                  cmd: 'connack',
                  sessionPresent: false,
                  reasonCode: 0,
                  properties: {},
                } as any,
                { protocolVersion: 5 },
              ),
            );
            return;
          }

          if (packet.cmd === 'publish') {
            capturedResolve({
              topic: packet.topic,
              payload: packet.payload.toString('utf8'),
              qos: packet.qos,
              retain: packet.retain,
              messageExpiryInterval: packet.properties?.messageExpiryInterval,
            });
            connectedSocket.write(
              generate(
                {
                  cmd: 'puback',
                  messageId: packet.messageId,
                  reasonCode: 0,
                } as any,
                { protocolVersion: 5 },
              ),
            );
          }
        });
      },
    );

    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolvePromise());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('TLS MQTT test server did not expose a port');
    }

    const adapter = new MqttJsPublisherAdapter(
      new ConfigService({
        MQTT_BROKER_URL: `mqtts://localhost:${address.port}`,
        MQTT_CLIENT_ID_PREFIX: 'iot-integration',
        MQTT_USERNAME: 'publisher',
        MQTT_PASSWORD: 'test-password',
        MQTT_CA_FILE: certificate,
        MQTT_CONNECT_TIMEOUT_MS: 3000,
        MQTT_PUBLISH_TIMEOUT_MS: 3000,
        MQTT_KEEPALIVE_SECONDS: 30,
        MQTT_RECONNECT_PERIOD_MS: 1000,
        COMMAND_ACK_TIMEOUT_MS: 5000,
      }),
      connect,
    );

    adapter.onModuleInit();

    try {
      await waitFor(() => adapter.getReadiness().ready);
      await adapter.publish('tenants/t1/devices/d1/commands', {
        commandId: 'c1',
        payload: { power: true },
      });

      await expect(captured).resolves.toEqual({
        topic: 'tenants/t1/devices/d1/commands',
        payload: JSON.stringify({
          commandId: 'c1',
          payload: { power: true },
        }),
        qos: 1,
        retain: false,
        messageExpiryInterval: 5,
      });
    } finally {
      await adapter.shutdown();
    }
  });
});
