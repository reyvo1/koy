import * as mqtt from 'mqtt';

import { MqttBridgeAdapter, MQTT_BRIDGE_QOS } from './mqtt-bridge.adapter';
import { IntegrationRegistryService } from '../integration-registry.service';

/**
 * Behavioural tests for the MQTT bridge adapter.
 *
 * The source contract proves the adapter is wired to a broker. These prove what it does when the
 * broker misbehaves, which is the part that decides whether an operator is told the truth:
 *
 *  - a connect that fails must record `ERROR` with a reason, not leave the integration looking
 *    `REGISTERED`, which reads as "never attempted";
 *  - a sync must publish *before* recording the mapping, because the mapping is what a later
 *    reconciliation trusts — a mapping that claims an entity the bridge was never told about is worse
 *    than a missing row;
 *  - an id from another tenant must never reach `recordSync`.
 *
 * `mqtt.connect` is stubbed at the module boundary, so no broker is required. What this cannot prove
 * is that a real broker accepts our frames; that is checked live by `probe-integration-mqtt.sh`.
 */

jest.mock('mqtt', () => ({ connect: jest.fn() }));

interface FakeClient {
  options: { clientId?: string };
  on: jest.Mock;
  once: jest.Mock;
  removeListener: jest.Mock;
  subscribe: jest.Mock;
  publish: jest.Mock;
  end: jest.Mock;
  emit: (event: string, ...args: unknown[]) => void;
  hasListener: (event: string) => boolean;
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const listeners = new Map<string, (arg?: unknown) => void>();
  const client: FakeClient = {
    options: { clientId: 'bridge-client' },
    on: jest.fn(),
    once: jest.fn((event: string, handler: (arg?: unknown) => void) => {
      listeners.set(event, handler);
    }),
    removeListener: jest.fn((event: string) => {
      listeners.delete(event);
    }),
    subscribe: jest.fn((_topic: string, _opts: unknown, cb: (e?: Error) => void) => cb()),
    publish: jest.fn((_t: string, _p: string, _o: unknown, cb: (e?: Error) => void) => cb()),
    end: jest.fn((_force?: boolean, _opts?: unknown, cb?: () => void) => cb?.()),
    emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(args[0]),
    hasListener: (event: string) => listeners.has(event),
    ...overrides,
  };
  return client;
}

