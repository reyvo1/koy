import 'server-only';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000';

export interface BackendErrorBody {
  statusCode?: number;
  requestId?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

export class BackendRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'BackendRequestError';
  }
}

export function backendUrl(pathname: string): URL {
  const configured = process.env.IOT_API_BASE_URL?.trim();
  const base = new URL(configured || DEFAULT_API_BASE_URL);

  if (
    base.protocol !== 'https:' &&
    !(base.protocol === 'http:' && LOOPBACK_HOSTS.has(base.hostname))
  ) {
    throw new Error(
      'IOT_API_BASE_URL must use HTTPS unless it targets a loopback host',
    );
  }

  return new URL(pathname.replace(/^\//, ''), `${base.origin}/`);
}

export async function backendFetch(
  pathname: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  return fetch(backendUrl(pathname), {
    ...init,
    cache: 'no-store',
    headers,
  });
}

export async function readBackendJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    BackendErrorBody | T | null;

  if (!response.ok) {
    const body = payload as BackendErrorBody | null;
    throw new BackendRequestError(
      response.status,
      body?.error?.code ?? 'BACKEND_REQUEST_FAILED',
      body?.error?.message ?? 'Backend request failed',
      body?.requestId ?? response.headers.get('x-request-id'),
    );
  }

  if (payload === null) {
    throw new BackendRequestError(
      502,
      'BACKEND_RESPONSE_INVALID',
      'Backend response did not contain JSON',
      response.headers.get('x-request-id'),
    );
  }

  return payload as T;
}
