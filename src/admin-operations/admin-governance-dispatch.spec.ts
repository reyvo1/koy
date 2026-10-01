import { AdminGovernanceService } from './admin-governance.service';

/**
 * Platform dispatch is the one path in the platform that deliberately crosses tenant
 * isolation: a super admin names a tenant explicitly and actuates a device inside it. It is
 * the endpoint most worth pinning, and it shipped with no spec at all — the class had five
 * sibling specs and none for this.
 *
 * Three properties are asserted here.
 *
 * 1. It never guesses. A missing tenant or device is refused rather than defaulted, because a
 *    default here would be a super admin silently reaching into whichever tenant sorted
 *    first.
 * 2. A refusal is still a record. The attempts that never reach a device are the interesting
 *    ones — a super admin probing tenant boundaries looks exactly like a series of successful
 *    dispatches if only successes are audited, which is the reading that makes the log
 *    useless during an incident.
 * 3. Auditing a rejection cannot rescue the request. If the audit write fails, the dispatch is
 *    still refused, because converting a refused cross-tenant actuation into a retryable 500
 *    is strictly worse than losing a log line.
 */

const TENANT = '22222222-2222-4222-8222-222222222222';
const OTHER_TENANT = '99999999-9999-4999-8999-999999999999';
const DEVICE = '33333333-3333-4333-8333-333333333334';
const ACTOR = '55555555-5555-4555-8555-555555555555';

const validInput = (overrides: Record<string, unknown> = {}) => ({
  tenantId: TENANT,
  deviceId: DEVICE,
  payload: { lightPower: true },
  reason: 'incident bridge',
  actorMembershipId: ACTOR,
  ...overrides,
});

describe('AdminGovernanceService.dispatchPlatformCommand', () => {
  let service: AdminGovernanceService;
  let prisma: {
    device: { findFirst: jest.Mock };
    rbacAuditLog: { create: jest.Mock };
  };
  let commands: { publish: jest.Mock };

  beforeEach(() => {
    prisma = {
      device: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: DEVICE, tenantId: TENANT, name: 'Lobby Light Panel' }),
      },
      rbacAuditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    commands = {
      publish: jest.fn().mockResolvedValue({ id: 'command-1', status: 'SENT' }),
    };

    service = new AdminGovernanceService(
      prisma as never,
      { recordCommandLifecycle: jest.fn() } as never,
      commands as never,
    );
  });

  describe('it never guesses a tenant', () => {
    it('refuses a dispatch with no tenantId', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ tenantId: undefined }) as never),
      ).rejects.toThrow(/never guesses a tenant/);

      expect(commands.publish).not.toHaveBeenCalled();
    });

    it('refuses a dispatch with no deviceId', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ deviceId: undefined }) as never),
      ).rejects.toThrow(/never guesses a tenant/);

      expect(commands.publish).not.toHaveBeenCalled();
    });

    it('does not fall back to any tenant when the field is blank', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ tenantId: '   ' }) as never),
      ).rejects.toThrow();

      expect(prisma.device.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('it requires an attributable reason', () => {
    it('refuses a dispatch with no reason', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ reason: '  ' }) as never),
      ).rejects.toThrow(/reason is required/);

      expect(commands.publish).not.toHaveBeenCalled();
    });
  });

  describe('it refuses a device outside the named tenant', () => {
    it('rejects rather than actuating', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.dispatchPlatformCommand(validInput() as never),
      ).rejects.toThrow(/does not belong to the named tenant/);

      expect(commands.publish).not.toHaveBeenCalled();
    });

    it('looks the device up by BOTH id and tenant, not id alone', async () => {
      await service.dispatchPlatformCommand(validInput() as never);

      expect(prisma.device.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: DEVICE, tenantId: TENANT }),
        }),
      );
    });
  });

  describe('a refusal leaves an audit record', () => {
    const denied = () =>
      prisma.rbacAuditLog.create.mock.calls
        .map(([arg]) => arg)
        .filter((data) => data?.data?.allowed === false)
        .map((data) => data.data);

    it('records a missing tenant as denied', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ tenantId: undefined }) as never),
      ).rejects.toThrow();

      const rows = denied();
      expect(rows).toHaveLength(1);
      expect(rows[0].detail).toMatch(/platform_dispatch_rejected/);
      expect(rows[0].actorMembershipId).toBe(ACTOR);
    });

    it('records a missing reason as denied', async () => {
      await expect(
        service.dispatchPlatformCommand(validInput({ reason: '' }) as never),
      ).rejects.toThrow();

      expect(denied()).toHaveLength(1);
    });

    it('records a cross-tenant device probe as denied', async () => {
      prisma.device.findFirst.mockResolvedValue(null);

      await expect(
        service.dispatchPlatformCommand(
          validInput({ tenantId: OTHER_TENANT, deviceId: DEVICE }) as never,
        ),
      ).rejects.toThrow();

      const rows = denied();
      expect(rows).toHaveLength(1);
      expect(rows[0].detail).toMatch(/does not belong/);
    });

    it('attributes the record to the session actor, never to a body field', async () => {
      await expect(
        service.dispatchPlatformCommand(
          validInput({ tenantId: undefined, actorMembershipId: 'forged' }) as never,
        ),
      ).rejects.toThrow();

      // The forged value IS the actor here because it is the only one supplied — what matters
      // is that the audit row records the membership the service was given, with no
      // independent "who did this" field that a caller could set differently.
      expect(denied()[0].actorMembershipId).toBe('forged');
      expect(denied()[0].resourceId).toBe(DEVICE);
    });
  });

  describe('auditing a rejection never rescues the request', () => {
    it('still refuses when the audit write itself fails', async () => {
      prisma.rbacAuditLog.create.mockRejectedValue(new Error('audit store down'));

      await expect(
        service.dispatchPlatformCommand(validInput({ tenantId: undefined }) as never),
      ).rejects.toThrow(/never guesses a tenant/);

      expect(commands.publish).not.toHaveBeenCalled();
    });

    it('still refuses a cross-tenant probe when the audit write fails', async () => {
      prisma.device.findFirst.mockResolvedValue(null);
      prisma.rbacAuditLog.create.mockRejectedValue(new Error('audit store down'));

      await expect(
        service.dispatchPlatformCommand(validInput() as never),
      ).rejects.toThrow(/does not belong to the named tenant/);
    });
  });

  describe('a valid dispatch still behaves as documented', () => {
    it('publishes and audits as allowed', async () => {
      const result = await service.dispatchPlatformCommand(validInput() as never);

      expect(commands.publish).toHaveBeenCalledWith(
        TENANT,
        DEVICE,
        { lightPower: true },
        undefined,
      );
      expect(result).toMatchObject({ dispatched: true, deviceId: DEVICE, tenantId: TENANT });

      const allowed = prisma.rbacAuditLog.create.mock.calls
        .map(([arg]) => arg.data)
        .filter((data) => data.allowed === true);
      expect(allowed).toHaveLength(1);
    });

    it('audits the failure when publishing throws', async () => {
      commands.publish.mockRejectedValue(new Error('broker refused'));

      await expect(service.dispatchPlatformCommand(validInput() as never)).rejects.toThrow();

      const denied = prisma.rbacAuditLog.create.mock.calls
        .map(([arg]) => arg.data)
        .filter((data) => data.allowed === false);
      expect(denied).toHaveLength(1);
      expect(denied[0].detail).toMatch(/platform_dispatch_failed/);
    });
  });
});
