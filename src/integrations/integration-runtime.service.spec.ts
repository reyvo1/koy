import { IntegrationRuntimeService } from './integration-runtime.service';
describe('integration runtime uses real acknowledgements and tenant boundaries', () => {
  const originalFetch = global.fetch;
  let service: IntegrationRuntimeService,
    prisma: any,
    registry: any,
    connections: any,
    mqtt: any;
  beforeEach(() => {
    prisma = {
      device: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'd1', name: 'lamp', status: 'ACTIVE' }),
      },
      integrationSyncState: { findMany: jest.fn().mockResolvedValue([]) },
    };
    registry = {
      verifyIntegration: jest.fn().mockResolvedValue({
        provider: 'HOME_ASSISTANT',
        credentialRef: 'secret://ha',
        status: 'REGISTERED',
      }),
      setStatus: jest.fn().mockResolvedValue(undefined),
      recordSync: jest.fn().mockResolvedValue(undefined),
    };
    connections = {
      resolve: jest.fn().mockReturnValue({
        baseUrl: 'https://fixture.invalid',
        token: 'secret-fixture',
      }),
    };
    mqtt = {
      connect: jest.fn().mockResolvedValue({}),
      syncEntity: jest.fn().mockResolvedValue({}),
    };
    service = new IntegrationRuntimeService(
      prisma,
      registry,
      connections,
      mqtt,
    );
    global.fetch = jest.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });
  it('performs authenticated provider request before CONNECTED', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'API running.' }),
    });
    await service.connect('t1', 'i1');
    expect(global.fetch).toHaveBeenCalledWith(
      new URL('https://fixture.invalid/api/'),
      expect.objectContaining({
        headers: {
          authorization: 'Bearer secret-fixture',
          'content-type': 'application/json',
        },
        redirect: 'error',
      }),
    );
    expect(registry.setStatus).toHaveBeenCalledWith({
      tenantId: 't1',
      integrationId: 'i1',
      status: 'CONNECTED',
    });
  });
  it('never calls provider after foreign integration denial', async () => {
    registry.verifyIntegration.mockRejectedValue(new Error('denied'));
    await expect(service.connect('foreign', 'i1')).rejects.toThrow('denied');
    expect(connections.resolve).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('does not publish a foreign device', async () => {
    prisma.device.findFirst.mockResolvedValue(null);
    await expect(service.syncDevice('t1', 'i1', 'foreign')).rejects.toThrow();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(registry.recordSync).not.toHaveBeenCalled();
  });
  it('does not sync disabled integrations', async () => {
    registry.verifyIntegration.mockResolvedValue({
      provider: 'HOME_ASSISTANT',
      credentialRef: 'secret://ha',
      status: 'DISABLED',
    });
    await expect(service.syncDevice('t1', 'i1', 'd1')).rejects.toThrow(
      'nonaktif',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('requires provider entity acknowledgement before recording sync', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ entity_id: 'wrong' }),
    });
    await expect(service.syncDevice('t1', 'i1', 'd1')).rejects.toThrow(
      'Sinkronisasi',
    );
    expect(registry.recordSync).not.toHaveBeenCalled();
    expect(registry.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ERROR' }),
    );
  });
  it('records the canonical device entity after HA acknowledgement', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ entity_id: 'sensor.iot_d1' }),
    });
    expect(await service.syncDevice('t1', 'i1', 'd1')).toEqual({
      synced: true,
      entityId: 'iot_d1',
    });
    expect(registry.recordSync).toHaveBeenCalledWith({
      tenantId: 't1',
      integrationId: 'i1',
      entityType: 'device',
      externalEntityId: 'iot_d1',
      internalEntityId: 'd1',
    });
  });
  it('reports unavailable provider instead of leaking its credentials', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('secret-fixture'));
    await expect(service.connect('t1', 'i1')).rejects.toThrow(
      'Koneksi provider gagal.',
    );
    expect(JSON.stringify(registry.setStatus.mock.calls)).not.toContain(
      'secret-fixture',
    );
  });
  it('keeps unsupported provider authorization explicit', async () => {
    registry.verifyIntegration.mockResolvedValue({ provider: 'ALEXA' });
    await expect(service.connect('t1', 'i1')).rejects.toThrow('otorisasi');
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('refuses a bridge prefix outside the tenant', async () => {
    registry.verifyIntegration.mockResolvedValue({
      provider: 'MQTT_BRIDGE',
      credentialRef: 'secret://mqtt',
    });
    connections.resolve.mockReturnValue({
      brokerUrl: 'mqtt://127.0.0.1',
      topicPrefix: 'tenant/other/',
    });
    await expect(service.connect('t1', 'i1')).rejects.toThrow(
      'Koneksi provider',
    );
    expect(mqtt.connect).not.toHaveBeenCalled();
  });
});
