jest.mock('server-only', () => ({}), { virtual: true });

const backendFetch = jest.fn();
const setSessionCookies = jest.fn();
const setRoleCookie = jest.fn();

jest.mock('../apps/admin-web/lib/backend', () => {
  const actual = jest.requireActual('../apps/admin-web/lib/backend');
  return {
    ...actual,
    backendFetch: (...args: unknown[]) => backendFetch(...args),
  };
});

jest.mock('../apps/admin-web/lib/session', () => {
  const actual = jest.requireActual('../apps/admin-web/lib/session');
  return {
    ...actual,
    setSessionCookies: (...args: unknown[]) => setSessionCookies(...args),
    setRoleCookie: (...args: unknown[]) => setRoleCookie(...args),
  };
});

const resolveTenantId = jest.fn();

jest.mock('../apps/admin-web/lib/tenant-resolver', () => ({
  resolveTenantId: (...args: unknown[]) => resolveTenantId(...args),
}));

import { POST } from '../apps/admin-web/app/api/session/login/route';

describe('Module 10 Admin Web login route', () => {
  beforeEach(() => {
    backendFetch.mockReset();
    setSessionCookies.mockReset();
    setRoleCookie.mockReset();
    resolveTenantId.mockReset().mockResolvedValue('tenant-one');
  });

  it('forwards bounded normalized credentials and stores only validated tokens', async () => {
    backendFetch.mockResolvedValue(
      jsonResponse(
        { accessToken: 'access-one', refreshToken: 'refresh-one', role: 'ADMIN' },
        200,
      ),
    );

    const response = await POST(
      jsonRequest({
        email: '  admin@example.com  ',
        password: 'secret-password',
        tenantId: '  tenant-one  ',
      }),
    );

    expect(response.status).toBe(200);
    expect(backendFetch).toHaveBeenCalledWith('/auth/login', {
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'secret-password',
        tenantId: 'tenant-one',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(setSessionCookies).toHaveBeenCalledWith(
      expect.anything(),
      { accessToken: 'access-one', refreshToken: 'refresh-one' },
      'tenant-one',
    );
    expect(setRoleCookie).toHaveBeenCalledWith(expect.anything(), 'ADMIN');
  });

  it('rejects a non-admin membership and revokes the just-issued backend session', async () => {
    backendFetch
      .mockResolvedValueOnce(
        jsonResponse(
          { accessToken: 'member-access', refreshToken: 'member-refresh', role: 'MEMBER' },
          200,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));

    const response = await POST(
      jsonRequest({
        email: 'member@example.com',
        password: 'secret-password',
        tenantId: 'tenant-one',
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: 'Akun ini tidak memiliki akses ke konsol administrator',
    });
    expect(backendFetch).toHaveBeenNthCalledWith(2, '/auth/logout', {
      method: 'POST',
      headers: { authorization: 'Bearer member-access' },
    });
    expect(setSessionCookies).not.toHaveBeenCalled();
    expect(setRoleCookie).not.toHaveBeenCalled();
  });

  it('rejects oversized input without calling the backend', async () => {
    const response = await POST(
      jsonRequest({
        email: `${'a'.repeat(310)}@example.com`,
        password: 'secret-password',
        tenantId: 'tenant-one',
      }),
    );

    expect(response.status).toBe(400);
    expect(backendFetch).not.toHaveBeenCalled();
  });

  it('fails closed when the backend returns an invalid success body', async () => {
    backendFetch.mockResolvedValue(
      jsonResponse({ accessToken: 'access-only' }, 200),
    );

    const response = await POST(
      jsonRequest({
        email: 'admin@example.com',
        password: 'secret-password',
        tenantId: 'tenant-one',
      }),
    );

    expect(response.status).toBe(502);
    expect(setSessionCookies).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      message: 'The authentication service returned an invalid response',
    });
  });
});

function jsonRequest(body: unknown): Request {
  return new Request('http://admin-web.local/api/session/login', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}
