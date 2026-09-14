import {
  CommandStatus,
  DeviceStatus,
  DeviceType,
  PrismaClient,
} from '@prisma/client';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../src/app.module';
import { createTestApplication } from '../support/create-test-application';
import {
  closeMqttTestClient,
  connectMqttTestClient,
  MqttTestClient,
  publishMqttTestMessage,
  subscribeMqttTestClient,
  waitForMqttMessage,
} from '../support/mqtt-test-client';
import { createMqttTestClientId } from '../support/mqtt-test-environment';

interface BridgeResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

interface PendingBridgeResponse {
  resolve: (response: BridgeResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

describe('MQTT workflow integration foundation', () => {
  jest.setTimeout(45_000);

  const prisma = new PrismaClient();
  const runId = process.env.TEST_RUN_ID ?? `local-${process.pid}`;
  const brokerUrl = process.env.MQTT_TEST_URL as string;
  const topicPrefix = process.env.MQTT_TEST_TOPIC_PREFIX as string;
  const webhookSecret = process.env.MQTT_WEBHOOK_SECRET as string;
  const tenantName = `MQTT Integration ${runId}`;
  const pendingResponses = new Map<string, PendingBridgeResponse>();

  let app: NestFastifyApplication;
  let publisher: MqttTestClient;
  let bridge: MqttTestClient;
  let smokeSubscriber: MqttTestClient;
  let tenantId: string;
  let deviceId: string;
  let bridgeSequence = 0;

  const onBridgeMessage = (topic: string, payload: Buffer) => {
    void handleBridgeMessage(topic, payload).catch((error: unknown) => {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      rejectAllPending(normalized);
    });
  };

  beforeAll(async () => {
    await prisma.$connect();

    const tenant = await prisma.tenant.create({
      data: { name: tenantName },
    });
    tenantId = tenant.id;

    const device = await prisma.device.create({
      data: {
        tenantId,
        name: `MQTT integration device ${runId}`,
        type: DeviceType.ACTUATOR,
        status: DeviceStatus.ACTIVE,
      },
    });
    deviceId = device.id;

    await prisma.capability.create({
      data: {
        deviceId,
        key: 'temperature',
        semanticType: 'temperature',
        dataType: 'number',
        unit: 'celsius',
        isReadable: true,
        isWritable: false,
        isReportable: true,
      },
    });

    app = await createTestApplication({
      moduleMetadata: { imports: [AppModule] },
      overrideProviders: (builder) =>
        builder.overrideProvider('REDIS_CLIENT').useValue({
          ping: async () => 'PONG',
          quit: async () => 'OK',
          disconnect: () => undefined,
        }),
    });

    publisher = await connectMqttTestClient(
      brokerUrl,
      createMqttTestClientId(runId, 'publisher'),
    );
    bridge = await connectMqttTestClient(
      brokerUrl,
      createMqttTestClientId(runId, 'bridge'),
    );
    smokeSubscriber = await connectMqttTestClient(
      brokerUrl,
      createMqttTestClientId(runId, 'smoke'),
    );

    bridge.on('message', onBridgeMessage);
    await subscribeMqttTestClient(
      bridge,
      `${topicPrefix}/tenants/+/devices/+/#`,
    );
    await subscribeMqttTestClient(smokeSubscriber, `${topicPrefix}/smoke/#`);
  });

  afterAll(async () => {
    rejectAllPending(new Error('MQTT integration suite is closing'));
    bridge?.off('message', onBridgeMessage);

    const cleanupErrors: Error[] = [];
    const captureCleanup = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    };

    await captureCleanup(() =>
      Promise.all([
        closeMqttTestClient(smokeSubscriber),
        closeMqttTestClient(bridge),
        closeMqttTestClient(publisher),
      ]),
    );
    await captureCleanup(async () => app?.close());

    await captureCleanup(async () => {
      if (deviceId) {
        await prisma.telemetry.deleteMany({ where: { deviceId } });
        await prisma.deviceCommand.deleteMany({ where: { deviceId } });
        await prisma.capability.deleteMany({ where: { deviceId } });
        await prisma.device.deleteMany({ where: { id: deviceId } });
      }

      if (tenantId) {
        await prisma.tenant.deleteMany({ where: { id: tenantId } });
      }
    });
    await captureCleanup(() => prisma.$disconnect());

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        cleanupErrors,
        'MQTT integration cleanup failed',
      );
    }
  });

