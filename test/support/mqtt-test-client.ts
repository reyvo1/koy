import { assertOwnedMqttTopic } from './mqtt-test-environment';

const CLIENT_CONNECT_TIMEOUT_MS = 7_500;
const CLIENT_CLOSE_TIMEOUT_MS = 5_000;

export interface MqttTestClient {
  on(event: 'connect' | 'error', listener: (...args: any[]) => void): this;
  on(
    event: 'message',
    listener: (topic: string, payload: Buffer) => void,
  ): this;
  once(event: 'connect' | 'error', listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(event?: string): this;
  subscribe(
    topic: string,
    options: { qos: 0 | 1 },
    callback: (error?: Error) => void,
  ): void;
  publish(
    topic: string,
    payload: string | Buffer,
    options: { qos: 0 | 1; retain: boolean },
    callback: (error?: Error) => void,
  ): void;
  end(
    force: boolean,
    options: Record<string, never>,
    callback: () => void,
  ): void;
}

export async function connectMqttTestClient(
  brokerUrl: string,
  clientId: string,
): Promise<MqttTestClient> {
  const loaded = require('mqtt') as {
    connect?: (url: string, options: Record<string, unknown>) => MqttTestClient;
    default?: {
      connect?: (
        url: string,
        options: Record<string, unknown>,
      ) => MqttTestClient;
    };
  };
  const connect = loaded.connect ?? loaded.default?.connect;

  if (!connect) {
    throw new Error('MQTT test client library does not expose connect()');
  }

  const client = connect(brokerUrl, {
    clientId,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 5_000,
    protocolVersion: 4,
  });

  // Keep teardown-time transport errors from becoming unhandled process errors.
  client.on('error', () => undefined);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      client.end(true, {}, () => undefined);
      reject(new Error(`Timed out connecting MQTT test client ${clientId}`));
    }, CLIENT_CONNECT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      client.off('connect', onConnect);
      client.off('error', onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    client.once('connect', onConnect);
    client.once('error', onError);
  });

  return client;
}

export function subscribeMqttTestClient(
  client: MqttTestClient,
  topicFilter: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    client.subscribe(topicFilter, { qos: 1 }, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function publishMqttTestMessage(
  client: MqttTestClient,
  topic: string,
  topicPrefix: string,
  payload: unknown,
): Promise<void> {
  assertOwnedMqttTopic(topic, topicPrefix);

  return new Promise((resolve, reject) => {
    client.publish(
      topic,
      JSON.stringify(payload),
      { qos: 1, retain: false },
      (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      },
    );
  });
}

export function waitForMqttMessage(
  client: MqttTestClient,
  predicate: (topic: string, payload: Buffer) => boolean,
  timeoutMs = 5_000,
): Promise<{ topic: string; payload: Buffer }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', onMessage);
      reject(new Error('Timed out waiting for MQTT test message'));
    }, timeoutMs);

    const onMessage = (topic: string, payload: Buffer) => {
      if (!predicate(topic, payload)) {
        return;
      }

      clearTimeout(timer);
      client.off('message', onMessage);
      resolve({ topic, payload });
    };

    client.on('message', onMessage);
  });
}

export function closeMqttTestClient(client?: MqttTestClient): Promise<void> {
  if (!client) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) {
        return;
      }

      completed = true;
      clearTimeout(timer);
      client.removeAllListeners();
      resolve();
    };
    const timer = setTimeout(() => {
      client.end(true, {}, finish);
    }, CLIENT_CLOSE_TIMEOUT_MS);

    client.end(false, {}, finish);
  });
}
