import { DeviceShareController } from './device-share.controller';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * The Module 18 controller is only worth having if the refusals keep their meaning.
 *
 * DeviceShareService signals every refusal by throwing a plain Error carrying a `code`.
 * `GlobalExceptionFilter` maps only HttpException, so without translation those refusals
 * reach the client as 500 INTERNAL_ERROR. These tests pin the translation, because a
 * client mistake reported as a server fault is worse than an error: it sends operators
 * hunting a fault that does not exist.
 */
const REQ = {
  user: {
    tenantContext: {
      tenantId: '11111111-1111-4111-8111-111111111111',
      membershipId: '22222222-2222-4222-8222-222222222222',
    },
  },
};

const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_ID = '44444444-4444-4444-8444-444444444444';

function controllerWith(service: Partial<Record<string, jest.Mock>>) {
  return new DeviceShareController(service as any);
}

describe('DeviceShareController', () => {
  it('returns the created grant id on success', async () => {
    const createGrant = jest.fn().mockResolvedValue({ id: 'grant-1' });
    const controller = controllerWith({ createGrant });

    const result = await controller.create(REQ, DEVICE_ID, {
      grantedToMembershipId: MEMBERSHIP_ID,
      permission: 'CONTROL',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(result).toEqual({ id: 'grant-1' });
    expect(createGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE_ID,
        grantedToMembershipId: MEMBERSHIP_ID,
        createdByMembershipId: REQ.user.tenantContext.membershipId,
        permission: 'CONTROL',
      }),
    );
  });

  it.each([
    ['SHARE_DEVICE_NOT_FOUND', 404],
    ['SHARE_SELF_GRANT_INVALID', 400],
    ['SHARE_EXPIRY_INVALID', 400],
    ['SHARE_IDENTITY_INVALID', 400],
    ['SHARE_ACTIVE_LIMIT_EXCEEDED', 409],
    ['SHARE_GRANT_NOT_ACTIVE', 409],
  ])('maps %s to HTTP %i instead of 500', async (code, status) => {
    const createGrant = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('service refusal'), { code }));
    const controller = controllerWith({ createGrant });

    await expect(
      controller.create(REQ, DEVICE_ID, {
        grantedToMembershipId: MEMBERSHIP_ID,
        permission: 'VIEW',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toMatchObject({ status, response: { code } });
  });

  it('does not disguise an unrelated error as a share refusal', async () => {
    const boom = new Error('prisma exploded');
    const controller = controllerWith({ createGrant: jest.fn().mockRejectedValue(boom) });

    await expect(
      controller.create(REQ, DEVICE_ID, {
        grantedToMembershipId: MEMBERSHIP_ID,
        permission: 'VIEW',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toBe(boom);
  });

  it('refuses to act without a membership in the tenant context', async () => {
    const createGrant = jest.fn();
    const controller = controllerWith({ createGrant });

    await expect(
      controller.create(
        { user: { tenantContext: { tenantId: REQ.user.tenantContext.tenantId } } },
        DEVICE_ID,
        {
          grantedToMembershipId: MEMBERSHIP_ID,
          permission: 'VIEW',
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(createGrant).not.toHaveBeenCalled();
  });

  it('scopes the read surface to the tenant in context', async () => {
    const listGrants = jest.fn().mockResolvedValue([]);
    const controller = controllerWith({ listGrants });

    await controller.list(REQ, DEVICE_ID);

    expect(listGrants).toHaveBeenCalledWith({
      tenantId: REQ.user.tenantContext.tenantId,
      deviceId: DEVICE_ID,
    });
  });

  it('acknowledges a revoke by the grant id it was given', async () => {
    const revokeGrant = jest.fn().mockResolvedValue(undefined);
    const controller = controllerWith({ revokeGrant });

    await expect(controller.revoke(REQ, 'grant-1')).resolves.toEqual({ revoked: 'grant-1' });
    expect(revokeGrant).toHaveBeenCalledWith({
      tenantId: REQ.user.tenantContext.tenantId,
      grantId: 'grant-1',
      actorMembershipId: REQ.user.tenantContext.membershipId,
    });
  });

  it('exposes every share refusal as a declared error code', () => {
    // Keeps the translation table and ERROR_CODES from drifting apart.
    for (const key of [
      'ShareIdentityInvalid',
      'ShareExpiryInvalid',
      'ShareSelfGrantInvalid',
      'ShareDeviceNotFound',
      'ShareActiveLimitExceeded',
      'ShareGrantNotActive',
    ]) {
      expect(ERROR_CODES).toHaveProperty(key);
    }
  });
});
