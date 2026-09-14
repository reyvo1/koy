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

    const response = await backendFetch('/auth/refresh', {
      body: JSON.stringify({ token: refreshToken }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const tokens = await readBackendJson<TokenPair>(response);

    this.session.accessToken = tokens.accessToken;
    this.session.refreshToken = tokens.refreshToken;
    this.refreshedTokens = tokens;
  }
}
