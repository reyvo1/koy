import { validatePublicApiOrigin } from '../config/public-api-origin.cjs';
import {
  MobileLoginCredentials,
  MobileSessionRecord,
  MobileSessionSummary,
  MobileSessionValidationError,
  normalizeLoginCredentials,
  parseMobileTokenPair,
} from './session-model';
import {
  MobileSecureSessionStore,
  MobileSecureStorageError,
} from './secure-session-store';

const MAX_ERROR_CODE_LENGTH = 128;
const MAX_ERROR_MESSAGE_LENGTH = 512;
const MAX_REQUEST_ID_LENGTH = 256;

type MobileFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

interface MobileSessionClientOptions {
  apiOrigin: string;
  sessionStore: MobileSecureSessionStore;
  fetcher?: MobileFetch;
}

interface BackendErrorPayload {
  requestId?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export class MobileApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

export class MobileSessionClient {
  private readonly apiOrigin: string;
  private readonly fetcher: MobileFetch;
  private sessionCache: MobileSessionRecord | null | undefined;
  private refreshPromise: Promise<MobileSessionRecord> | null = null;

  constructor(private readonly options: MobileSessionClientOptions) {
    this.apiOrigin = validatePublicApiOrigin(options.apiOrigin);
    this.fetcher = options.fetcher ?? fetch;
  }

  /** The validated origin every request goes to; it also namespaces the offline snapshot cache. */
  get origin(): string {
    return this.apiOrigin;
  }

