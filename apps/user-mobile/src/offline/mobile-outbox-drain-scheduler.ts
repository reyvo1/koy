/**
 * The queue already drains on proven connectivity: every accepted command send and every
 * validated directory or alerts load triggers a flush pass. But an operator who queues commands
 * in a dead zone and then simply keeps the app open produces neither event, and their commands
 * sit until they touch something. This scheduler closes that gap with two triggers:
 *
 * - every app resume (background -> active), because that is the moment connectivity most often
 *   changed while the operator was away;
 * - a slow foreground interval that runs only while entries are actually waiting.
 *
 * It is deliberately dumb: no connectivity probing and no backoff bookkeeping. The flush itself
 * already stops on an unreachable server and keeps the queue, so a tick in a dead zone costs one
 * stopped pass and nothing else. Pending state is pushed in by the caller because the App owns
 * the summary; this module owns only the timer lifecycle.
 */
export const OUTBOX_DRAIN_INTERVAL_MS = 60_000;

export interface MobileOutboxDrainScheduler {
  dispose(): void;
  onAppActive(): void;
  setPending(pending: boolean): void;
}

export interface MobileOutboxDrainSchedulerOptions {
  flush: () => void;
  intervalMs?: number;
  setIntervalImpl?: (handler: () => void, ms: number) => unknown;
  clearIntervalImpl?: (handle: unknown) => void;
}

export function createMobileOutboxDrainScheduler(
  options: MobileOutboxDrainSchedulerOptions,
): MobileOutboxDrainScheduler {
  const intervalMs = options.intervalMs ?? OUTBOX_DRAIN_INTERVAL_MS;
  const setIntervalImpl =
    options.setIntervalImpl ??
    ((handler: () => void, ms: number) => setInterval(handler, ms));
  const clearIntervalImpl =
    options.clearIntervalImpl ??
    ((handle: unknown) =>
      clearInterval(handle as ReturnType<typeof setInterval>));

  let handle: unknown = null;
  let disposed = false;

  function stop(): void {
    if (handle !== null) {
      clearIntervalImpl(handle);
      handle = null;
    }
  }

  function start(): void {
    if (!disposed && handle === null) {
      handle = setIntervalImpl(() => options.flush(), intervalMs);
    }
  }

  return {
    dispose() {
      disposed = true;
      stop();
    },
    onAppActive() {
      if (!disposed) options.flush();
    },
    setPending(pending) {
      if (disposed) return;
      if (pending) start();
      else stop();
    },
  };
}
