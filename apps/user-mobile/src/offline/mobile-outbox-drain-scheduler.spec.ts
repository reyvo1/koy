import {
  createMobileOutboxDrainScheduler,
  OUTBOX_DRAIN_INTERVAL_MS,
} from './mobile-outbox-drain-scheduler';

describe('mobile outbox drain scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts one interval while entries are pending and flushes on every tick', () => {
    let flushes = 0;
    const scheduler = createMobileOutboxDrainScheduler({
      flush: () => {
        flushes += 1;
      },
    });

    scheduler.setPending(true);
    expect(flushes).toBe(0);

    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS);
    expect(flushes).toBe(1);
    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS * 2);
    expect(flushes).toBe(3);

    scheduler.dispose();
  });

  it('stops while the queue is empty and does not stack intervals on repeats', () => {
    let flushes = 0;
    const scheduler = createMobileOutboxDrainScheduler({
      flush: () => {
        flushes += 1;
      },
    });

    scheduler.setPending(true);
    scheduler.setPending(true);
    scheduler.setPending(true);

    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS);
    expect(flushes).toBe(1);

    scheduler.setPending(false);
    scheduler.setPending(false);
    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS * 5);
    expect(flushes).toBe(1);

    scheduler.dispose();
  });

  it('flushes once per app resume, even when nothing is pending', () => {
    let flushes = 0;
    const scheduler = createMobileOutboxDrainScheduler({
      flush: () => {
        flushes += 1;
      },
    });

    scheduler.onAppActive();
    scheduler.onAppActive();
    expect(flushes).toBe(2);

    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS);
    expect(flushes).toBe(2);

    scheduler.dispose();
  });

  it('honours a custom interval', () => {
    let flushes = 0;
    const scheduler = createMobileOutboxDrainScheduler({
      flush: () => {
        flushes += 1;
      },
      intervalMs: 1_000,
    });

    scheduler.setPending(true);
    jest.advanceTimersByTime(999);
    expect(flushes).toBe(0);
    jest.advanceTimersByTime(1);
    expect(flushes).toBe(1);

    scheduler.dispose();
  });

  it('ignores everything after dispose', () => {
    let flushes = 0;
    const scheduler = createMobileOutboxDrainScheduler({
      flush: () => {
        flushes += 1;
      },
    });

    scheduler.setPending(true);
    scheduler.dispose();
    scheduler.onAppActive();
    scheduler.setPending(true);

    jest.advanceTimersByTime(OUTBOX_DRAIN_INTERVAL_MS * 5);
    expect(flushes).toBe(0);
  });

  it('clears the running interval exactly once on dispose', () => {
    const cleared: unknown[] = [];
    const scheduler = createMobileOutboxDrainScheduler({
      clearIntervalImpl: (handle) => {
        cleared.push(handle);
      },
      flush: () => undefined,
      setIntervalImpl: () => 'tick-handle',
    });

    scheduler.setPending(true);
    scheduler.dispose();
    scheduler.dispose();
    expect(cleared).toEqual(['tick-handle']);
  });
});
