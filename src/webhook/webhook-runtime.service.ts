import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PublicApiService } from '../public-api/public-api.service';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * How long one outbound delivery may take before it is abandoned.
 *
 * Kept as a named constant beside the code that uses it, rather than as a literal at the call
 * site, because the number is a policy decision with two audiences: long enough that a
 * legitimately slow receiver is not reported as broken, short enough that a hung one cannot
 * stall delivery to the endpoints queued behind it in `dispatch`.
 */
const DISPATCH_TIMEOUT_MS = 10_000;

/** The delivery outcomes the UI and the retry policy both need to tell apart. */
export enum WebhookDeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export interface DispatchResult {
  endpointId: string;
  event: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  attempts: number;
}

@Injectable()
export class WebhookRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every read and write is scoped by `tenantId`, never by `id` alone.
   *
   * `WebhookEndpoint` is reachable by tenant admins, so a lookup that trusted the body's
   * `endpointId` would let one tenant read another's signing secret and disable another's
   * delivery. The session tenant is the only authority; the path parameter narrows within it.
   */
  async listEndpoints(tenantId: string) {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      // The signing secret is excluded at the query, not dropped in JavaScript. Selecting it
      // and then omitting it from the response still pulls a credential into process memory
      // for every list call, and a future edit that spreads the row instead of mapping it
      // would publish it. There is no read path that needs the secret except creation.
      select: { id: true, url: true, events: true, enabled: true, createdAt: true },
    });
    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      events: Array.isArray(endpoint.events) ? endpoint.events : [],
      enabled: endpoint.enabled,
      createdAt: endpoint.createdAt.toISOString(),
    }));
  }

  async createEndpoint(tenantId: string, url: string, events: string[], signingSecret: string) {
    return this.prisma.webhookEndpoint.create({
      data: { tenantId, url, events, signingSecret },
    });
  }

  async findEndpoint(tenantId: string, endpointId: string) {
    const endpoint = await this.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, tenantId },
    });
    if (!endpoint) {
      // 404 rather than 403: a foreign id must not confirm that the resource exists.
      throw new DomainNotFoundException(
        ERROR_CODES.NotFound,
        'Webhook endpoint tidak ditemukan',
      );
    }
    return endpoint;
  }

  async deleteEndpoint(tenantId: string, endpointId: string) {
    await this.findEndpoint(tenantId, endpointId);
    await this.prisma.webhookEndpoint.delete({ where: { id: endpointId } });
  }

  async setEnabled(tenantId: string, endpointId: string, enabled: boolean) {
    await this.findEndpoint(tenantId, endpointId);
    // `update` takes unique fields only, so the tenant-scoped write is `updateMany`.
    const { count } = await this.prisma.webhookEndpoint.updateMany({
      where: { id: endpointId, tenantId },
      data: { enabled },
    });
    return count;
  }

  async rotateSecret(tenantId: string, endpointId: string, signingSecret: string) {
    await this.findEndpoint(tenantId, endpointId);
    const { count } = await this.prisma.webhookEndpoint.updateMany({
      where: { id: endpointId, tenantId },
      data: { signingSecret },
    });
    return count;
  }

  /**
   * Endpoints subscribed to an event, used by the dispatcher.
   *
   * This is the one read that selects `signingSecret`, because signing is the dispatcher's
   * whole job. The column never leaves this method's caller: `dispatch` puts it into a
   * signature and nothing else, and the delivery row records the header name rather than the
   * value.
   */
  async endpointsForEvent(tenantId: string, event: string) {
    return this.prisma.webhookEndpoint.findMany({
      where: { tenantId, enabled: true },
      // Stated explicitly rather than inherited from the model. This is the only read in the
      // repository that takes `signingSecret`, and an explicit field list is what makes that
      // visible to the credential-column guard — an unselected read that is returned directly
      // would hand every column, including the secret, to whatever consumed the result.
      select: { id: true, url: true, events: true, signingSecret: true },
    }).then((all) =>
      all.filter((endpoint) => {
        const events = Array.isArray(endpoint.events) ? endpoint.events : [];
        return events.includes(event) || events.includes('*');
      }),
    );
  }

  async recordDelivery(input: {
    tenantId: string;
    endpointId: string;
    event: string;
    ok: boolean;
    statusCode: number | null;
    attemptCount: number;
    signatureHeader: string | null;
    /** Set only when the request never got an answer; see `dispatch`. */
    reason?: string | null;
  }): Promise<void> {
    await this.prisma.webhookDelivery.create({
      data: {
        tenantId: input.tenantId,
        endpointId: input.endpointId,
        event: input.event,
        ok: input.ok,
        statusCode: input.statusCode,
        attemptCount: input.attemptCount,
        signatureHeader: input.signatureHeader,
        reason: input.reason ?? null,
      },
    });
  }
}

/**
 * Why an outbound fetch threw, in a form an operator can act on.
 *
 * Node's `fetch` wraps every transport failure in a `TypeError('fetch failed')` and puts the
 * real reason in `cause`. Storing only `error.message` therefore recorded the string
 * "fetch failed" for a refused connection, an unresolvable host and a malformed URL alike —
 * which is the ambiguity the column was added to remove, reintroduced one layer up. The cause
 * carries the distinguishing facts (`ECONNREFUSED`, `ENOTFOUND`, `bad port`), so it is
 * preferred and the wrapper's message is only the fallback.
 *
 * The full chain is walked rather than taking `cause.message` alone: for a TLS failure the
 * interesting code often sits two levels down, and stopping at the first cause gives another
 * uniform string.
 */
