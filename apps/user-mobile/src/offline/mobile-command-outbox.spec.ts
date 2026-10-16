import { MobileApiError } from '../session/mobile-session-client';
import {
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_ENTRIES,
  MAX_OUTBOX_VALUE_BYTES,
  createMobileOutboxStore,
  outboxEntryKey,
  type MobileOutboxRow,
  type MobileOutboxStorePort,
} from './mobile-command-outbox';
import {
  connectMobileCommandOutbox,
  isMobileOfflineError,
  isTransientOutboxFailure,
  type MobileOutboxSender,
} from './mobile-offline-commands';

const ORIGIN = 'https://api.example';
const TENANT = 'tenant-1';
const NOW = new Date('2026-10-16T10:00:00.000Z');

class MemoryPort implements MobileOutboxStorePort {
  rows = new Map<string, MobileOutboxRow>();
  failRead = false;
  failUpsert = false;

  async readAll(): Promise<MobileOutboxRow[]> {
    if (this.failRead) throw new Error('read failed');
    return [...this.rows.values()];
  }

  async upsert(row: MobileOutboxRow): Promise<void> {
    if (this.failUpsert) throw new Error('write failed');
    this.rows.set(row.key, row);
  }

  async remove(keys: string[]): Promise<void> {
    for (const key of keys) this.rows.delete(key);
  }

  async removeAll(): Promise<void> {
    this.rows.clear();
  }
}

function offlineError(): MobileApiError {
  return new MobileApiError(0, 'MOBILE_API_UNREACHABLE', 'unreachable', null);
}

function makeBridge(port: MemoryPort, send: MobileOutboxSender) {
  const store = createMobileOutboxStore(port);
  const bridge = connectMobileCommandOutbox({ apiOrigin: ORIGIN, send, store });
  return { bridge, store };
}

