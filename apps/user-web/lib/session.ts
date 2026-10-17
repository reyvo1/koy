import 'server-only';

import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { BackendRequestError, backendFetch, readBackendJson } from './backend';

const ACCESS_COOKIE = 'iot_user_access';
const REFRESH_COOKIE = 'iot_user_refresh';
const TENANT_COOKIE = 'iot_user_tenant';
const ACCESS_MAX_AGE_SECONDS = 60 * 60;
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  tenantId: string | null;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setSessionCookies(
  response: NextResponse,
  tokens: TokenPair,
  tenantId: string,
): void {
  response.cookies.set(
    ACCESS_COOKIE,
    tokens.accessToken,
    cookieOptions(ACCESS_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    REFRESH_COOKIE,
    tokens.refreshToken,
    cookieOptions(REFRESH_MAX_AGE_SECONDS),
  );
  response.cookies.set(
    TENANT_COOKIE,
    tenantId,
    cookieOptions(REFRESH_MAX_AGE_SECONDS),
  );
}

export function clearSessionCookies(response: NextResponse): void {
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, TENANT_COOKIE]) {
    response.cookies.set(name, '', {
      ...cookieOptions(0),
      expires: new Date(0),
    });
  }
}

// Route handlers each build their own SessionBackendClient, so one browser burst (a dashboard
// loading several panels, two tabs, or an SSE reconnect racing a fetch) can present the same
// expired access token and the same refresh cookie to several routes at once. The backend
// rotates refresh tokens with reuse detection and revokes the whole family when a consumed
// token is presented again, which would turn that benign race into a forced logout.
//
// One in-flight rotation per refresh token is shared across every route handler in this
// process, and a completed rotation is replayed for a short bounded window so a straggler
// route that started before the refreshed cookies reached the browser still finishes with the
// fresh pair instead of consuming the token a second time. The replay window is process-local
// and time-bounded; the backend reuse detection itself is untouched. A multi-instance
// deployment would need a shared coordinator, which this single-process app does not have.
const REFRESH_ROTATION_GRACE_MS = 10_000;

interface RefreshRotation {
  settle: 'pending' | 'success' | 'failure';
  expiresAt: number;
  promise: Promise<TokenPair>;
}

const refreshRotations = new Map<string, RefreshRotation>();

function rotateRefreshToken(refreshToken: string): Promise<TokenPair> {
  const now = Date.now();
  const rotation = refreshRotations.get(refreshToken);

  if (rotation && rotation.settle === 'pending') {
    return rotation.promise;
  }

  if (rotation && rotation.settle === 'success' && rotation.expiresAt > now) {
    return rotation.promise;
  }

  for (const [token, entry] of refreshRotations) {
    if (entry.settle !== 'pending' && entry.expiresAt <= now) {
      refreshRotations.delete(token);
    }
  }

  const promise = (async () => {
    const response = await backendFetch('/auth/refresh', {
      body: JSON.stringify({ token: refreshToken }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return readBackendJson<TokenPair>(response);
  })();

  const entry: RefreshRotation = {
    settle: 'pending',
    expiresAt: now + REFRESH_ROTATION_GRACE_MS,
    promise,
  };

  refreshRotations.set(refreshToken, entry);
  promise.then(
    () => {
      entry.settle = 'success';
      entry.expiresAt = Date.now() + REFRESH_ROTATION_GRACE_MS;
    },
    () => {
      entry.settle = 'failure';
      if (refreshRotations.get(refreshToken) === entry) {
        refreshRotations.delete(refreshToken);
      }
    },
  );

  return promise;
}

export class SessionBackendClient {
  private refreshedTokens: TokenPair | null = null;
  private refreshPromise: Promise<void> | null = null;

  private constructor(private readonly session: SessionState) {}

  static async create(): Promise<SessionBackendClient> {
    const store = await cookies();

    return new SessionBackendClient({
      accessToken: store.get(ACCESS_COOKIE)?.value ?? null,
      refreshToken: store.get(REFRESH_COOKIE)?.value ?? null,
      tenantId: store.get(TENANT_COOKIE)?.value ?? null,
    });
  }

  get tenantId(): string {
    if (!this.session.tenantId) {
      throw new BackendRequestError(
        401,
        'USER_WEB_SESSION_MISSING',
        'Session is not available',
        null,
      );
    }

    return this.session.tenantId;
  }

  applySessionUpdate(response: NextResponse): void {
    if (this.refreshedTokens) {
      setSessionCookies(response, this.refreshedTokens, this.tenantId);
    }
  }

  async request(pathname: string, init: RequestInit = {}): Promise<Response> {
    if (!this.session.accessToken || !this.session.tenantId) {
      throw new BackendRequestError(
        401,
        'USER_WEB_SESSION_MISSING',
        'Session is not available',
        null,
      );
    }

    const accessToken = this.session.accessToken;
    let response = await this.authorizedFetch(pathname, init, accessToken);

    if (response.status === 401 && this.session.refreshToken) {
      await this.refreshAfterUnauthorized(accessToken);
      response = await this.authorizedFetch(
        pathname,
        init,
        this.session.accessToken,
      );
    }

    return response;
  }

  private async authorizedFetch(
    pathname: string,
    init: RequestInit,
    accessToken: string,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    headers.set('x-tenant-id', this.tenantId);

    return backendFetch(pathname, {
      ...init,
      headers,
    });
  }

  private async refreshAfterUnauthorized(
    failedAccessToken: string,
  ): Promise<void> {
    if (this.session.accessToken !== failedAccessToken) {
      return;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh().finally(() => {
        this.refreshPromise = null;
      });
    }

    await this.refreshPromise;
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.session.refreshToken;

    if (!refreshToken) {
      throw new BackendRequestError(
        401,
        'USER_WEB_SESSION_MISSING',
        'Session is not available',
        null,
      );
    }

    const tokens = await rotateRefreshToken(refreshToken);

    this.session.accessToken = tokens.accessToken;
    this.session.refreshToken = tokens.refreshToken;
    this.refreshedTokens = tokens;
  }
}