describe('MqttBridgeAdapter', () => {
  let registry: {
    verifyIntegration: jest.Mock;
    setStatus: jest.Mock;
    recordSync: jest.Mock;
  };
  let adapter: MqttBridgeAdapter;
  let client: FakeClient;

  const config = { brokerUrl: 'mqtt://broker:1883', topicPrefix: 'tenant-a' };

  beforeEach(() => {
    registry = {
      verifyIntegration: jest
        .fn()
        .mockResolvedValue({ id: 'int-1', provider: 'MQTT_BRIDGE', credentialRef: 'secret://a' }),
      setStatus: jest.fn().mockResolvedValue(undefined),
      recordSync: jest.fn().mockResolvedValue(undefined),
    };
    adapter = new MqttBridgeAdapter(registry as unknown as IntegrationRegistryService);
    client = makeClient();
    (mqtt.connect as unknown as jest.Mock).mockReturnValue(client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Waits until the adapter has actually registered its listener, then fires `event`.
   *
   * The adapter awaits `verifyIntegration` before opening a socket, so a fixed number of microtask
   * turns is a race: enough on one run, not on another. Polling for the listener makes the tests
   * deterministic instead of occasionally passing.
   */
  async function fireWhenListening(event: string, arg?: unknown): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (client.hasListener(event)) {
        client.emit(event, arg);
        return;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`adapter never registered a ${event} listener`);
  }

  async function connectNow(): Promise<void> {
    await fireWhenListening('connect');
  }

  describe('connect', () => {
    it('records CONNECTED and returns only after the subscribe is acknowledged', async () => {
      const promise = adapter.connect({ integrationId: 'int-1', tenantId: 'tenant-a', config });
      await connectNow();

      const result = await promise;
      expect(result.connected).toBe(true);
      expect(client.subscribe).toHaveBeenCalledWith('tenant-a/#', { qos: MQTT_BRIDGE_QOS }, expect.any(Function));
      expect(registry.setStatus).toHaveBeenCalledWith({
        integrationId: 'int-1',
        tenantId: 'tenant-a',
        status: 'CONNECTED',
      });
    });

    it('records ERROR with the reason when the broker refuses the connection', async () => {
      const promise = adapter.connect({ integrationId: 'int-1', tenantId: 'tenant-a', config });
      await fireWhenListening('error', new Error('ECONNREFUSED'));

      await expect(promise).rejects.toThrow(/ECONNREFUSED/);
      expect(registry.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ERROR', lastError: expect.stringContaining('ECONNREFUSED') }),
      );
      expect(registry.setStatus).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'CONNECTED' }));
    });

    it('records ERROR when the subscribe is refused after a successful connect', async () => {
      client.subscribe.mockImplementation(
        (_t: string, _o: unknown, cb: (e?: Error) => void) => cb(new Error('not authorised')),
      );
      const promise = adapter.connect({ integrationId: 'int-1', tenantId: 'tenant-a', config });
      await connectNow();

      await expect(promise).rejects.toThrow(/not authorised/);
      expect(registry.setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ERROR' }),
      );
    });

    it('refuses to bridge an integration registered for another provider', async () => {
      registry.verifyIntegration.mockResolvedValue({
        id: 'int-2',
        provider: 'GOOGLE_HOME',
        credentialRef: 'secret://b',
      });
      await expect(
        adapter.connect({ integrationId: 'int-2', tenantId: 'tenant-a', config }),
      ).rejects.toThrow(/bukan MQTT_BRIDGE/);
      expect(mqtt.connect).not.toHaveBeenCalled();
    });

    it('does not open a socket for an integration the tenant does not own', async () => {
      registry.verifyIntegration.mockRejectedValue(new Error('Integration tidak ditemukan'));
      await expect(
        adapter.connect({ integrationId: 'foreign', tenantId: 'tenant-a', config }),
      ).rejects.toThrow();
      expect(mqtt.connect).not.toHaveBeenCalled();
    });
  });

  describe('syncEntity', () => {
    it('publishes before recording the mapping', async () => {
      const order: string[] = [];
      client.publish.mockImplementation(
        (_t: string, _p: string, _o: unknown, cb: (e?: Error) => void) => {
          order.push('publish');
          cb();
        },
      );
      registry.recordSync.mockImplementation(async () => {
        order.push('recordSync');
      });

      const pending = adapter.syncEntity({
        integrationId: 'int-1',
        tenantId: 'tenant-a',
        config,
        entity: { entityType: 'DEVICE', externalEntityId: 'ext 1', internalEntityId: 'dev-1' },
        payload: { on: true },
      });
      await connectNow();
      await pending;

      expect(order).toEqual(['publish', 'recordSync']);
    });

    it('records no mapping when the publish fails', async () => {
      client.publish.mockImplementation(
        (_t: string, _p: string, _o: unknown, cb: (e?: Error) => void) => cb(new Error('no route')),
      );
      const pending = adapter.syncEntity({
        integrationId: 'int-1',
        tenantId: 'tenant-a',
        config,
        entity: { entityType: 'DEVICE', externalEntityId: 'ext-1', internalEntityId: 'dev-1' },
        payload: {},
      });
      await connectNow();
      await expect(pending).rejects.toThrow(/no route/);
      expect(registry.recordSync).not.toHaveBeenCalled();
    });

    it('encodes the external id into the topic', async () => {
      // A raw `/` or `+` in an id would change what the topic means and could subscribe the bridge
      // to more than the tenant was granted.
      const pending = adapter.syncEntity({
        integrationId: 'int-1',
        tenantId: 'tenant-a',
        config,
        entity: { entityType: 'DEVICE', externalEntityId: 'a/b+c', internalEntityId: 'dev-1' },
        payload: {},
      });
      await connectNow();
      const result = await pending;
      expect(result.topic).toBe('tenant-a/DEVICE/a%2Fb%2Bc');
    });

    it('passes the external id through untouched to the mapping', async () => {
      // Encoded in the topic, verbatim in the mapping: the mapping is the join key, and re-encoding
      // it would make a later reconciliation miss the row.
      const pending = adapter.syncEntity({
        integrationId: 'int-1',
        tenantId: 'tenant-a',
        config,
        entity: { entityType: 'DEVICE', externalEntityId: 'a/b', internalEntityId: 'dev-1' },
        payload: {},
      });
      await connectNow();
      await pending;
      expect(registry.recordSync).toHaveBeenCalledWith(
        expect.objectContaining({ externalEntityId: 'a/b' }),
      );
    });

    it('closes the connection even when the mapping write fails', async () => {
      registry.recordSync.mockRejectedValue(new Error('integration not found'));
      const pending = adapter.syncEntity({
        integrationId: 'foreign',
        tenantId: 'tenant-a',
        config,
        entity: { entityType: 'DEVICE', externalEntityId: 'e', internalEntityId: 'i' },
        payload: {},
      });
      await connectNow();
      await expect(pending).rejects.toThrow();
      expect(client.end).toHaveBeenCalled();
    });
  });
});
