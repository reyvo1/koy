/**
 * Offline command outbox — bounded, fail-closed storage for commands issued without connectivity.
 *
 * The store takes a port so it can be exercised in plain node, exactly like the snapshot cache:
 * the shared expo-sqlite database module is the only file allowed to know the native database.
 *
 * Fail-closed rules:
 *
 *  - only primitive capability values that serialize under `MAX_OUTBOX_VALUE_BYTES` are queued;
 *  - the queue is capped at `MAX_OUTBOX_ENTRIES` per origin and tenant — a full queue refuses the
 *    command instead of silently dropping an older one, because a dropped command is a physical
 *    action the operator believes was requested;
 *  - reads parse defensively and drop anything unreadable;
 *  - a storage failure never throws into the caller — the caller keeps the original send error.
 */
export const MAX_OUTBOX_ENTRIES = 16;
export const MAX_OUTBOX_ATTEMPTS = 5;
export const MAX_OUTBOX_VALUE_BYTES = 4096;

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_ERROR_LENGTH = 128;

export type MobileOutboxStatus = 'failed' | 'queued';
export type MobileOutboxValue = boolean | number | string;

export interface MobileOutboxEntry {
  apiOrigin: string;
  attempts: number;
  capabilityKey: string;
  deviceId: string;
  enqueuedAt: string;
  id: string;
  idempotencyKey: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  status: MobileOutboxStatus;
  tenantId: string;
  value: MobileOutboxValue;
}

export interface MobileOutboxRow {
  enqueuedAt: string;
  key: string;
  payload: string;
}

export interface MobileOutboxStorePort {
  readAll(): Promise<MobileOutboxRow[]>;
  remove(keys: string[]): Promise<void>;
  removeAll(): Promise<void>;
  upsert(row: MobileOutboxRow): Promise<void>;
}

export interface MobileOutboxCommandInput {
  capabilityKey: string;
  deviceId: string;
  value: unknown;
}

export interface MobileOutboxSummary {
  failed: number;
  pending: number;
}

export type MobileOutboxEnqueueResult =
  | { entry: MobileOutboxEntry; ok: true }
  | { ok: false; reason: 'OUTBOX_FULL' | 'STORAGE_FAILED' | 'VALUE_UNSUPPORTED' };

export interface MobileOutboxStore {
  clear(): Promise<void>;
  enqueue(
    apiOrigin: string,
    tenantId: string,
    input: MobileOutboxCommandInput,
    now: Date,
  ): Promise<MobileOutboxEnqueueResult>;
  list(apiOrigin: string, tenantId: string): Promise<MobileOutboxEntry[]>;
  remove(apiOrigin: string, tenantId: string, entryIds: string[]): Promise<void>;
  summary(apiOrigin: string, tenantId: string): Promise<MobileOutboxSummary>;
  update(entry: MobileOutboxEntry): Promise<boolean>;
}

/**
 * Outbox keys are namespaced by server origin and tenant for the same reason snapshots are: a build
 * pointed at a second server must never replay the first server's commands.
 */
export function outboxEntryKey(
  apiOrigin: string,
  tenantId: string,
  id: string,
): string {
  return `${apiOrigin}|${tenantId}|${id}`;
}

