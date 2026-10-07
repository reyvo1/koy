/**
 * Typed client for the IoT platform public API, version 1.
 *
 * The platform had an API key system, a console page for minting keys, and no endpoint that
 * accepted one. This client is written against `PublicApiController` specifically, not against
 * a wish — and `test/public-api-sdk-contract.spec.ts` reads the controller's own decorators
 * and fails if a route here does not exist, or a route there is missing from here. An SDK that
 * drifts from its server is worse than none, because it fails at the caller's site.
 *
 * Errors carry the platform's stable code. The BFF collapsed 403 into 401, so an integrator
 * cannot trust a status alone to tell "your key is wrong" from "your key may not do this";
 * this client surfaces both the status and the code so the caller can act on the difference.
 */

export const API_KEY_SCOPES = [
  'TELEMETRY_READ',
  'DEVICE_CONTROL',
  'SCENE_EXECUTE',
  'ANALYTICS_READ',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface TelemetryReading {
  id: string;
  eventId: string;
  deviceId: string;
  payload: unknown;
  createdAt: string;
}

export interface AnalyticsFinding {
  id: string;
  [key: string]: unknown;
}

export interface ListResponse<T> {
  items: T[];
  count: number;
}

export class PublicApiError extends Error {
  /**
   * Declared as plain fields rather than TypeScript parameter properties
   * (`constructor(readonly status: number, ...)`), which Node's `--experimental-strip-types`
   * refuses with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. An SDK that only loads under a bundler
   * is an SDK a plain `node` user cannot use, and the error surfaces at their first import
   * rather than anywhere near this line.
   */
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PublicApiError';
    this.status = status;
    this.code = code;
  }

  /** A credential problem: the key is invalid, revoked, or expired. */
  get isAuthFailure(): boolean {
    return this.status === 401;
  }

  /**
   * An authorisation problem: the key is valid and may not do this. Distinct from
   * `isAuthFailure` on purpose — a 403 is not fixed by minting a new key.
   */
  get isPermissionFailure(): boolean {
    return this.status === 403;
  }
}

export interface PublicApiClientOptions {
  /** The API key. Sent as `X-API-Key`. */
  apiKey: string;
  /** Base URL of the platform, e.g. `https://iot.example.com`. */
  baseUrl: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

export class PublicApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly doFetch: typeof fetch;

  constructor(options: PublicApiClientOptions) {
    if (!options.apiKey) {
      // Failing here rather than on the first request: a client constructed without a key
      // would otherwise produce a 401 that reads as a server problem.
      throw new Error('apiKey wajib diisi.');
    }
    if (!options.baseUrl) {
      throw new Error('baseUrl wajib diisi.');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.doFetch = options.fetch ?? fetch;
  }

  /** `GET /v1/devices` — the tenant's devices. Requires `TELEMETRY_READ`. */
  async listDevices(options: { limit?: number } = {}): Promise<ListResponse<Device>> {
    return this.get<ListResponse<Device>>('/v1/devices', { limit: options.limit });
  }

  /**
   * `GET /v1/telemetry` — recent readings. Requires `TELEMETRY_READ`.
   *
   * `deviceId` is filtered together with the key's tenant by the server; there is no way to
   * ask for another tenant's device from here.
   */
  async listTelemetry(
    options: { limit?: number; deviceId?: string } = {},
  ): Promise<ListResponse<TelemetryReading>> {
    return this.get<ListResponse<TelemetryReading>>('/v1/telemetry', {
      limit: options.limit,
      deviceId: options.deviceId,
    });
  }

  /** `GET /v1/findings` — analytics findings. Requires `TELEMETRY_READ`. */
  async listFindings(options: { limit?: number } = {}): Promise<ListResponse<AnalyticsFinding>> {
    return this.get<ListResponse<AnalyticsFinding>>('/v1/findings', { limit: options.limit });
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await this.doFetch(url.toString(), {
      headers: {
        'x-api-key': this.apiKey,
        accept: 'application/json',
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
      throw new PublicApiError(
        response.status,
        error?.code ?? 'UNKNOWN',
        error?.message ?? `Permintaan gagal dengan status ${response.status}.`,
      );
    }

    return payload as T;
  }
}

export * from './capability-value';
