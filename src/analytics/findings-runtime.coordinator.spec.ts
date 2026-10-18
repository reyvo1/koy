import { FindingsRuntimeCoordinator } from './findings-runtime.coordinator';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-07-20T12:00:00.000Z');

const detectResult = (
  created: Array<Record<string, unknown>> = [],
) => ({
  evaluated: 1,
  findings: created.length,
  createdFindings: created,
});

const criticalFinding = {
  id: 'finding-1',
  severity: 'CRITICAL',
  capabilityKey: 'temp',
  summary: 'temp read 100 against a baseline of 11',
};

const build = (options: { notificationRuntimeEnabled?: boolean } = {}) => {
  const detector = { detect: jest.fn().mockResolvedValue(detectResult()) };
  const membership = { findMany: jest.fn().mockResolvedValue([]) };
  const prisma = { membership };
  const notifications = {
    enqueue: jest.fn().mockResolvedValue({ created: true, notificationId: 'n1' }),
  };
  const config = {
    get: jest
      .fn()
      .mockImplementation((key: string, fallback: unknown) =>
        key === 'NOTIFICATION_RUNTIME_ENABLED'
          ? (options.notificationRuntimeEnabled ?? false)
          : fallback,
      ),
  };

  return {
    coordinator: new FindingsRuntimeCoordinator(
      detector as never,
      prisma as never,
      notifications as never,
      config as never,
    ),
    detector,
    membership,
    notifications,
  };
};

const coordinate = (
  coordinator: FindingsRuntimeCoordinator,
  payload: Record<string, unknown>,
  now: Date = NOW,
) => coordinator.coordinate({ tenantId: TENANT_ID, deviceId: DEVICE_ID, payload, now });

