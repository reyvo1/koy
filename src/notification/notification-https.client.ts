import { request } from 'node:https';
import type { RequestOptions } from 'node:https';

export type NotificationHttpsFailureKind = 'TIMEOUT' | 'TLS' | 'NETWORK';

export class NotificationHttpsError extends Error {
  readonly code: string;
  readonly kind: NotificationHttpsFailureKind;
  readonly causeCode?: string;

  constructor(kind: NotificationHttpsFailureKind, cause?: unknown) {
    const causeCode = readCauseCode(cause);
    super(`NOTIFICATION_HTTPS_${kind}${causeCode ? `:${causeCode}` : ''}`);
    if (cause instanceof Error) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
    this.name = 'NotificationHttpsError';
    this.kind = kind;
    this.code = `NOTIFICATION_HTTPS_${kind}`;
    this.causeCode = causeCode;
  }
}

export interface NotificationHttpsResponse {
  statusCode: number;
}

/**
 * Shared outbound HTTPS implementation for Notification transports.
 *
 * Production uses the platform trust store with certificate verification
 * enabled. Tests may create an isolated instance with one explicit trusted
 * CA; this never mutates process-global TLS settings.
 */
export class NotificationHttpsClient {
  private trustedCa?: Buffer;

  static withTrustedCa(ca: Buffer | string): NotificationHttpsClient {
    const client = new NotificationHttpsClient();
    client.trustedCa = Buffer.isBuffer(ca) ? Buffer.from(ca) : Buffer.from(ca);
    return client;
  }

  async postJson(
    url: URL,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
  ): Promise<NotificationHttpsResponse> {
    if (url.protocol !== 'https:') {
      throw new NotificationHttpsError('TLS', {
        code: 'HTTPS_PROTOCOL_REQUIRED',
      });
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('notification HTTPS timeout must be a positive number');
    }

    const payload = JSON.stringify(body);
    const options: RequestOptions = {
      method: 'POST',
      headers: {
        ...headers,
        'content-length': String(Buffer.byteLength(payload)),
      },
      rejectUnauthorized: true,
    };
    if (this.trustedCa) {
      options.ca = this.trustedCa;
    }

    return new Promise<NotificationHttpsResponse>((resolve, reject) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const clearDeadline = () => {
        if (deadline) clearTimeout(deadline);
        deadline = undefined;
      };
      const settleReject = (error: unknown) => {
        if (settled) return;
        settled = true;
        clearDeadline();
        reject(this.classify(error));
      };
      const settleResolve = (statusCode: number) => {
        if (settled) return;
        settled = true;
        clearDeadline();
        resolve({ statusCode });
      };

      const outgoing = request(url, options, (response) => {
        response.on('error', settleReject);
        response.on('aborted', () =>
          settleReject(
            Object.assign(new Error('response aborted'), { code: 'ECONNRESET' }),
          ),
        );
        response.resume();
        response.once('end', () => settleResolve(response.statusCode ?? 0));
      });

      deadline = setTimeout(() => {
        outgoing.destroy(
          Object.assign(new Error('notification HTTPS request timed out'), {
            code: 'ETIMEDOUT',
          }),
        );
      }, timeoutMs);
      outgoing.once('error', settleReject);
      outgoing.end(payload);
    });
  }

  private classify(error: unknown): NotificationHttpsError {
    const code = readCauseCode(error);
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return new NotificationHttpsError('TIMEOUT', error);
    }
    if (isTlsFailureCode(code)) {
      return new NotificationHttpsError('TLS', error);
    }
    return new NotificationHttpsError('NETWORK', error);
  }
}

function readCauseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : undefined;
}

function isTlsFailureCode(code: string | undefined): boolean {
  if (!code) return false;
  return (
    code.startsWith('ERR_TLS_') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'CERT_HAS_EXPIRED' ||
    code === 'CERT_NOT_YET_VALID' ||
    code === 'UNABLE_TO_GET_ISSUER_CERT' ||
    code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
  );
}
