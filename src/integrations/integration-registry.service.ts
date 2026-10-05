import { Injectable, Logger } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

import { ERROR_CODES } from '../common/errors/error-code';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_LIMITS = {
  maxDisplayNameLength: 120,
  maxCredentialRefLength: 256,
} as const;

export const INTEGRATION_CREDENTIAL_REF_PREFIX = 'secret://';

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
    const displayName = input.displayName.trim();
    if (
      !displayName ||
      displayName.length > INTEGRATION_LIMITS.maxDisplayNameLength
    ) {
      throw Object.assign(new Error('invalid display name'), {
        code: 'INTEGRATION_NAME_INVALID',
      });
    }
    if (
      !input.credentialRef ||
      input.credentialRef.trim() !== input.credentialRef ||
      input.credentialRef.length > INTEGRATION_LIMITS.maxCredentialRefLength ||
      !input.credentialRef.startsWith(INTEGRATION_CREDENTIAL_REF_PREFIX) ||
      input.credentialRef.length <= INTEGRATION_CREDENTIAL_REF_PREFIX.length
    ) {
      throw Object.assign(new Error('invalid credential reference'), {
        code: 'INTEGRATION_CREDENTIAL_REF_INVALID',
      });
    }

    const created = await this.prisma.integration.create({
      data: {
        tenantId: input.tenantId,
        provider: input.provider,
        displayName,
        credentialRef: input.credentialRef,
        status: 'REGISTERED',
      },
    });
    return { id: created.id };
  }

  /**
   * Marks CONNECTED or ERROR after an adapter's connect attempt.
   *
   * Throws when no row changed. It used to return `void` and ignore the result of `updateMany`, so an
   * integration id belonging to another tenant — or one that did not exist — looked exactly like a
   * successful status change. A caller could not tell "the provider is offline" from "that row was
   * never yours", and the second is a security-relevant answer being reported as an operational one.
   */
  async setStatus(input: {
    integrationId: string;
    tenantId: string;
    status: 'CONNECTED' | 'ERROR' | 'DISABLED';
    lastError?: string;
  }): Promise<void> {
    const updated = await this.prisma.integration.updateMany({
      where: { id: input.integrationId, tenantId: input.tenantId },
      data: {
        status: input.status as IntegrationStatus,
        lastError: input.status === 'ERROR' ? (input.lastError ?? 'unknown') : null,
      },
    });

    if (updated.count === 0) {
      throw new DomainNotFoundException(
        ERROR_CODES.IntegrationNotFound,
        'Integration tidak ditemukan untuk tenant ini.',
      );
    }
  }

  /**
   * Loads an integration and proves it belongs to the tenant.
   *
   * Exists because `recordSync` upserted with a caller-supplied `tenantId`: an integration id from
   * another tenant would have produced a sync row pointing at an integration the caller never named,
   * which is a cross-tenant write that succeeds rather than one that fails loudly.
   */
  async verifyIntegration(input: {
    integrationId: string;
    tenantId: string;
  }): Promise<{ id: string; provider: IntegrationProvider; credentialRef: string }> {
    const integration = await this.prisma.integration.findFirst({
      where: { id: input.integrationId, tenantId: input.tenantId },
      select: { id: true, provider: true, credentialRef: true },
    });
    if (!integration) {
      throw new DomainNotFoundException(
        ERROR_CODES.IntegrationNotFound,
        'Integration tidak ditemukan untuk tenant ini.',
      );
    }
    return integration;
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
    // Provenance first. Without this, the tenantId on the row is whatever the caller passed.
    await this.verifyIntegration({
      integrationId: input.integrationId,
      tenantId: input.tenantId,
    });

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