  it('round-trips a non-retained message below the run-owned topic prefix', async () => {
    const topic = `${topicPrefix}/smoke/round-trip`;
    const received = waitForMqttMessage(
      smokeSubscriber,
      (receivedTopic) => receivedTopic === topic,
    );

    await publishMqttTestMessage(publisher, topic, topicPrefix, {
      proof: 'mqtt-broker-round-trip',
    });

    const message = await received;

    expect(message.topic).toBe(topic);
    expect(JSON.parse(message.payload.toString('utf8'))).toEqual({
      proof: 'mqtt-broker-round-trip',
    });
  });

  it('persists telemetry through the broker-to-webhook workflow', async () => {
    const eventId = `mqtt-event-${runId}-${Date.now()}`;
    const topic = `${topicPrefix}/tenants/${tenantId}/devices/${deviceId}/telemetry`;

    const response = await publishWorkflow(topic, {
      eventId,
      payload: { temperature: 24.5 },
    });

    if (response.statusCode !== 201) {
      throw new Error(
        `Telemetry webhook returned ${response.statusCode}: ${JSON.stringify(response.body)}`,
      );
    }
    await expect(
      prisma.telemetry.findUnique({
        where: {
          deviceId_eventId: { deviceId, eventId },
        },
      }),
    ).resolves.toMatchObject({
      tenantId,
      deviceId,
      eventId,
      payload: { temperature: 24.5 },
    });
  });

  it('acknowledges a sent command through the broker-to-webhook workflow', async () => {
    const command = await prisma.deviceCommand.create({
      data: {
        tenantId,
        deviceId,
        payload: { power: true },
        status: CommandStatus.SENT,
        sentAt: new Date(),
      },
    });
    const topic = `${topicPrefix}/tenants/${tenantId}/devices/${deviceId}/commands/ack`;

    const response = await publishWorkflow(topic, {
      payload: { commandId: command.correlationId },
    });

    if (response.statusCode !== 200) {
      throw new Error(
        `Command acknowledgement webhook returned ${response.statusCode}: ${JSON.stringify(response.body)}`,
      );
    }
    expect(response.body).toMatchObject({
      message: 'Command acknowledged',
    });
    await expect(
      prisma.deviceCommand.findUnique({ where: { id: command.id } }),
    ).resolves.toMatchObject({
      status: CommandStatus.ACKNOWLEDGED,
    });
  });

  async function publishWorkflow(
    topic: string,
    workflowPayload: Record<string, unknown>,
  ): Promise<BridgeResponse> {
    const bridgeRequestId = `bridge-${++bridgeSequence}`;
    const response = new Promise<BridgeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingResponses.delete(bridgeRequestId);
        reject(
          new Error(`Timed out waiting for bridge response ${bridgeRequestId}`),
        );
      }, 8_000);

      pendingResponses.set(bridgeRequestId, { resolve, reject, timer });
    });

    try {
      await publishMqttTestMessage(publisher, topic, topicPrefix, {
        bridgeRequestId,
        ...workflowPayload,
      });
    } catch (error) {
      settleBridgeResponse(
        bridgeRequestId,
        undefined,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return response;
  }

  async function handleBridgeMessage(
    topic: string,
    payload: Buffer,
  ): Promise<void> {
    const message = JSON.parse(payload.toString('utf8')) as Record<
      string,
      unknown
    >;
    const bridgeRequestId = message.bridgeRequestId;

    if (typeof bridgeRequestId !== 'string') {
      return;
    }

    const platformTopic = topic.slice(`${topicPrefix}/`.length);
    let response;

    if (platformTopic.endsWith('/telemetry')) {
      response = await app.inject({
        method: 'POST',
        url: '/mqtt/webhook/telemetry',
        headers: { 'x-webhook-secret': webhookSecret },
        payload: {
          topic: platformTopic,
          eventId: message.eventId,
          payload: message.payload,
        },
      });
    } else if (platformTopic.endsWith('/commands/ack')) {
      response = await app.inject({
        method: 'POST',
        url: '/mqtt/ack',
        headers: { 'x-webhook-secret': webhookSecret },
        payload: {
          topic: platformTopic,
          payload: message.payload,
        },
      });
    } else {
      return;
    }

    settleBridgeResponse(bridgeRequestId, {
      statusCode: response.statusCode,
      body: response.json() as Record<string, unknown>,
    });
  }

  function settleBridgeResponse(
    bridgeRequestId: string,
    response?: BridgeResponse,
    error?: Error,
  ): void {
    const pending = pendingResponses.get(bridgeRequestId);

    if (!pending) {
      return;
    }

    pendingResponses.delete(bridgeRequestId);
    clearTimeout(pending.timer);

    if (error) {
      pending.reject(error);
      return;
    }

    pending.resolve(response as BridgeResponse);
  }

  function rejectAllPending(error: Error): void {
    for (const bridgeRequestId of pendingResponses.keys()) {
      settleBridgeResponse(bridgeRequestId, undefined, error);
    }
  }
});
