import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { RuntimeConnectionsService } from './runtime-connections.service';
describe('operator connection isolation', () => {
  const service = new RuntimeConnectionsService();
  let dir: string, file: string;
  const old = process.env.IOT_RUNTIME_CONNECTIONS_FILE;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iot-connections-'));
    file = join(dir, 'connections.json');
    process.env.IOT_RUNTIME_CONNECTIONS_FILE = file;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (old === undefined) delete process.env.IOT_RUNTIME_CONNECTIONS_FILE;
    else process.env.IOT_RUNTIME_CONNECTIONS_FILE = old;
  });
  const entry = {
    tenantId: 't1',
    reference: 'secret://fixture',
    kind: 'MQTT_BRIDGE',
    config: { password: 'fixture-secret' },
  };
  function write(rows: unknown) {
    writeFileSync(file, JSON.stringify(rows), { mode: 0o600 });
  }
  it('resolves only an exact tenant/reference/provider tuple', () => {
    write([entry]);
    expect(service.resolve('t1', 'secret://fixture', 'MQTT_BRIDGE')).toEqual(
      entry.config,
    );
    expect(() =>
      service.resolve('t2', 'secret://fixture', 'MQTT_BRIDGE'),
    ).toThrow();
    expect(() => service.resolve('t1', 'secret://fixture', 'CAMERA')).toThrow();
  });
  it('refuses duplicates instead of choosing arbitrary credentials', () => {
    write([entry, entry]);
    expect(() =>
      service.resolve('t1', entry.reference, 'MQTT_BRIDGE'),
    ).toThrow();
  });
  it('refuses world-readable operator secrets', () => {
    write([entry]);
    chmodSync(file, 0o644);
    expect(() =>
      service.resolve('t1', entry.reference, 'MQTT_BRIDGE'),
    ).toThrow();
  });
  it.each([{}, [null], [{ ...entry, config: [] }]])(
    'sanitizes invalid registries %p',
    (rows) => {
      write(rows);
      try {
        service.resolve('t1', entry.reference, 'MQTT_BRIDGE');
        throw new Error('accepted');
      } catch (error) {
        expect(String(error)).not.toContain('fixture-secret');
        expect(String(error)).toContain('Koneksi belum');
      }
    },
  );
});
