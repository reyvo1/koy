import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * How long the broker is given to answer.
 *
 * Short, because this sits behind an operator clicking a refresh button. A management surface that
 * hangs for thirty seconds is one operators stop using, and a surface they stop using is the same
 * as no surface at all.
 */
const BROKER_TIMEOUT_MS = 5_000;

/**
 * How many clients are listed.
 *
 * Bounded on purpose. The broker is the source of truth for a fleet that can be very large, and an
 * unbounded list would make the console slow exactly when something is wrong.
 */
const MAX_CLIENTS = 100;

interface BrokerLoginResponse {
  token?: string;
  role?: string;
  version?: string;
}

interface BrokerClient {
  clientid?: string;
  username?: string;
  node?: string;
  connected_at?: string;
  subscriptions_cnt?: number;
  keepalive?: number;
  proto_ver?: number;
  subscriber?: boolean;
}

interface BrokerPage<T> {
  data?: T[];
  meta?: { page?: number; limit?: number; count?: number };
}

export interface MqttManagementSnapshot {
  /**
   * Whether the broker answered.
   *
   * Separate from the client count on purpose: "0 clients connected" and "I could not ask" are
   * different facts. Collapsing them into one number is how a healthy platform gets restarted
   * during an outage, so this is reported alongside the count and never inferred from it.
   */
  brokerReachable: boolean;
  /** Why the broker could not be reached, when it could not. Never a stack trace. */
  brokerError: string | null;
  checkedAt: string;
  clientCount: number;
  clients: Array<{
    clientId: string;
    username: string | null;
    node: string | null;
    connectedAt: string | null;
    subscriptionCount: number;
    keepaliveSeconds: number | null;
    protocolVersion: number | null;
  }>;
  /** Node state, because one running and one stopped node produce the same empty client list. */
  nodes: Array<{ name: string; status: string }>;
  /** Subscription total, counted by the broker rather than derived from the client page. */
  subscriptionCount: number | null;
  /** How many of the listed clients are this platform's own publisher. */
  platformPublisherCount: number;
  /** The prefix that identifies them, so the count above is auditable. */
  platformPublisherPrefix: string;
}

/**
 * Live MQTT management evidence.
 *
 * MQTT already works: the publisher adapter connects, and the running container holds a live
 * client on the broker. What did not exist was any way to *see* that from inside the platform. The
 * broker dashboard is published and its credentials are configured, but no source file read them,
 * so management was a browser tab a human opened by hand -- with no tenant boundary, nothing in the
 * console to correlate against a device, and no record that anyone looked.
 *
 * Four choices are load-bearing, and each of them is a way this could have gone wrong quietly:
 *
 *  - **Read-only.** No disconnect, no topic change, no restart. A management surface that can kick
 *    a device carries a far larger blast radius than one that observes, and nothing asked for it.
 *  - **Credentials stay server-side.** They come from configuration and the broker token never
 *    leaves this class. Proxying the dashboard would otherwise hand every platform operator the
 *    broker's administrator token, which has far more power than the page it came from.
 *  - **Authenticate per call.** Caching a token would turn a transient broker hiccup into a
 *    persistent failure, and would keep a rotated credential working until the next restart.
 *  - **A downed broker is not an empty fleet.** `brokerReachable` travels with every response, so
 *    the console can say "I could not ask" instead of showing a confident zero.
 */