describe('offline command outbox store', () => {
  it('enqueues a namespaced entry with a stable idempotency key', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);

    const result = await store.enqueue(
      ORIGIN,
      TENANT,
      { capabilityKey: 'power', deviceId: 'device-1', value: true },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entry.status).toBe('queued');
    expect(result.entry.attempts).toBe(0);
    expect(result.entry.idempotencyKey).toBe(`mobile-outbox-${result.entry.id}`);
    expect(result.entry.enqueuedAt).toBe(NOW.toISOString());
    expect(port.rows.has(outboxEntryKey(ORIGIN, TENANT, result.entry.id))).toBe(true);
    expect(port.rows.has(outboxEntryKey('https://other.example', TENANT, result.entry.id))).toBe(false);
  });

  it('refuses values the wire cannot carry without writing anything', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);

    for (const value of [
      { nested: true },
      ['a'],
      null,
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      new Date(),
      'x'.repeat(MAX_OUTBOX_VALUE_BYTES),
    ]) {
      const result = await store.enqueue(
        ORIGIN,
        TENANT,
        { capabilityKey: 'power', deviceId: 'device-1', value },
        NOW,
      );
      expect(result).toEqual({ ok: false, reason: 'VALUE_UNSUPPORTED' });
    }
    expect(port.rows.size).toBe(0);
  });

  it('accepts empty and boundary-sized strings and rejects one byte past the bound', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);

    const fits = 'x'.repeat(MAX_OUTBOX_VALUE_BYTES - 2);
    const overflow = 'x'.repeat(MAX_OUTBOX_VALUE_BYTES);

    expect(
      (await store.enqueue(ORIGIN, TENANT, { capabilityKey: 'power', deviceId: 'd', value: '' }, NOW)).ok,
    ).toBe(true);
    expect(
      (await store.enqueue(ORIGIN, TENANT, { capabilityKey: 'power', deviceId: 'd', value: fits }, NOW)).ok,
    ).toBe(true);
    expect(
      (await store.enqueue(ORIGIN, TENANT, { capabilityKey: 'power', deviceId: 'd', value: overflow }, NOW)).ok,
    ).toBe(false);
  });

  it('refuses to grow past the cap without dropping older commands', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);

    for (let index = 0; index < MAX_OUTBOX_ENTRIES; index += 1) {
      const result = await store.enqueue(
        ORIGIN,
        TENANT,
        { capabilityKey: 'power', deviceId: `device-${index}`, value: index },
        new Date(NOW.getTime() + index),
      );
      expect(result.ok).toBe(true);
    }

    const overflow = await store.enqueue(
      ORIGIN,
      TENANT,
      { capabilityKey: 'power', deviceId: 'device-overflow', value: true },
      new Date(NOW.getTime() + 100),
    );

    expect(overflow).toEqual({ ok: false, reason: 'OUTBOX_FULL' });
    expect(port.rows.size).toBe(MAX_OUTBOX_ENTRIES);
  });

  it('reads back only the requested origin and tenant, oldest first', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);

    await store.enqueue(ORIGIN, TENANT, { capabilityKey: 'power', deviceId: 'b', value: true }, new Date(NOW.getTime() + 2));
    await store.enqueue(ORIGIN, TENANT, { capabilityKey: 'power', deviceId: 'a', value: true }, new Date(NOW.getTime() + 1));
    await store.enqueue(ORIGIN, 'tenant-2', { capabilityKey: 'power', deviceId: 'c', value: true }, NOW);
    await store.enqueue('https://other.example', TENANT, { capabilityKey: 'power', deviceId: 'd', value: true }, NOW);

    const entries = await store.list(ORIGIN, TENANT);
    expect(entries.map((entry) => entry.deviceId)).toEqual(['a', 'b']);
  });

  it('drops unreadable rows instead of throwing', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);
    const valid = await store.enqueue(
      ORIGIN,
      TENANT,
      { capabilityKey: 'power', deviceId: 'valid', value: true },
      NOW,
    );
    expect(valid.ok).toBe(true);

    port.rows.set('broken-a', { enqueuedAt: NOW.toISOString(), key: 'broken-a', payload: 'not-json' });
    port.rows.set('broken-b', {
      enqueuedAt: NOW.toISOString(),
      key: 'broken-b',
      payload: JSON.stringify({ apiOrigin: ORIGIN, status: 'queued' }),
    });

    const entries = await store.list(ORIGIN, TENANT);
    expect(entries.map((entry) => entry.deviceId)).toEqual(['valid']);
  });

  it('reports storage failure and port failure instead of throwing', async () => {
    const port = new MemoryPort();
    const store = createMobileOutboxStore(port);
    port.failUpsert = true;
    const refused = await store.enqueue(
      ORIGIN,
      TENANT,
      { capabilityKey: 'power', deviceId: 'device-1', value: true },
      NOW,
    );
    expect(refused).toEqual({ ok: false, reason: 'STORAGE_FAILED' });

    port.failUpsert = false;
    port.failRead = true;
    expect(await store.list(ORIGIN, TENANT)).toEqual([]);
    expect(await store.summary(ORIGIN, TENANT)).toEqual({ failed: 0, pending: 0 });
  });
});