export function createMobileOutboxStore(
  port: MobileOutboxStorePort,
): MobileOutboxStore {
  async function list(
    apiOrigin: string,
    tenantId: string,
  ): Promise<MobileOutboxEntry[]> {
    let rows: MobileOutboxRow[];
    try {
      rows = await port.readAll();
    } catch {
      return [];
    }

    return rows
      .map(parseOutboxRow)
      .filter(
        (entry): entry is MobileOutboxEntry =>
          entry !== null &&
          entry.apiOrigin === apiOrigin &&
          entry.tenantId === tenantId,
      )
      .sort(
        (left, right) =>
          left.enqueuedAt.localeCompare(right.enqueuedAt) ||
          left.id.localeCompare(right.id),
      );
  }

  async function enqueue(
    apiOrigin: string,
    tenantId: string,
    input: MobileOutboxCommandInput,
    now: Date,
  ): Promise<MobileOutboxEnqueueResult> {
    if (
      !isMobileOutboxValue(input.value) ||
      !isBoundedIdentifier(input.deviceId) ||
      !isBoundedIdentifier(input.capabilityKey) ||
      !serializesWithin(input.value, MAX_OUTBOX_VALUE_BYTES)
    ) {
      return { ok: false, reason: 'VALUE_UNSUPPORTED' };
    }

    const existing = await list(apiOrigin, tenantId);
    if (existing.length >= MAX_OUTBOX_ENTRIES) {
      return { ok: false, reason: 'OUTBOX_FULL' };
    }

    const id = `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const entry: MobileOutboxEntry = {
      apiOrigin,
      attempts: 0,
      capabilityKey: input.capabilityKey,
      deviceId: input.deviceId,
      enqueuedAt: now.toISOString(),
      id,
      idempotencyKey: `mobile-outbox-${id}`,
      lastAttemptAt: null,
      lastError: null,
      status: 'queued',
      tenantId,
      value: input.value,
    };

    if (!(await upsert(entry))) {
      return { ok: false, reason: 'STORAGE_FAILED' };
    }
    return { entry, ok: true };
  }

  async function update(entry: MobileOutboxEntry): Promise<boolean> {
    return upsert(entry);
  }

  async function upsert(entry: MobileOutboxEntry): Promise<boolean> {
    try {
      await port.upsert({
        enqueuedAt: entry.enqueuedAt,
        key: outboxEntryKey(entry.apiOrigin, entry.tenantId, entry.id),
        payload: JSON.stringify(entry),
      });
      return true;
    } catch {
      return false;
    }
  }

  async function remove(
    apiOrigin: string,
    tenantId: string,
    entryIds: string[],
  ): Promise<void> {
    try {
      await port.remove(
        entryIds.map((id) => outboxEntryKey(apiOrigin, tenantId, id)),
      );
    } catch {
      // Best effort: a queued command the queue cannot drop is retried, never lost silently.
    }
  }

  async function clear(): Promise<void> {
    try {
      await port.removeAll();
    } catch {
      // A queue that cannot be cleared is reported by its absence on the next read; logout must
      // never be blocked by local storage.
    }
  }

  async function summary(
    apiOrigin: string,
    tenantId: string,
  ): Promise<MobileOutboxSummary> {
    const entries = await list(apiOrigin, tenantId);
    return {
      failed: entries.filter((entry) => entry.status === 'failed').length,
      pending: entries.filter((entry) => entry.status === 'queued').length,
    };
  }

  return { clear, enqueue, list, remove, summary, update };
}

export function isMobileOutboxValue(value: unknown): value is MobileOutboxValue {
  return (
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    // JSON cannot carry NaN or the infinities, so they are not queued values: silently storing
    // `null` in their place would replay a different command than the operator sent.
    (typeof value === 'number' && Number.isFinite(value))
  );
}

export function boundedOutboxError(cause: unknown): string {
  const raw =
    cause && typeof cause === 'object' && 'code' in cause
      ? `${String((cause as { status?: unknown }).status ?? '')}:${String((cause as { code: unknown }).code)}`
      : 'UNKNOWN';
  return raw.slice(0, MAX_ERROR_LENGTH);
}

function parseOutboxRow(row: MobileOutboxRow): MobileOutboxEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payload) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const entry = parsed as Record<string, unknown>;
  if (
    typeof entry.apiOrigin !== 'string' ||
    typeof entry.tenantId !== 'string' ||
    typeof entry.id !== 'string' ||
    typeof entry.deviceId !== 'string' ||
    typeof entry.capabilityKey !== 'string' ||
    typeof entry.idempotencyKey !== 'string' ||
    typeof entry.enqueuedAt !== 'string' ||
    !Number.isInteger(entry.attempts) ||
    (entry.attempts as number) < 0 ||
    (entry.status !== 'queued' && entry.status !== 'failed') ||
    !isMobileOutboxValue(entry.value) ||
    (entry.lastAttemptAt !== null && typeof entry.lastAttemptAt !== 'string') ||
    (entry.lastError !== null && typeof entry.lastError !== 'string') ||
    !serializesWithin(entry.value, MAX_OUTBOX_VALUE_BYTES)
  ) {
    return null;
  }

  return entry as unknown as MobileOutboxEntry;
}

function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_IDENTIFIER_LENGTH
  );
}

function serializesWithin(value: unknown, maximumBytes: number): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? '';
  } catch {
    return false;
  }
  return new TextEncoder().encode(serialized).length <= maximumBytes;
}