  async login(
    credentials: MobileLoginCredentials,
  ): Promise<MobileSessionSummary> {
    let normalized: MobileLoginCredentials;
    try {
      normalized = normalizeLoginCredentials(credentials);
    } catch (error) {
      if (error instanceof MobileSessionValidationError) {
        throw new MobileApiError(
          400,
          'MOBILE_LOGIN_INPUT_INVALID',
          'Email, password, and tenant are required.',
          null,
        );
      }
      throw error;
    }

    const response = await this.fetchJson('/auth/login', {
      body: JSON.stringify(normalized),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const tokens = await this.readTokenPairOrClear(response);
    const session: MobileSessionRecord = {
      ...tokens,
      tenantId: normalized.tenantId,
    };

    await this.replaceSession(session);
    return { authenticated: true, tenantId: session.tenantId };
  }

  async getSession(): Promise<MobileSessionSummary | null> {
    const session = await this.loadSession();
    return session ? { authenticated: true, tenantId: session.tenantId } : null;
  }

  async requestJson<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    const initialSession = await this.requireSession();
    let response = await this.authorizedFetch(pathname, init, initialSession);

    if (response.status === 401) {
      const refreshed = await this.refreshAfterUnauthorized(
        initialSession.accessToken,
      );
      response = await this.authorizedFetch(pathname, init, refreshed);

      if (response.status === 401) {
        await this.clearSession();
      }
    }

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return this.readJson<T>(response);
  }

  async logout(): Promise<void> {
    const session = await this.loadSession().catch(() => null);

    try {
      if (session?.refreshToken) {
        let response = await this.authorizedFetch(
          '/auth/logout',
          { method: 'POST' },
          session,
        );

        if (response.status === 401) {
          const refreshed = await this.refreshAfterUnauthorized(
            session.accessToken,
          );
          response = await this.authorizedFetch(
            '/auth/logout',
            { method: 'POST' },
            refreshed,
          );
        }

        void response;
      }
    } catch {
      // Local secure cleanup remains mandatory when the backend is unreachable.
    } finally {
      await this.clearSession();
    }
  }

  private async authorizedFetch(
    pathname: string,
    init: RequestInit,
    session: MobileSessionRecord,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.delete('authorization');
    headers.delete('x-tenant-id');
    headers.set('authorization', `Bearer ${session.accessToken}`);
    headers.set('x-tenant-id', session.tenantId);

    return this.fetchJson(pathname, { ...init, headers });
  }

  private async refreshAfterUnauthorized(
    failedAccessToken: string,
  ): Promise<MobileSessionRecord> {
    const current = await this.requireSession();
    if (current.accessToken !== failedAccessToken) {
      return current;
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.performRefresh(current).finally(() => {
        this.refreshPromise = null;
      });
    }

    return this.refreshPromise;
  }

  private async performRefresh(
    session: MobileSessionRecord,
  ): Promise<MobileSessionRecord> {
    const response = await this.fetchJson('/auth/refresh', {
      body: JSON.stringify({ token: session.refreshToken }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      const apiError = await this.toApiError(response);
      await this.clearSession();
      throw apiError;
    }

    const tokens = await this.readTokenPairOrClear(response);
    const refreshed: MobileSessionRecord = {
      ...tokens,
      tenantId: session.tenantId,
    };
    await this.replaceSession(refreshed);
    return refreshed;
  }

  private async readTokenPairOrClear(response: Response) {
    try {
      return parseMobileTokenPair(await this.readJson<unknown>(response));
    } catch {
      await this.clearSession();
      throw new MobileApiError(
        502,
        'MOBILE_AUTH_RESPONSE_INVALID',
        'The authentication service returned an invalid response.',
        response.headers.get('x-request-id'),
      );
    }
  }

  private async loadSession(): Promise<MobileSessionRecord | null> {
    if (this.sessionCache !== undefined) {
      return this.sessionCache;
    }

    try {
      this.sessionCache = await this.options.sessionStore.read();
      return this.sessionCache;
    } catch (error) {
      if (error instanceof MobileSecureStorageError) {
        throw new MobileApiError(0, error.code, error.message, null);
      }
      throw error;
    }
  }

  private async requireSession(): Promise<MobileSessionRecord> {
    const session = await this.loadSession();
    if (!session) {
      throw new MobileApiError(
        401,
        'MOBILE_SESSION_MISSING',
        'Session is not available.',
        null,
      );
    }
    return session;
  }

  private async replaceSession(session: MobileSessionRecord): Promise<void> {
    try {
      await this.options.sessionStore.replace(session);
      this.sessionCache = session;
    } catch (error) {
      this.sessionCache = null;
      try {
        await this.options.sessionStore.clear();
      } catch {
        // Preserve the original replace failure.
      }

      if (error instanceof MobileSecureStorageError) {
        throw new MobileApiError(0, error.code, error.message, null);
      }
      throw error;
    }
  }

  private async clearSession(): Promise<void> {
    this.sessionCache = null;
    this.refreshPromise = null;

    try {
      await this.options.sessionStore.clear();
    } catch (error) {
      if (error instanceof MobileSecureStorageError) {
        throw new MobileApiError(0, error.code, error.message, null);
      }
      throw error;
    }
  }

  private async fetchJson(
    pathname: string,
    init: RequestInit,
  ): Promise<Response> {
    const url = this.resolveApiUrl(pathname);
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');

    try {
      return await this.fetcher(url, { ...init, headers });
    } catch {
      throw new MobileApiError(
        0,
        'MOBILE_API_UNREACHABLE',
        'The IoT Platform API is currently unreachable.',
        null,
      );
    }
  }

  private resolveApiUrl(pathname: string): URL {
    if (
      !pathname.startsWith('/') ||
      pathname.startsWith('//') ||
      pathname.includes('\\')
    ) {
      throw new MobileApiError(
        400,
        'MOBILE_API_PATH_INVALID',
        'The requested API path is invalid.',
        null,
      );
    }

    const url = new URL(pathname, `${this.apiOrigin}/`);
    if (url.origin !== this.apiOrigin || url.hash) {
      throw new MobileApiError(
        400,
        'MOBILE_API_PATH_INVALID',
        'The requested API path is invalid.',
        null,
      );
    }

    return url;
  }

  private async readJson<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => null)) as T | null;
    if (payload === null) {
      throw new MobileApiError(
        502,
        'MOBILE_API_RESPONSE_INVALID',
        'The IoT Platform API returned an invalid response.',
        response.headers.get('x-request-id'),
      );
    }
    return payload;
  }

  private async toApiError(response: Response): Promise<MobileApiError> {
    const payload = (await response
      .json()
      .catch(() => null)) as BackendErrorPayload | null;
    const code = boundedString(payload?.error?.code, MAX_ERROR_CODE_LENGTH);
    const message = boundedString(
      payload?.error?.message,
      MAX_ERROR_MESSAGE_LENGTH,
    );
    const requestId = boundedString(payload?.requestId, MAX_REQUEST_ID_LENGTH);

    return new MobileApiError(
      response.status,
      code ?? defaultErrorCode(response.status),
      message ?? defaultErrorMessage(response.status),
      requestId ?? response.headers.get('x-request-id'),
    );
  }
}

function boundedString(value: unknown, maximumLength: number): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumLength
    ? value
    : null;
}

function defaultErrorCode(status: number): string {
  if (status === 401) return 'MOBILE_UNAUTHENTICATED';
  if (status === 403) return 'MOBILE_FORBIDDEN';
  if (status === 429) return 'MOBILE_RATE_LIMITED';
  return 'MOBILE_API_REQUEST_FAILED';
}

function defaultErrorMessage(status: number): string {
  if (status === 401) return 'Authentication is required.';
  if (status === 403) return 'This action is not permitted.';
  if (status === 429) return 'Too many requests. Try again later.';
  return 'The IoT Platform request failed.';
}
