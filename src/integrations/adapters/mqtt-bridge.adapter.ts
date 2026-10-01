import { Injectable, Logger } from '@nestjs/common';
import * as mqtt from 'mqtt';

import { IntegrationProvider } from '@prisma/client';

import { DomainConflictException } from '../../common/errors/domain-exceptions';
import { ERROR_CODES } from '../../common/errors/error-code';
import { IntegrationRegistryService } from '../integration-registry.service';

/**
 * MQTT_BRIDGE — the one provider adapter in this repository that talks to something real.
 *
 * ## Why this provider and not ALEXA or GOOGLE_HOME
 *
 * This repo runs an EMQX broker, so an adapter over MQTT can be proven end to end against a stack
 * that exists. A Google Home adapter written here would be an unverifiable claim about someone
 * else's OAuth consent screen, and a Alexa one about a certification process neither of us controls.
 * The registry admits all four provider values; only this one has anything behind it, and the
 * contract that says so is `wave8-integration-adapter.contract.spec.ts` — so adding another adapter
 * means changing a claim on the record, not quietly widening it.
 *
 * ## Credentials
 *
 * `Integration.credentialRef` is a reference, not a secret, and nothing in this file stores or reads
 * one. The broker URL and the topic prefix come from tenant configuration; anything genuinely secret
 * belongs in the tenant secret store and is resolved by the caller that owns the store. An adapter
 * that read a password off the integration row would be a different and worse design.
 *
 * ## Failure is reported, not swallowed
 *
 * A connect that fails records `ERROR` through the registry, including the reason. It does not
 * leave the integration looking `REGISTERED`, which is what an operator would then read as "this has
 * never been attempted".
 */

export const MQTT_BRIDGE_TIMEOUT_MS = 10_000;
export const MQTT_BRIDGE_QOS = 1;

export interface MqttBridgeConfig {
  brokerUrl: string;
  /** Tenant-scoped prefix. Never a shared one: two tenants on the same broker must not see each other. */
  topicPrefix: string;
  username?: string;
  password?: string;
}

export interface SyncedEntity {
  entityType: string;
  externalEntityId: string;
  internalEntityId: string;
}

@Injectable()
export class MqttBridgeAdapter {
  private readonly logger = new Logger(MqttBridgeAdapter.name);

  constructor(private readonly registry: IntegrationRegistryService) {}

  /**
   * Opens a connection, subscribes, and records the outcome.
   *
   * Resolves only when the subscribe has been acknowledged. Resolving on `connect` would report a
   * working integration while every message was still being dropped.
   */
  async connect(input: {
    integrationId: string;
    tenantId: string;
    config: MqttBridgeConfig;
  }): Promise<{ connected: true; clientId: string }> {
    const integration = await this.registry.verifyIntegration({
      integrationId: input.integrationId,
      tenantId: input.tenantId,
    });
    if (integration.provider !== IntegrationProvider.MQTT_BRIDGE) {
      throw new DomainConflictException(
        ERROR_CODES.IntegrationNotFound,
        `Integration ${integration.id} bukan MQTT_BRIDGE; adapter ini tidak boleh dipakai.`,
      );
    }

    // The socket open is inside the try. It was outside once, which meant a broker that refused the
    // connection left the integration at REGISTERED — indistinguishable, to an operator, from one
    // nobody ever tried. Both failure modes now record ERROR with the reason.
    let client: mqtt.MqttClient | null = null;
    try {
      client = await this.openClient(input.config, input.tenantId);
      await this.subscribe(client, input.config.topicPrefix);
    } catch (cause) {
      if (client) await this.disconnect(client);
      await this.registry.setStatus({
        integrationId: input.integrationId,
        tenantId: input.tenantId,
        status: 'ERROR',
        lastError: cause instanceof Error ? cause.message : String(cause),
      });
      throw cause;
    }

    await this.registry.setStatus({
      integrationId: input.integrationId,
      tenantId: input.tenantId,
      status: 'CONNECTED',
    });

    this.logger.log({
      event: 'integration.mqtt.connected',
      outcome: 'connected',
      integrationId: input.integrationId,
      provider: integration.provider,
      credentialRef: integration.credentialRef,
    });

    return { connected: true, clientId: client.options.clientId ?? '' };
  }

  /**
   * Publishes an entity to the bridge and records the mapping.
   *
   * The mapping is recorded after the publish is acknowledged. Recording first would leave a sync
   * state claiming the external system knows about an entity it was never told about — and since the
   * mapping is what a later reconciliation trusts, that is worse than a missing row.
   */
  async syncEntity(input: {
    integrationId: string;
    tenantId: string;
    config: MqttBridgeConfig;
    entity: SyncedEntity;
    payload: Record<string, unknown>;
  }): Promise<{ published: true; topic: string }> {
    const client = await this.openClient(input.config, input.tenantId);
    try {
      const topic = this.topicFor(input.config.topicPrefix, input.entity.entityType, input.entity.externalEntityId);
      await this.publish(client, topic, input.payload);
      // Routed through the registry so the idempotency key stays in one place, and so a repeated
      // sync of the same entity updates the existing mapping instead of creating a second one.
      await this.registry.recordSync({
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        entityType: input.entity.entityType,
        externalEntityId: input.entity.externalEntityId,
        internalEntityId: input.entity.internalEntityId,
      });
      return { published: true, topic };
    } finally {
      await this.disconnect(client);
    }
  }

  private topicFor(prefix: string, entityType: string, externalEntityId: string): string {
    // The external id goes into the topic, so it is encoded: a raw `/` or `+` would change the
    // meaning of the topic and could subscribe the bridge to more than it was granted.
    return `${prefix}/${entityType}/${encodeURIComponent(externalEntityId)}`;
  }

  private openClient(
    config: MqttBridgeConfig,
    tenantId: string,
  ): Promise<mqtt.MqttClient> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(config.brokerUrl, {
        clientId: `iot-bridge-${tenantId.slice(0, 8)}-${Date.now()}`,
        username: config.username,
        password: config.password,
        connectTimeout: MQTT_BRIDGE_TIMEOUT_MS,
        reconnectPeriod: 0,
      });

      // One guard for both failure modes. Without the `once`, a client that errors and is then
      // cleaned up would also fire `close` and call reject a second time, after the promise had
      // already settled.
      const settle = (error?: Error): void => {
        client.removeListener('connect', onConnect);
        client.removeListener('error', onError);
        if (error) {
          client.end(true);
          reject(error);
        } else {
          resolve(client);
        }
      };
      const onConnect = (): void => settle();
      const onError = (cause: Error): void =>
        settle(new Error(`mqtt connect failed: ${cause.message}`));

      client.once('connect', onConnect);
      client.once('error', onError);
    });
  }

  private subscribe(client: mqtt.MqttClient, prefix: string): Promise<void> {
    return new Promise((resolve, reject) => {
      client.subscribe(`${prefix}/#`, { qos: MQTT_BRIDGE_QOS }, (error) => {
        if (error) reject(new Error(`mqtt subscribe failed: ${error.message}`));
        else resolve();
      });
    });
  }

  private publish(
    client: mqtt.MqttClient,
    topic: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.publish(
        topic,
        JSON.stringify(payload),
        { qos: MQTT_BRIDGE_QOS },
        (error) => {
          if (error) reject(new Error(`mqtt publish failed: ${error.message}`));
          else resolve();
        },
      );
    });
  }

  private disconnect(client: mqtt.MqttClient): Promise<void> {
    return new Promise((resolve) => {
      client.end(true, {}, () => resolve());
    });
  }
}
