/**
 * Offline snapshot cache — bounded, fail-closed storage for the last validated read payload.
 *
 * The store logic itself takes a port so it can be exercised in plain node, exactly like the
 * secure-session and settings stores: one module per folder is allowed to know which storage
 * implementation this build runs on.
 *
 * Fail-closed rules:
 *
 *  - only payloads that serialize under `MAX_CACHED_PAYLOAD_BYTES` are stored; oversize writes are
 *    skipped, never truncated;
 *  - reads parse defensively and return `null` for anything unreadable;
 *  - the index is pruned to `MAX_CACHED_ENTRIES`, oldest first, so a long-lived install cannot grow
 *    the cache without bound;
 *  - a storage failure never throws into the caller — the cache is best-effort by design, and a
 *    broken cache must not break the online path.
 */
export interface MobileCachedSnapshot {
  cachedAt: string;
  key: string;
  payload: string;
}

export interface MobileSnapshotCachePort {
  read(key: string): Promise<MobileCachedSnapshot | null>;
  readIndex(): Promise<Array<{ cachedAt: string; key: string }>>;
  remove(keys: string[]): Promise<void>;
  removeAll(): Promise<void>;
  upsert(snapshot: MobileCachedSnapshot): Promise<void>;
}

export const MAX_CACHED_ENTRIES = 24;
export const MAX_CACHED_PAYLOAD_BYTES = 262_144;

export interface MobileSnapshotCache {
  clear(): Promise<void>;
  read(key: string): Promise<{ cachedAt: string; payload: unknown } | null>;
  write(key: string, payload: unknown, cachedAt: string): Promise<boolean>;
}

/**
 * Cache keys are namespaced by server origin and tenant, so a build pointed at a second server (or
 * a second tenant on the same server) can never read another server's snapshot.
 */
export function dashboardSnapshotKey(
  apiOrigin: string,
  tenantId: string,
  dashboardId: string | null,
): string {
  return `dashboard|${apiOrigin}|${tenantId}|${dashboardId ?? 'default'}`;
}

/**
 * Read-surface snapshots (device directory, alerts) share the same cache and the same origin+tenant
 * namespacing as dashboards; the leading surface segment keeps the kinds from colliding.
 */
export function surfaceSnapshotKey(
  apiOrigin: string,
  tenantId: string,
  surface: string,
): string {
  return `surface|${apiOrigin}|${tenantId}|${surface}`;
}

export function createMobileSnapshotCache(
  port: MobileSnapshotCachePort,
): MobileSnapshotCache {
  async function write(
    key: string,
    payload: unknown,
    cachedAt: string,
  ): Promise<boolean> {
    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return false;
    }
    if (
      typeof serialized !== 'string' ||
      utf8ByteLength(serialized) > MAX_CACHED_PAYLOAD_BYTES
    ) {
      return false;
    }

    try {
      await port.upsert({ cachedAt, key, payload: serialized });
      await prune(port);
      return true;
    } catch {
      return false;
    }
  }

  async function read(
    key: string,
  ): Promise<{ cachedAt: string; payload: unknown } | null> {
    try {
      const snapshot = await port.read(key);
      if (!snapshot) return null;
      return {
        cachedAt: snapshot.cachedAt,
        payload: JSON.parse(snapshot.payload) as unknown,
      };
    } catch {
      return null;
    }
  }

  async function clear(): Promise<void> {
    try {
      await port.removeAll();
    } catch {
      // A cache that cannot be cleared is reported by its absence on the next read, never by
      // blocking a logout the operator asked for.
    }
  }

  return { clear, read, write };
}

async function prune(port: MobileSnapshotCachePort): Promise<void> {
  const index = await port.readIndex();
  if (index.length <= MAX_CACHED_ENTRIES) return;
  const stale = [...index]
    .sort((left, right) => left.cachedAt.localeCompare(right.cachedAt))
    .slice(0, index.length - MAX_CACHED_ENTRIES)
    .map((entry) => entry.key);
  if (stale.length > 0) await port.remove(stale);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
