import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuntimeConnectionsService } from '../runtime-connections/runtime-connections.service';
import { IntegrationRegistryService } from './integration-registry.service';
import {
  MqttBridgeAdapter,
  MqttBridgeConfig,
} from './adapters/mqtt-bridge.adapter';
@Injectable()
export class IntegrationRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: IntegrationRegistryService,
    private readonly connections: RuntimeConnectionsService,
    private readonly mqtt: MqttBridgeAdapter,
  ) {}
  async status(tenantId: string, integrationId: string) {
    const row = await this.registry.verifyIntegration({
      tenantId,
      integrationId,
    });
    const synced = await this.prisma.integrationSyncState.findMany({
      where: { tenantId, integrationId },
      take: 50,
      orderBy: { syncedAt: 'desc' },
      select: {
        entityType: true,
        externalEntityId: true,
        internalEntityId: true,
        syncedAt: true,
      },
    });
    return {
      provider: row.provider,
      supported: ['MQTT_BRIDGE', 'HOME_ASSISTANT'].includes(row.provider),
      items: synced,
      limit: 50,
      evidence: 'LAST_SUCCESSFUL_OPERATION_NOT_CONTINUOUS_HEALTH',
    };
  }
  private async configuration(tenantId: string, integrationId: string) {
    const row = await this.registry.verifyIntegration({
      tenantId,
      integrationId,
    });
    if (row.provider !== 'MQTT_BRIDGE' && row.provider !== 'HOME_ASSISTANT')
      throw new ConflictException(
        'Provider memerlukan adapter dan otorisasi eksternal tersendiri.',
      );
    return {
      row,
      config: this.connections.resolve(
        tenantId,
        row.credentialRef,
        row.provider,
      ),
    };
  }
  private mqttConfig(
    tenantId: string,
    config: Record<string, unknown>,
  ): MqttBridgeConfig {
    let url: URL | null = null;
    try {
      if (typeof config.brokerUrl === 'string') url = new URL(config.brokerUrl);
    } catch {
      throw new ServiceUnavailableException(
        'Konfigurasi bridge tenant tidak valid.',
      );
    }
    const prefix =
      typeof config.topicPrefix === 'string' ? config.topicPrefix : '';
    if (
      !url ||
      !['mqtt:', 'mqtts:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'mqtts:') ||
      !prefix.startsWith(`tenant/${tenantId}/`) ||
      /[#\s+]/.test(prefix)
    )
      throw new ServiceUnavailableException(
        'Konfigurasi bridge tenant tidak valid.',
      );
    return {
      brokerUrl: url.toString(),
      topicPrefix: prefix,
      username:
        typeof config.username === 'string' ? config.username : undefined,
      password:
        typeof config.password === 'string' ? config.password : undefined,
    };
  }
  private async homeAssistant(
    config: Record<string, unknown>,
    path: string,
    init: RequestInit = {},
  ) {
    let url: URL | null = null;
    try {
      if (typeof config.baseUrl === 'string') url = new URL(config.baseUrl);
    } catch {
      throw new ServiceUnavailableException(
        'Konfigurasi Home Assistant tidak valid.',
      );
    }
    if (
      !url ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname)
        )) ||
      typeof config.token !== 'string' ||
      !config.token
    )
      throw new ServiceUnavailableException(
        'Konfigurasi Home Assistant tidak valid.',
      );
    const response = await fetch(new URL(path, url.origin), {
      ...init,
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Provider menolak operasi.');
    return response.json();
  }
  async connect(tenantId: string, integrationId: string) {
    const { row, config } = await this.configuration(tenantId, integrationId);
    try {
      if (row.provider === 'MQTT_BRIDGE')
        await this.mqtt.connect({
          tenantId,
          integrationId,
          config: this.mqttConfig(tenantId, config),
        });
      else {
        const result = await this.homeAssistant(config, '/api/');
        if (result?.message !== 'API running.')
          throw new Error('invalid provider');
      }
      await this.registry.setStatus({
        tenantId,
        integrationId,
        status: 'CONNECTED',
      });
      return {
        connected: true,
        evidence: 'AUTHENTICATED_PROVIDER_OPERATION',
        note: 'Koneksi diperiksa saat aksi ini; status bukan monitoring berkelanjutan.',
      };
    } catch {
      await this.registry.setStatus({
        tenantId,
        integrationId,
        status: 'ERROR',
        lastError: 'Koneksi provider gagal. Periksa konfigurasi operator.',
      });
      throw new ServiceUnavailableException('Koneksi provider gagal.');
    }
  }
  async syncDevice(tenantId: string, integrationId: string, deviceId: unknown) {
    if (typeof deviceId !== 'string' || !deviceId || deviceId.length > 128)
      throw new BadRequestException('Perangkat sinkronisasi tidak valid.');
    const { row, config } = await this.configuration(tenantId, integrationId);
    if (row.status === 'DISABLED')
      throw new ConflictException(
        'Integrasi nonaktif. Periksa koneksi terlebih dahulu.',
      );
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId, status: { not: 'REVOKED' } },
      select: { id: true, name: true, status: true },
    });
    if (!device) throw new NotFoundException('Perangkat tidak ditemukan.');
    const entity = {
      entityType: 'device',
      externalEntityId: `iot_${device.id.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      internalEntityId: device.id,
    };
    try {
      if (row.provider === 'MQTT_BRIDGE')
        await this.mqtt.syncEntity({
          tenantId,
          integrationId,
          config: this.mqttConfig(tenantId, config),
          entity,
          payload: device,
        });
      else {
        const returned = await this.homeAssistant(
          config,
          `/api/states/sensor.${entity.externalEntityId}`,
          {
            method: 'POST',
            body: JSON.stringify({
              state: device.status,
              attributes: { friendly_name: device.name },
            }),
          },
        );
        if (returned?.entity_id !== `sensor.${entity.externalEntityId}`)
          throw new Error('invalid entity');
        await this.registry.recordSync({ tenantId, integrationId, ...entity });
      }
      await this.registry.setStatus({
        tenantId,
        integrationId,
        status: 'CONNECTED',
      });
      return { synced: true, entityId: entity.externalEntityId };
    } catch {
      await this.registry.setStatus({
        tenantId,
        integrationId,
        status: 'ERROR',
        lastError: 'Sinkronisasi provider gagal.',
      });
      throw new ServiceUnavailableException('Sinkronisasi provider gagal.');
    }
  }
  async disable(tenantId: string, integrationId: string) {
    await this.registry.verifyIntegration({ tenantId, integrationId });
    await this.registry.setStatus({
      tenantId,
      integrationId,
      status: 'DISABLED',
    });
    return { disabled: true };
  }
}