describe('FindingsRuntimeCoordinator', () => {
  describe('capability selection', () => {
    it('evaluates every finite numeric reading, sorted deterministically', async () => {
      const { coordinator, detector } = build();

      const result = await coordinate(coordinator, { temp: 21, humidity: 40 });

      expect(detector.detect.mock.calls.map((call) => call[0].capabilityKey)).toEqual([
        'humidity',
        'temp',
      ]);
      expect(result.evaluatedCapabilities).toBe(2);
      expect(detector.detect).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, deviceId: DEVICE_ID, now: NOW }),
      );
    });

    it('skips non-numeric values and keys that are not a safe capability shape', async () => {
      const { coordinator, detector } = build();
      const payload = JSON.parse(
        '{"temp":21,"label":"warm","__proto__":9,"constructor":5,"1bad":3,"ok_key":4}',
      );

      await coordinate(coordinator, payload);

      expect(detector.detect.mock.calls.map((call) => call[0].capabilityKey)).toEqual([
        'ok_key',
        'temp',
      ]);
    });

    it('caps the number of evaluated capabilities per event', async () => {
      const { coordinator, detector } = build();
      const payload = Object.fromEntries(
        [...Array(30)].map((_, index) => [`k${String(index).padStart(2, '0')}`, index]),
      );

      const result = await coordinate(coordinator, payload);

      expect(detector.detect).toHaveBeenCalledTimes(16);
      expect(result.evaluatedCapabilities).toBe(16);
    });

    it('does nothing for a payload without a single numeric reading', async () => {
      const { coordinator, detector } = build();

      const result = await coordinate(coordinator, { label: 'warm', on: true });

      expect(detector.detect).not.toHaveBeenCalled();
      expect(result).toEqual({
        evaluatedCapabilities: 0,
        findings: 0,
        notificationsEnqueued: 0,
        skippedByCooldown: 0,
        failures: 0,
      });
    });

    it('refuses an event whose identity is not a UUID instead of querying with it', async () => {
      const { coordinator, detector } = build();

      const result = await coordinator.coordinate({
        tenantId: 'not-a-uuid',
        deviceId: DEVICE_ID,
        payload: { temp: 21 },
        now: NOW,
      });

      expect(detector.detect).not.toHaveBeenCalled();
      expect(result.evaluatedCapabilities).toBe(0);
    });
  });

  describe('throttle', () => {
    it('skips a device+capability that was evaluated inside the cooldown', async () => {
      const { coordinator, detector } = build();

      await coordinate(coordinator, { temp: 21 });
      const second = await coordinate(
        coordinator,
        { temp: 22 },
        new Date(NOW.getTime() + 1000),
      );

      expect(detector.detect).toHaveBeenCalledTimes(1);
      expect(second.skippedByCooldown).toBe(1);
    });

    it('re-evaluates once the configured cooldown has elapsed', async () => {
      const previous = process.env.FINDINGS_RUNTIME_COOLDOWN_SECONDS;
      process.env.FINDINGS_RUNTIME_COOLDOWN_SECONDS = '30';
      try {
        const { coordinator, detector } = build();

        await coordinate(coordinator, { temp: 21 });
        await coordinate(coordinator, { temp: 22 }, new Date(NOW.getTime() + 31_000));

        expect(detector.detect).toHaveBeenCalledTimes(2);
      } finally {
        if (previous === undefined) {
          delete process.env.FINDINGS_RUNTIME_COOLDOWN_SECONDS;
        } else {
          process.env.FINDINGS_RUNTIME_COOLDOWN_SECONDS = previous;
        }
      }
    });

    it('throttles each capability independently', async () => {
      const { coordinator, detector } = build();

      await coordinate(coordinator, { temp: 21 });
      await coordinate(coordinator, { temp: 21, humidity: 50 }, new Date(NOW.getTime() + 1000));

      expect(detector.detect.mock.calls.map((call) => call[0].capabilityKey)).toEqual([
        'temp',
        'humidity',
      ]);
    });
  });

  describe('failure isolation', () => {
    it('keeps evaluating the remaining capabilities when one evaluation throws', async () => {
      const { coordinator, detector } = build();
      detector.detect.mockImplementation(async (options: { capabilityKey: string }) => {
        if (options.capabilityKey === 'humidity') {
          throw Object.assign(new Error('boom'), { code: 'DETECTOR_FAILED' });
        }
        return detectResult();
      });

      const result = await coordinate(coordinator, { temp: 21, humidity: 50 });

      expect(result.failures).toBe(1);
      expect(result.evaluatedCapabilities).toBe(1);
    });
  });

  describe('CRITICAL fan-out', () => {
    it('does not query recipients at all when the notification runtime is off', async () => {
      const { coordinator, detector, membership, notifications } = build();
      detector.detect.mockResolvedValue(detectResult([criticalFinding]));

      const result = await coordinate(coordinator, { temp: 21 });

      expect(membership.findMany).not.toHaveBeenCalled();
      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(result.notificationsEnqueued).toBe(0);
    });

    it('enqueues one idempotent email per recipient with an enabled EMAIL preference', async () => {
      const { coordinator, detector, membership, notifications } = build({
        notificationRuntimeEnabled: true,
      });
      detector.detect.mockResolvedValue(detectResult([criticalFinding]));
      membership.findMany.mockResolvedValue([
        { user: { email: 'ops@example.com' } },
        { user: { email: 'noc@example.com' } },
      ]);

      const result = await coordinate(coordinator, { temp: 21 });

      expect(membership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: 'ACTIVE',
            notificationPreferences: { some: { channel: 'EMAIL', enabled: true } },
          }),
          take: 50,
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalledTimes(2);
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          channel: 'EMAIL',
          destination: 'ops@example.com',
          templateKey: 'analytics.finding.critical',
          idempotencyKey: 'analytics-finding:finding-1:ops@example.com',
        }),
      );
      expect(result.notificationsEnqueued).toBe(2);
    });

    it('notifies only CRITICAL findings', async () => {
      const { coordinator, detector, notifications } = build({
        notificationRuntimeEnabled: true,
      });
      detector.detect.mockResolvedValue(
        detectResult([
          { ...criticalFinding, id: 'warning-1', severity: 'WARNING' },
        ]),
      );

      const result = await coordinate(coordinator, { temp: 21 });

      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(result.notificationsEnqueued).toBe(0);
    });

    it('falls back to the ACTIVE tenant admins when no preference exists, deduplicated', async () => {
      const { coordinator, detector, membership, notifications } = build({
        notificationRuntimeEnabled: true,
      });
      detector.detect.mockResolvedValue(detectResult([criticalFinding]));
      membership.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { user: { email: 'Admin@Example.com' } },
          { user: { email: 'admin@example.com' } },
        ]);

      const result = await coordinate(coordinator, { temp: 21 });

      expect(membership.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            role: { in: ['ADMIN', 'PLATFORM_ADMIN'] },
          }),
        }),
      );
      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      expect(result.notificationsEnqueued).toBe(1);
    });

    it('keeps delivering to the other recipients when one enqueue fails', async () => {
      const { coordinator, detector, membership, notifications } = build({
        notificationRuntimeEnabled: true,
      });
      detector.detect.mockResolvedValue(detectResult([criticalFinding]));
      membership.findMany.mockResolvedValue([
        { user: { email: 'ops@example.com' } },
        { user: { email: 'noc@example.com' } },
      ]);
      notifications.enqueue
        .mockRejectedValueOnce(new Error('queue down'))
        .mockResolvedValueOnce({ created: true, notificationId: 'n2' });

      const result = await coordinate(coordinator, { temp: 21 });

      expect(notifications.enqueue).toHaveBeenCalledTimes(2);
      expect(result.notificationsEnqueued).toBe(1);
    });

    it('reports a replayed enqueue as not newly enqueued', async () => {
      const { coordinator, detector, membership, notifications } = build({
        notificationRuntimeEnabled: true,
      });
      detector.detect.mockResolvedValue(detectResult([criticalFinding]));
      membership.findMany.mockResolvedValue([{ user: { email: 'ops@example.com' } }]);
      notifications.enqueue.mockResolvedValue({ created: false, notificationId: 'n1' });

      const result = await coordinate(coordinator, { temp: 21 });

      expect(result.notificationsEnqueued).toBe(0);
    });
  });
});
