jest.mock('server-only', () => ({}), { virtual: true });

const cookieValues = new Map<string, string>([
  ['iot_admin_access', 'expired-access'],
  ['iot_admin_refresh', 'refresh-one'],
  ['iot_admin_tenant', 'tenant-one'],
]);

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value ? { value } : undefined;
    },
  })),
}));

jest.mock('../apps/admin-web/lib/backend', () => {
  const actual = jest.requireActual('../apps/admin-web/lib/backend');

  return {
    ...actual,
    backendFetch: jest.fn(),
  };
});

import type { NextResponse } from 'next/server';
import { backendFetch } from '../apps/admin-web/lib/backend';
import { AdminSessionBackendClient } from '../apps/admin-web/lib/session';

const backendFetchMock = backendFetch as jest.MockedFunction<
  typeof backendFetch
>;

describe('Module 10 Admin Web session refresh', () => {
  beforeEach(() => {
    backendFetchMock.mockReset();
  });

  it('uses one rotating refresh token for concurrent unauthorized requests', async () => {
    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let expiredAccessCalls = 0;
    let refreshedAccessCalls = 0;
    let refreshCalls = 0;

    backendFetchMock.mockImplementation(async (pathname, init = {}) => {
      if (pathname === '/auth/refresh') {
        refreshCalls += 1;
        expect(init.method).toBe('POST');
        expect(init.body).toBe(JSON.stringify({ token: 'refresh-one' }));
        await refreshGate;
        return jsonResponse(
          { accessToken: 'fresh-access', refreshToken: 'refresh-two' },
          200,
        );
      }

      const headers = new Headers(init.headers);
      expect(headers.get('x-tenant-id')).toBe('tenant-one');

      if (headers.get('authorization') === 'Bearer expired-access') {
        expiredAccessCalls += 1;
        return jsonResponse(
          { error: { code: 'ACCESS_TOKEN_EXPIRED', message: 'Expired' } },
          401,
        );
      }

      expect(headers.get('authorization')).toBe('Bearer fresh-access');
      refreshedAccessCalls += 1;
      return jsonResponse({ ok: true }, 200);
    });

    const client = await AdminSessionBackendClient.create();
    const requests = Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        client.request(`/admin-summary-${index}`),
      ),
    );

    await waitFor(() => expiredAccessCalls === 4 && refreshCalls === 1);
    releaseRefresh?.();

    const responses = await requests;

    expect(responses.every((response) => response.ok)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(expiredAccessCalls).toBe(4);
    expect(refreshedAccessCalls).toBe(4);

    const setCookie = jest.fn();
    client.applySessionUpdate({
      cookies: { set: setCookie },
    } as unknown as NextResponse);

    expect(setCookie).toHaveBeenCalledWith(
      'iot_admin_access',
      'fresh-access',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
    expect(setCookie).toHaveBeenCalledWith(
      'iot_admin_refresh',
      'refresh-two',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('fails closed when refresh returns an invalid token pair', async () => {
    backendFetchMock.mockImplementation(async (pathname, init = {}) => {
      if (pathname === '/auth/refresh') {
        return jsonResponse({ accessToken: 'fresh-access' }, 200);
      }

      const headers = new Headers(init.headers);
      if (headers.get('authorization') === 'Bearer expired-access') {
        return jsonResponse(
          { error: { code: 'ACCESS_TOKEN_EXPIRED', message: 'Expired' } },
          401,
        );
      }

      return jsonResponse({ ok: true }, 200);
    });

    const client = await AdminSessionBackendClient.create();

    await expect(client.request('/admin-summary')).rejects.toMatchObject({
      code: 'ADMIN_WEB_AUTH_RESPONSE_INVALID',
      status: 502,
    });
  });
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Concurrent refresh precondition was not reached');
}