@Injectable()
export class MqttManagementService {
  private readonly logger = new Logger(MqttManagementService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Ask the broker what is connected right now.
   *
   * Never throws for a broker problem: an unreachable broker is a fact to report, not an exception
   * that turns into a 500 the console renders as a platform fault.
   */
  async snapshot(): Promise<MqttManagementSnapshot> {
    const checkedAt = new Date().toISOString();
    const prefix = this.platformPublisherPrefix();

    const apiUrl = this.brokerUrl();
    if (!apiUrl) {
      return this.unreachable(
        checkedAt,
        prefix,
        'EMQX_API_URL is not configured, so the broker cannot be asked',
      );
    }

    let token: string;
    try {
      token = await this.login(apiUrl);
    } catch (cause) {
      // Deliberately not re-thrown. A broker that is down, or credentials that were rotated, are
      // both reportable states; the console needs to show which.
      const message = cause instanceof Error ? cause.message : 'broker login failed';
      this.logger.warn({ event: 'mqtt.broker_login_failed', reason: message });
      return this.unreachable(checkedAt, prefix, message);
    }

    try {
      const [clients, nodes, subscriptions] = await Promise.all([
        this.getPage<BrokerClient>(apiUrl, token, `/clients?page=1&limit=${MAX_CLIENTS}`),
        this.getJson<Array<{ name?: string; status?: string }>>(apiUrl, token, '/nodes'),
        this.getPage<unknown>(apiUrl, token, '/subscriptions?page=1&limit=1'),
      ]);

      const rows = (clients.data ?? []).map((row) => this.toClient(row));

      return {
        brokerReachable: true,
        brokerError: null,
        checkedAt,
        clientCount: rows.length,
        clients: rows,
        nodes: Array.isArray(nodes)
          ? nodes.map((node) => ({ name: String(node?.name ?? 'unknown'), status: String(node?.status ?? 'unknown') }))
          : [],
        subscriptionCount: subscriptions.meta?.count ?? null,
        platformPublisherCount: rows.filter((row) => row.clientId.startsWith(prefix)).length,
        platformPublisherPrefix: prefix,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'broker request failed';
      this.logger.warn({ event: 'mqtt.broker_unreachable', reason: message });
      return this.unreachable(checkedAt, prefix, message);
    }
  }

  /**
   * A snapshot for a broker that could not be asked.
   *
   * Every count is null or zero *and* `brokerReachable` is false. The counts are not "the fleet is
   * empty" -- they are "unknown", and the flag is what tells the console to render that difference
   * instead of a confident zero.
   */
  private unreachable(checkedAt: string, prefix: string, reason: string): MqttManagementSnapshot {
    return {
      brokerReachable: false,
      brokerError: reason,
      checkedAt,
      clientCount: 0,
      clients: [],
      nodes: [],
      subscriptionCount: null,
      platformPublisherCount: 0,
      platformPublisherPrefix: prefix,
    };
  }

  /**
   * Exchange the dashboard credentials for a short-lived token.
   *
   * Basic auth in the request and the token in the response -- that is EMQX's own shape, and it is
   * why the token is short-lived: it is minted per call here rather than held.
   */
  private async login(apiUrl: string): Promise<string> {
    const username = this.config.get<string>('EMQX_DASHBOARD_USERNAME')?.trim();
    const password = this.config.get<string>('EMQX_DASHBOARD_PASSWORD');
    if (!username || !password) {
      throw new Error('EMQX_DASHBOARD_USERNAME and EMQX_DASHBOARD_PASSWORD must be configured');
    }

    const basic = Buffer.from(`${username}:${password}`).toString('base64');
    const body = await this.request(apiUrl, '/api/v5/login', {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/json' },
      payload: JSON.stringify({ username, password }),
    });

    const parsed = body as BrokerLoginResponse;
    if (!parsed?.token) {
      throw new Error('broker login returned no token');
    }
    return parsed.token;
  }

  private async getPage<T>(apiUrl: string, token: string, path: string): Promise<BrokerPage<T>> {
    const body = await this.request(apiUrl, `/api/v5${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    return (body ?? {}) as BrokerPage<T>;
  }

  private async getJson<T>(apiUrl: string, token: string, path: string): Promise<T> {
    const body = await this.request(apiUrl, `/api/v5${path}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    });
    return body as T;
  }

  /**
   * One broker request, always bounded.
   *
   * A timeout here is what makes "unreachable" a reportable state rather than a hang: without it
   * an unresponsive broker holds the operator's request open indefinitely, and an operator waiting
   * on a refresh button eventually restarts the thing they were trying to inspect.
   */
  private async request(
    apiUrl: string,
    path: string,
    init: { method: string; headers: Record<string, string>; payload?: string },
  ): Promise<unknown> {
    const response = await fetch(`${apiUrl}${path}`, {
      method: init.method,
      headers: init.headers,
      body: init.payload,
      signal: AbortSignal.timeout(BROKER_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Status only. The body of a broker error can echo the request, and this is logged.
      throw new Error(`broker responded ${response.status}`);
    }
    return response.json().catch(() => ({}));
  }

  private brokerUrl(): string | null {
    const raw = this.config.get<string>('EMQX_API_URL')?.trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  /**
   * The client-id prefix that identifies this platform's own publisher.
   *
   * Taken from the same configuration the publisher uses, so the count cannot drift from the naming
   * actually in force -- and it is returned in the snapshot, so the number is auditable rather than
   * a number with no stated basis.
   */
  private platformPublisherPrefix(): string {
    return this.config.get<string>('MQTT_CLIENT_ID_PREFIX')?.trim() || 'iot-platform-api';
  }

  private toClient(row: BrokerClient): MqttManagementSnapshot['clients'][number] {
    return {
      clientId: String(row?.clientid ?? 'unknown'),
      username: row?.username ?? null,
      node: row?.node ?? null,
      connectedAt: row?.connected_at ?? null,
      subscriptionCount: Number(row?.subscriptions_cnt ?? 0),
      keepaliveSeconds: row?.keepalive ?? null,
      protocolVersion: row?.proto_ver ?? null,
    };
  }
}