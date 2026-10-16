import { MobileApiError, MobileSessionClient } from './mobile-session-client';
import { MobileSessionRecord } from './session-model';
import { MobileSecureSessionStore } from './secure-session-store';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

function createMemoryStore(initial: MobileSessionRecord | null = null) {
  let session = initial;
  const calls = { clear: 0, read: 0, replace: 0 };
  const store: MobileSecureSessionStore = {
    clear: async () => {
      calls.clear += 1;
      session = null;
    },
    read: async () => {
      calls.read += 1;
      return session;
    },
    replace: async (next) => {
      calls.replace += 1;
      session = next;
    },
  };

  return { calls, readSession: () => session, store };
}

const initialSession: MobileSessionRecord = {
  accessToken: 'access-old',
  refreshToken: 'refresh-old',
  tenantId: 'tenant-1',
};

describe('mobile session client', () => {
  it('logs in only through the configured API origin and atomically stores validated tokens', async () => {
    const memory = createMemoryStore();
    const calls: Array<{ init?: RequestInit; url: string }> = [];
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input, init) => {
        calls.push({ init, url: String(input) });
        return jsonResponse({
          accessToken: 'access-new',
          refreshToken: 'refresh-new',
        });
      },
      sessionStore: memory.store,
    });

    const summary = await client.login({
      email: '  user@example.com  ',
      password: 'password',
      tenantId: '  tenant-1  ',
    });

    expect(summary).toEqual({ authenticated: true, tenantId: 'tenant-1' });
    expect(summary).not.toHaveProperty('accessToken');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.com/auth/login');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      email: 'user@example.com',
      password: 'password',
      tenantId: 'tenant-1',
    });
    expect(memory.readSession()).toEqual({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      tenantId: 'tenant-1',
    });
  });

  it('rejects invalid login input before making a network request', async () => {
    const memory = createMemoryStore();
    const fetcher = jest.fn();
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher,
      sessionStore: memory.store,
    });

    await expect(
      client.login({ email: '', password: 'password', tenantId: 'tenant-1' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'MOBILE_LOGIN_INPUT_INVALID',
        status: 400,
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('overrides caller-supplied authorization headers with trusted secure-session values', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input, init) => {
        expect(String(input)).toBe('https://api.example.com/users/profile');
        const headers = new Headers(init?.headers);
        expect(headers.get('authorization')).toBe('Bearer access-old');
        expect(headers.get('x-tenant-id')).toBe('tenant-1');
        return jsonResponse({ id: 'user-1' });
      },
      sessionStore: memory.store,
    });

    await expect(
      client.requestJson('/users/profile', {
        headers: {
          authorization: 'Bearer caller-token',
          'x-tenant-id': 'other-tenant',
        },
      }),
    ).resolves.toEqual({ id: 'user-1' });
  });

  it('rejects absolute or protocol-relative request targets before fetch', async () => {
    const memory = createMemoryStore(initialSession);
    const fetcher = jest.fn();
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher,
      sessionStore: memory.store,
    });

    await expect(
      client.requestJson('https://other.example.com/users/profile'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'MOBILE_API_PATH_INVALID',
      }),
    );
    await expect(client.requestJson('//other.example.com/x')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'MOBILE_API_PATH_INVALID',
      }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serializes concurrent refresh attempts and atomically replaces both tokens once', async () => {
    const memory = createMemoryStore(initialSession);
    let refreshCalls = 0;
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        const headers = new Headers(init?.headers);

        if (url.pathname === '/auth/refresh') {
          refreshCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return jsonResponse({
            accessToken: 'access-new',
            refreshToken: 'refresh-new',
          });
        }

        if (headers.get('authorization') === 'Bearer access-old') {
          return jsonResponse(
            { error: { code: 'AUTH_EXPIRED', message: 'Expired' } },
            401,
          );
        }

        return jsonResponse({ path: url.pathname });
      },
      sessionStore: memory.store,
    });

    await expect(
      Promise.all([
        client.requestJson('/users/profile'),
        client.requestJson('/dashboards?limit=50'),
      ]),
    ).resolves.toEqual([{ path: '/users/profile' }, { path: '/dashboards' }]);

    expect(refreshCalls).toBe(1);
    expect(memory.calls.replace).toBe(1);
    expect(memory.readSession()).toEqual({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      tenantId: 'tenant-1',
    });
  });

  it('clears secure session material when refresh is rejected', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        return url.pathname === '/auth/refresh'
          ? jsonResponse(
              {
                requestId: 'request-1',
                error: {
                  code: 'AUTH_REFRESH_TOKEN_INVALID',
                  message: 'Invalid token',
                },
              },
              401,
            )
          : jsonResponse({}, 401);
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'AUTH_REFRESH_TOKEN_INVALID',
        requestId: 'request-1',
        status: 401,
      }),
    );
    expect(memory.calls.clear).toBe(1);
    expect(memory.readSession()).toBeNull();
  });

  it('clears secure session material when refresh returns a malformed token response', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        return url.pathname === '/auth/refresh'
          ? jsonResponse({ accessToken: 'access-new' })
          : jsonResponse({}, 401);
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'MOBILE_AUTH_RESPONSE_INVALID',
        status: 502,
      }),
    );
    expect(memory.calls.clear).toBe(1);
    expect(memory.readSession()).toBeNull();
  });

  it('clears the refreshed session when the retried request is still unauthorized', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/auth/refresh') {
          return jsonResponse({
            accessToken: 'access-new',
            refreshToken: 'refresh-new',
          });
        }

        return jsonResponse(
          {
            error: { code: 'AUTH_STILL_UNAUTHORIZED', message: 'Unauthorized' },
          },
          401,
        );
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'AUTH_STILL_UNAUTHORIZED',
        status: 401,
      }),
    );
    expect(memory.calls.replace).toBe(1);
    expect(memory.calls.clear).toBe(1);
    expect(memory.readSession()).toBeNull();
  });

  it('keeps the existing session when refresh fails with a transient server error', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        return url.pathname === '/auth/refresh'
          ? jsonResponse(
              {
                error: {
                  code: 'AUTH_REFRESH_UNAVAILABLE',
                  message: 'Refresh temporarily unavailable',
                },
              },
              503,
            )
          : jsonResponse({}, 401);
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'AUTH_REFRESH_UNAVAILABLE',
        status: 503,
      }),
    );
    expect(memory.calls.clear).toBe(0);
    expect(memory.readSession()).toEqual(initialSession);

    // The expired access token is still in place, so a later successful refresh can recover the
    // session without forcing the operator to sign in again.
    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({ status: 503 }),
    );
    expect(memory.calls.clear).toBe(0);
  });

  it('keeps the existing session when refresh is rate limited', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        return url.pathname === '/auth/refresh'
          ? jsonResponse(
              { error: { code: 'AUTH_RATE_LIMITED', message: 'Too many requests' } },
              429,
            )
          : jsonResponse({}, 401);
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({ status: 429 }),
    );
    expect(memory.calls.clear).toBe(0);
    expect(memory.readSession()).toEqual(initialSession);
  });

  it('keeps the existing session when refresh cannot reach the backend', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        const url = new URL(String(input));
        if (url.pathname === '/auth/refresh') {
          throw new Error('network unavailable');
        }
        return jsonResponse({}, 401);
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'MOBILE_API_UNREACHABLE',
        status: 0,
      }),
    );
    expect(memory.calls.clear).toBe(0);
    expect(memory.readSession()).toEqual(initialSession);
  });

  it('preserves an authoritative 403 without attempting token refresh', async () => {
    const memory = createMemoryStore(initialSession);
    let refreshCalls = 0;
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async (input) => {
        if (new URL(String(input)).pathname === '/auth/refresh') {
          refreshCalls += 1;
        }
        return jsonResponse(
          { error: { code: 'FORBIDDEN', message: 'Forbidden' } },
          403,
        );
      },
      sessionStore: memory.store,
    });

    await expect(client.requestJson('/users/profile')).rejects.toEqual(
      expect.objectContaining<Partial<MobileApiError>>({
        code: 'FORBIDDEN',
        status: 403,
      }),
    );
    expect(refreshCalls).toBe(0);
    expect(memory.readSession()).toEqual(initialSession);
  });

  it('always clears local secure material when logout cannot reach the backend', async () => {
    const memory = createMemoryStore(initialSession);
    const client = new MobileSessionClient({
      apiOrigin: 'https://api.example.com',
      fetcher: async () => {
        throw new Error('offline');
      },
      sessionStore: memory.store,
    });

    await expect(client.logout()).resolves.toBeUndefined();
    expect(memory.calls.clear).toBe(1);
    expect(memory.readSession()).toBeNull();
  });
});
