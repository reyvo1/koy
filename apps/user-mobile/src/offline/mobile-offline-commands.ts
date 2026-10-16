/**
 * Offline command flush policy.
 *
 * The store owns what is queued; this bridge owns when queued commands are replayed and how a
 * failed replay is classified. The rules are deliberate:
 *
 *  - a connectivity or server-side failure (unreachable, 429, 5xx) stops the whole pass and keeps
 *    the remaining commands queued — the network is the problem, not the commands;
 *  - a business failure (4xx) marks that one command failed and the pass continues, because the
 *    next command may be perfectly valid;
 *  - `MAX_OUTBOX_ATTEMPTS` bounds automatic attempts; after that a command needs an explicit human
 *    retry, and a manual retry grants a fresh attempt budget rather than inheriting a dead one;
 *  - the stored idempotency key is replayed unchanged, so a response lost in flight cannot produce
 *    a second physical command when the queue resends it.
 */
import { MobileApiError } from '../session/mobile-session-client';
import {
  MAX_OUTBOX_ATTEMPTS,
  boundedOutboxError,
  type MobileOutboxCommandInput,
  type MobileOutboxEnqueueResult,
  type MobileOutboxEntry,
  type MobileOutboxStore,
  type MobileOutboxSummary,
} from './mobile-command-outbox';

export interface MobileOutboxSender {
  (entry: MobileOutboxEntry): Promise<{ commandId: string; status: string }>;
}

export interface MobileCommandOutbox {
  discard(tenantId: string, entryIds: string[]): Promise<void>;
  discardFailed(tenantId: string): Promise<void>;
  enqueue(
    tenantId: string,
    input: MobileOutboxCommandInput,
  ): Promise<MobileOutboxEnqueueResult>;
  flush(tenantId: string): Promise<number>;
  forget(): Promise<void>;
  list(tenantId: string): Promise<MobileOutboxEntry[]>;
  retry(tenantId: string, entryId: string): Promise<number>;
  retryFailed(tenantId: string): Promise<number>;
  summary(tenantId: string): Promise<MobileOutboxSummary>;
}

export function connectMobileCommandOutbox({
  apiOrigin,
  send,
  store,
}: {
  apiOrigin: string;
  send: MobileOutboxSender;
  store: MobileOutboxStore;
}): MobileCommandOutbox {
  let activeFlush: { promise: Promise<number>; tenantId: string } | null = null;

  async function flush(tenantId: string): Promise<number> {
    if (activeFlush && activeFlush.tenantId === tenantId) return activeFlush.promise;
    const promise = runFlush(tenantId).finally(() => {
      if (activeFlush?.promise === promise) activeFlush = null;
    });
    activeFlush = { promise, tenantId };
    return promise;
  }

  async function runFlush(tenantId: string): Promise<number> {
    const entries = (await store.list(apiOrigin, tenantId)).filter(
      (entry) => entry.status === 'queued',
    );
    let sent = 0;

    for (const entry of entries) {
      try {
        await send(entry);
        await store.remove(apiOrigin, tenantId, [entry.id]);
        sent += 1;
      } catch (cause) {
        const attempts = entry.attempts + 1;
        const transient = isTransientOutboxFailure(cause);
        const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS;
        await store.update({
          ...entry,
          attempts,
          lastAttemptAt: new Date().toISOString(),
          lastError: boundedOutboxError(cause),
          status: transient && !exhausted ? 'queued' : 'failed',
        });
        if (transient) break;
      }
    }

    return sent;
  }

  /**
   * A single-entry retry, mirroring the bulk one: the entry gets a fresh attempt budget and one
   * flush pass runs immediately, so the operator sees whether it went through.
   */
  async function retry(tenantId: string, entryId: string): Promise<number> {
    const entry = (await store.list(apiOrigin, tenantId)).find(
      (candidate) => candidate.id === entryId,
    );
    if (!entry) return 0;
    await store.update({
      ...entry,
      attempts: 0,
      lastError: null,
      status: 'queued',
    });
    return flush(tenantId);
  }

  async function discard(tenantId: string, entryIds: string[]): Promise<void> {
    await store.remove(apiOrigin, tenantId, entryIds);
  }

  async function list(tenantId: string): Promise<MobileOutboxEntry[]> {
    return store.list(apiOrigin, tenantId);
  }

  async function retryFailed(tenantId: string): Promise<number> {
    const failed = (await store.list(apiOrigin, tenantId)).filter(
      (entry) => entry.status === 'failed',
    );
    for (const entry of failed) {
      await store.update({
        ...entry,
        attempts: 0,
        lastError: null,
        status: 'queued',
      });
    }
    return flush(tenantId);
  }

  async function discardFailed(tenantId: string): Promise<void> {
    const failed = (await store.list(apiOrigin, tenantId)).filter(
      (entry) => entry.status === 'failed',
    );
    await store.remove(
      apiOrigin,
      tenantId,
      failed.map((entry) => entry.id),
    );
  }

  async function summary(tenantId: string): Promise<MobileOutboxSummary> {
    return store.summary(apiOrigin, tenantId);
  }

  async function forget(): Promise<void> {
    await store.clear();
  }

  async function enqueue(
    tenantId: string,
    input: MobileOutboxCommandInput,
  ): Promise<MobileOutboxEnqueueResult> {
    return store.enqueue(apiOrigin, tenantId, input, new Date());
  }

  return {
    discard,
    discardFailed,
    enqueue,
    flush,
    forget,
    list,
    retry,
    retryFailed,
    summary,
  };
}

/**
 * Only a connectivity outage justifies queueing instead of failing: the session client reports an
 * unreachable API as status 0, and any other answer is a real server verdict that must surface.
 */
export function isMobileOfflineError(cause: unknown): boolean {
  return (
    cause instanceof MobileApiError &&
    (cause.status === 0 || cause.code === 'MOBILE_API_UNREACHABLE')
  );
}

export function isTransientOutboxFailure(cause: unknown): boolean {
  if (cause instanceof MobileApiError) {
    return cause.status === 0 || cause.status === 429 || cause.status >= 500;
  }
  return true;
}
