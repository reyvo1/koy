import { MobileApiError } from '../session/mobile-session-client';
import type {
  MobileLoginCredentials,
  MobileSessionSummary,
} from '../session/session-model';
import {
  MobileSessionGateway,
  bootstrapMobileAuth,
  loginMobileAuth,
  logoutMobileAuth,
} from './mobile-auth-controller';

function createGateway(overrides: Partial<MobileSessionGateway> = {}) {
  const gateway: MobileSessionGateway = {
    getSession: async () => null,
    login: async (credentials: MobileLoginCredentials) => ({
      authenticated: true,
      tenantId: credentials.tenantId,
    }),
    logout: async () => undefined,
    ...overrides,
  };

  return gateway;
}

const authenticated: MobileSessionSummary = {
  authenticated: true,
  tenantId: 'tenant-1',
};

describe('mobile auth controller', () => {
  it('restores an authenticated shell from secure session state', async () => {
    await expect(
      bootstrapMobileAuth(
        createGateway({ getSession: async () => authenticated }),
      ),
    ).resolves.toEqual({ kind: 'authenticated', tenantId: 'tenant-1' });
  });

  it('opens the login experience when no secure session exists', async () => {
    await expect(bootstrapMobileAuth(createGateway())).resolves.toEqual({
      kind: 'unauthenticated',
      notice: null,
    });
  });

  it('blocks the application when secure storage is unavailable', async () => {
    await expect(
      bootstrapMobileAuth(
        createGateway({
          getSession: async () => {
            throw new MobileApiError(
              0,
              'MOBILE_SECURE_STORAGE_UNAVAILABLE',
              'unavailable',
              null,
            );
          },
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'blocked',
        notice: expect.objectContaining({
          title: 'Penyimpanan aman tidak tersedia',
        }),
      }),
    );
  });

  it('enters the authenticated shell after successful login', async () => {
    await expect(
      loginMobileAuth(createGateway(), {
        email: 'user@example.com',
        password: 'secret',
        tenantId: 'tenant-1',
      }),
    ).resolves.toEqual({ kind: 'authenticated', tenantId: 'tenant-1' });
  });

  it('maps invalid credentials without exposing backend payloads', async () => {
    const state = await loginMobileAuth(
      createGateway({
        login: async () => {
          throw new MobileApiError(
            401,
            'AUTH_CREDENTIALS_INVALID',
            'backend detail',
            'request-1',
          );
        },
      }),
      { email: 'user@example.com', password: 'secret', tenantId: 'tenant-1' },
    );

    expect(state).toEqual(
      expect.objectContaining({
        kind: 'unauthenticated',
        notice: expect.objectContaining({
          message: 'Email, password, atau tenant tidak dapat diverifikasi.',
          requestId: 'request-1',
        }),
      }),
    );
    expect(JSON.stringify(state)).not.toContain('backend detail');
  });

  it('maps an unreachable API to a retryable offline login notice', async () => {
    await expect(
      loginMobileAuth(
        createGateway({
          login: async () => {
            throw new MobileApiError(
              0,
              'MOBILE_API_UNREACHABLE',
              'offline',
              null,
            );
          },
        }),
        { email: 'user@example.com', password: 'secret', tenantId: 'tenant-1' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'unauthenticated',
        notice: expect.objectContaining({ tone: 'offline' }),
      }),
    );
  });

  it('maps rate limiting without retrying automatically', async () => {
    await expect(
      loginMobileAuth(
        createGateway({
          login: async () => {
            throw new MobileApiError(
              429,
              'MOBILE_RATE_LIMITED',
              'limited',
              null,
            );
          },
        }),
        { email: 'user@example.com', password: 'secret', tenantId: 'tenant-1' },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'unauthenticated',
        notice: expect.objectContaining({ tone: 'warning' }),
      }),
    );
  });

  it('returns to login after logout completes', async () => {
    await expect(logoutMobileAuth(createGateway())).resolves.toEqual({
      kind: 'unauthenticated',
      notice: null,
    });
  });

  it('blocks when local secure cleanup cannot be completed', async () => {
    await expect(
      logoutMobileAuth(
        createGateway({
          logout: async () => {
            throw new MobileApiError(
              0,
              'MOBILE_SECURE_STORAGE_CLEAR_FAILED',
              'clear failed',
              null,
            );
          },
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'blocked',
        notice: expect.objectContaining({
          title: 'Penyimpanan aman tidak tersedia',
        }),
      }),
    );
  });
});
