import {
  MOBILE_SECURE_SESSION_KEY,
  MobileSecureStorageError,
  SecureStorePort,
  createMobileSecureSessionStore,
} from './secure-session-store';

function createPort(initial: string | null = null) {
  let stored = initial;
  const calls = {
    delete: 0,
    get: 0,
    set: [] as Array<{ key: string; value: string }>,
  };

  const port: SecureStorePort = {
    deleteItemAsync: async () => {
      calls.delete += 1;
      stored = null;
    },
    getItemAsync: async () => {
      calls.get += 1;
      return stored;
    },
    isAvailableAsync: async () => true,
    setItemAsync: async (key, value) => {
      calls.set.push({ key, value });
      stored = value;
    },
  };

  return { calls, port, readStored: () => stored };
}

describe('mobile secure session store', () => {
  it('persists access token, refresh token, and tenant selector as one versioned secure record', async () => {
    const fixture = createPort();
    const store = createMobileSecureSessionStore(fixture.port);

    await store.replace({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-1',
    });

    expect(fixture.calls.set).toHaveLength(1);
    expect(fixture.calls.set[0]?.key).toBe(MOBILE_SECURE_SESSION_KEY);
    expect(JSON.parse(fixture.calls.set[0]?.value ?? '')).toEqual({
      version: 1,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-1',
    });
    await expect(store.read()).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tenantId: 'tenant-1',
    });
  });

  it('clears malformed persisted session material instead of returning partial credentials', async () => {
    const fixture = createPort(
      JSON.stringify({
        version: 1,
        accessToken: 'access-token',
        tenantId: 'tenant-1',
      }),
    );
    const store = createMobileSecureSessionStore(fixture.port);

    await expect(store.read()).resolves.toBeNull();
    expect(fixture.calls.delete).toBe(1);
    expect(fixture.readStored()).toBeNull();
  });

  it('rejects invalid replacement data before writing secure storage', async () => {
    const fixture = createPort();
    const store = createMobileSecureSessionStore(fixture.port);

    await expect(
      store.replace({
        accessToken: '',
        refreshToken: 'refresh-token',
        tenantId: 'tenant-1',
      }),
    ).rejects.toThrow('Mobile session data is invalid.');
    expect(fixture.calls.set).toHaveLength(0);
  });

  it('fails closed when platform secure storage is unavailable', async () => {
    const fixture = createPort();
    fixture.port.isAvailableAsync = async () => false;
    const store = createMobileSecureSessionStore(fixture.port);

    await expect(store.read()).rejects.toEqual(
      expect.objectContaining<Partial<MobileSecureStorageError>>({
        code: 'MOBILE_SECURE_STORAGE_UNAVAILABLE',
      }),
    );
  });

  it('attempts scoped cleanup when atomic replacement fails', async () => {
    const fixture = createPort();
    fixture.port.setItemAsync = async () => {
      throw new Error('native write failed');
    };
    const store = createMobileSecureSessionStore(fixture.port);

    await expect(
      store.replace({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tenantId: 'tenant-1',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<MobileSecureStorageError>>({
        code: 'MOBILE_SECURE_STORAGE_REPLACE_FAILED',
      }),
    );
    expect(fixture.calls.delete).toBe(1);
  });
});