describe('offline command flush policy', () => {
  it('replays queued commands with their stored keys and removes them on success', async () => {
    const port = new MemoryPort();
    const sent: string[] = [];
    const { bridge } = makeBridge(port, async (entry) => {
      sent.push(entry.idempotencyKey);
      expect(entry.idempotencyKey).toBe(`mobile-outbox-${entry.id}`);
      return { commandId: entry.id, status: 'PENDING' };
    });

    const first = await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });
    const second = await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'b', value: false });
    expect(first.ok && second.ok).toBe(true);

    const count = await bridge.flush(TENANT);

    expect(count).toBe(2);
    expect(sent).toHaveLength(2);
    expect(port.rows.size).toBe(0);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 0, pending: 0 });
  });

  it('stops a pass on a connectivity failure and keeps the rest queued', async () => {
    const port = new MemoryPort();
    const { bridge } = makeBridge(port, async () => {
      throw offlineError();
    });

    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });
    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'b', value: true });

    expect(await bridge.flush(TENANT)).toBe(0);

    const entries = await bridge.summary(TENANT);
    expect(entries).toEqual({ failed: 0, pending: 2 });
    const [first, second] = await createMobileOutboxStore(port).list(ORIGIN, TENANT);
    expect(first.attempts).toBe(1);
    expect(first.lastError).toBe('0:MOBILE_API_UNREACHABLE');
    expect(first.lastAttemptAt).not.toBeNull();
    expect(first.enqueuedAt).toBeTruthy();
    expect(second.attempts).toBe(0);
  });

  it('marks a business failure failed and keeps going', async () => {
    const port = new MemoryPort();
    const { bridge } = makeBridge(port, async (entry) => {
      if (entry.deviceId === 'bad') {
        throw new MobileApiError(400, 'COMMAND_INVALID', 'invalid', null);
      }
      return { commandId: entry.id, status: 'PENDING' };
    });

    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'bad', value: true });
    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'good', value: true });

    expect(await bridge.flush(TENANT)).toBe(1);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 1, pending: 0 });
  });

  it('stops automatic attempts at the bound and keeps the entry', async () => {
    const port = new MemoryPort();
    const { bridge } = makeBridge(port, async () => {
      throw offlineError();
    });
    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });

    for (let attempt = 0; attempt < MAX_OUTBOX_ATTEMPTS; attempt += 1) {
      await bridge.flush(TENANT);
    }

    expect(await bridge.summary(TENANT)).toEqual({ failed: 1, pending: 0 });
    const [entry] = await createMobileOutboxStore(port).list(ORIGIN, TENANT);
    expect(entry.attempts).toBe(MAX_OUTBOX_ATTEMPTS);
  });

  it('grants a manual retry a fresh attempt budget and discards only failed entries', async () => {
    const port = new MemoryPort();
    let mode: 'offline' | 'business' | 'ok' = 'offline';
    const { bridge } = makeBridge(port, async (entry) => {
      if (mode === 'offline') throw offlineError();
      if (mode === 'business') {
        throw new MobileApiError(400, 'COMMAND_INVALID', 'invalid', null);
      }
      return { commandId: entry.id, status: 'PENDING' };
    });

    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });
    for (let attempt = 0; attempt < MAX_OUTBOX_ATTEMPTS; attempt += 1) {
      await bridge.flush(TENANT);
    }
    expect(await bridge.summary(TENANT)).toEqual({ failed: 1, pending: 0 });

    mode = 'ok';
    expect(await bridge.retryFailed(TENANT)).toBe(1);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 0, pending: 0 });

    const stuck = await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'stuck', value: true });
    expect(stuck.ok).toBe(true);
    mode = 'business';
    await bridge.flush(TENANT);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 1, pending: 0 });
    await bridge.discardFailed(TENANT);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 0, pending: 0 });
  });

  it('shares one pass between concurrent flushes', async () => {
    const port = new MemoryPort();
    let sends = 0;
    let release: (() => void) | null = null;
    const { bridge } = makeBridge(port, async () => {
      sends += 1;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { commandId: 'c', status: 'PENDING' };
    });

    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });

    const first = bridge.flush(TENANT);
    const second = bridge.flush(TENANT);
    await new Promise((resolve) => setImmediate(resolve));
    expect(sends).toBe(1);
    release?.();
    expect(await first).toBe(1);
    expect(await second).toBe(1);
    expect(sends).toBe(1);
  });

  it('clears the whole queue on forget', async () => {
    const port = new MemoryPort();
    const { bridge } = makeBridge(port, async (entry) => ({ commandId: entry.id, status: 'PENDING' }));
    await bridge.enqueue(TENANT, { capabilityKey: 'power', deviceId: 'a', value: true });

    await bridge.forget();

    expect(port.rows.size).toBe(0);
    expect(await bridge.summary(TENANT)).toEqual({ failed: 0, pending: 0 });
  });
});

describe('offline classification', () => {
  it('treats only unreachable answers as offline', () => {
    expect(isMobileOfflineError(offlineError())).toBe(true);
    expect(isMobileOfflineError(new MobileApiError(503, 'SERVER_ERROR', 'x', null))).toBe(false);
    expect(isMobileOfflineError(new Error('socket'))).toBe(false);
  });

  it('classifies retryable answers as transient', () => {
    expect(isTransientOutboxFailure(offlineError())).toBe(true);
    expect(isTransientOutboxFailure(new MobileApiError(429, 'RATE_LIMITED', 'x', null))).toBe(true);
    expect(isTransientOutboxFailure(new MobileApiError(502, 'BAD_GATEWAY', 'x', null))).toBe(true);
    expect(isTransientOutboxFailure(new MobileApiError(400, 'COMMAND_INVALID', 'x', null))).toBe(false);
    expect(isTransientOutboxFailure(new Error('unknown'))).toBe(true);
  });
});