export function describeTransportFailure(error: unknown): string {
  // Collected first, formatted second. Whether to drop Node's wrapper message is only known
  // once the whole chain has been read, because the wrapper is the *outermost* error and the
  // one that says nothing.
  const segments: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { message?: unknown; code?: unknown; cause?: unknown };
    const message =
      typeof candidate.message === 'string' && candidate.message.trim() ? candidate.message : null;
    const code = typeof candidate.code === 'string' && candidate.code.trim() ? candidate.code : null;
    if (message || code) {
      // One segment per link in the chain, code first because it is the machine-readable half.
      segments.push(code && message && !message.includes(code) ? `${code}: ${message}` : (code ?? message)!);
    }
    current = candidate.cause;
  }
  if (segments.length === 0) return 'tidak diketahui';

  // Node's wrapper message is dropped when a deeper link said something more specific. It is
  // kept only when it is the entire chain, because then it genuinely is all there is — and
  // `abort` is the same shape: `AbortSignal.timeout` surfaces it, and on its own it is an
  // answer.
  const VAGUE = new Set(['fetch failed', 'This operation was aborted']);
  const specific = segments.filter((s) => !VAGUE.has(s));
  const kept = specific.length > 0 ? specific : segments;

  // Deduped after filtering, because the chain routinely repeats: undici puts the same text
  // on both the wrapper and the cause, and printing it twice reads as two problems.
  return [...new Set(kept)].join(' <- ');
}

/**
 * The missing runtime behind `webhook_endpoints` and `webhook_deliveries`.
 *
 * Both tables and `PublicApiService.signWebhookPayload` existed while nothing could reach
 * them: no route registered an endpoint, and no caller signed anything. The signature function
 * had zero call sites, so a feature with a schema, a crypto helper and no behaviour read as
 * implemented to anyone reading the repository.
 *
 * The signing helper is called rather than reimplemented. A second HMAC implementation in this
 * service would be free to drift from the one a receiver is told to verify against, and the
 * failure mode — signatures that validate locally and nowhere else — is invisible until a
 * consumer rejects production traffic.
 */
@Injectable()
export class WebhookDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: WebhookRepository,
    private readonly publicApi: PublicApiService,
  ) {}

  /**
   * Deliver one event to every enabled endpoint subscribed to it.
   *
   * An endpoint that fails is recorded and skipped rather than aborting the batch: one dead
   * receiver must not stop delivery to the others, and the delivery row is the evidence that
   * it was attempted.
   */
  async dispatch(tenantId: string, event: string, payload: unknown): Promise<DispatchResult[]> {
    const endpoints = await this.repository.endpointsForEvent(tenantId, event);
    const results: DispatchResult[] = [];

    for (const endpoint of endpoints) {
      // The secret is never persisted on the delivery row, only the header name that carried
      // the signature, so the audit trail cannot be replayed as a credential store.
      const signature = this.publicApi.signWebhookPayload(endpoint.signingSecret, payload);
      const signatureHeader = 'x-iot-signature';

      let statusCode: number | null = null;
      let ok = false;
      // Null on success and on an HTTP-level failure, where the status code is the whole
      // story. It holds the reason only for the case the status code cannot describe: the
      // request never got an answer.
      let reason: string | null = null;
      try {
        // A delivery timeout, because there was none.
        //
        // `fetch` has no default deadline: a receiver that accepts the connection and never
        // answers holds this promise open forever. The heartbeat path does not await it — that
        // is exactly why the leak was invisible — so every event to a wedged receiver
        // accumulated an unsettled promise and a socket, and nothing in the process ever said
        // so. `dispatch` also runs in a `for` loop over the tenant's endpoints, so one wedged
        // receiver stopped delivery to every endpoint after it.
        //
        // `AbortSignal.timeout` aborts the request itself rather than racing it, so the socket
        // is released instead of being left half-open.
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            [signatureHeader]: signature,
            'x-iot-event': event,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
        });
        statusCode = response.status;
        ok = response.ok;
      } catch (error) {
        // A receiver that is down, slow, or refuses the connection is a failed delivery, not
        // a failed dispatch. It is recorded as such and the next endpoint still runs.
        statusCode = null;
        ok = false;
        // The one fact `ok: false` and `statusCode: null` cannot carry. A refused connection,
        // an unresolvable host and a malformed URL are indistinguishable in the columns
        // above, and they are the three answers an operator needs to tell apart in order to
        // fix anything. Captured here because this is the only point where it still exists.
        reason = describeTransportFailure(error);
      }

      await this.repository.recordDelivery({
        tenantId,
        endpointId: endpoint.id,
        event,
        ok,
        statusCode,
        attemptCount: 1,
        signatureHeader: ok ? signatureHeader : null,
        reason,
      });

      results.push({
        endpointId: endpoint.id,
        event,
        status: ok ? WebhookDeliveryStatus.DELIVERED : WebhookDeliveryStatus.FAILED,
        statusCode,
        attempts: 1,
      });
    }

    return results;
  }

  /** Recent delivery history, tenant-scoped, for the operator surface. */
  async recentDeliveries(tenantId: string, take = 50) {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      endpointId: row.endpointId,
      event: row.event,
      ok: row.ok,
      statusCode: row.statusCode,
      attemptCount: row.attemptCount,
      // Carried because the console's whole claim is that it shows failures openly. A
      // `GAGAL` row with no reason leaves the operator to guess between a refused connection
      // and a host that does not resolve, which is the ambiguity the column was added to
      // remove. Read explicitly rather than spread, for the same credential reason the
      // endpoint list names.
      reason: row.reason ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
