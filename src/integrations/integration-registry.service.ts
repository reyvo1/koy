import { Injectable, Logger } from '@nestjs/common';
import { IntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_LIMITS = {
  maxDisplayNameLength: 120,
  maxCredentialRefLength: 256,
} as const;

/**
 * Module 22 Slice 22.1 — integration registry framework.
 * Registers external ecosystems with a *credential reference* (a key into the
 * tenant's secret store — never raw credentials). Provider adapters implement
 * connect/sync against this registry in later slices; no real provider calls
 * happen here.
 */
@Injectable()
export class IntegrationRegistryService {
  private readonly logger = new Logger(IntegrationRegistryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(input: {
    tenantId: string;
    provider: 'ALEXA' | 'GOOGLE_HOME' | 'HOME_ASSISTANT' | 'MQTT_BRIDGE';
    displayName: string;
    credentialRef: string;
  }): Promise<{ id: string }> {
    if (
      !input.displayName ||
      input.displayName.length > INTEGRATION_LIMITS.maxDisplayNameLength
    ) {
      throw Object.assign(new Error('invalid display name'), {
        code: 'INTEGRATION_NAME_INVALID',
      });
    }
    if (
      !input.credentialRef ||
      input.credentialRef.length > INTEGRATION_LIMITS.maxCredentialRefLength
    ) {
      throw Object.assign(new Error('invalid credential reference'), {
        code: 'INTEGRATION_CREDENTIAL_REF_INVALID',
      });
    }

    const created = await this.prisma.integration.create({
      data: {
        tenantId: input.tenantId,
        provider: input.provider,
        displayName: input.displayName,
        credentialRef: input.credentialRef,
        status: 'REGISTERED',
      },
    });
    return { id: created.id };
  }

  /** Marks CONNECTED or ERROR after an adapter's connect attempt. */
  async setStatus(input: {
    integrationId: string;
    tenantId: string;
    status: 'CONNECTED' | 'ERROR' | 'DISABLED';
    lastError?: string;
  }): Promise<void> {
    await this.prisma.integration.updateMany({
      where: { id: input.integrationId, tenantId: input.tenantId },
      data: {
        status: input.status as IntegrationStatus,
        lastError: input.status === 'ERROR' ? (input.lastError ?? 'unknown') : null,
      },
    });
  }

  /**
   * Upsert one sync mapping. Idempotent per
   * (integration, entityType, externalEntityId).
   */
  async recordSync(input: {
    tenantId: string;
    integrationId: string;
    entityType: string;
    externalEntityId: string;
    internalEntityId: string;
  }): Promise<void> {
    await this.prisma.integrationSyncState.upsert({
      where: {
        integrationId_entityType_externalEntityId: {
          integrationId: input.integrationId,
          entityType: input.entityType,
          externalEntityId: input.externalEntityId,
        },
      },
      create: {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        entityType: input.entityType,
        externalEntityId: input.externalEntityId,
        internalEntityId: input.internalEntityId,
      },
      update: {
        internalEntityId: input.internalEntityId,
        syncedAt: new Date(),
      },
    });
    this.logger.log({
      event: 'integration.sync.recorded',
      outcome: 'recorded',
      integrationId: input.integrationId,
      entityType: input.entityType,
    });
  }
}
