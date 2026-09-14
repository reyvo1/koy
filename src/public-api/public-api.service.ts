import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const PUBLIC_API_LIMITS = {
  keyPrefixLength: 12,
  maxNameLength: 120,
  maxScopes: 4,
} as const;

/**
 * Module 21 Slice 21.1 — public API key lifecycle + webhook signing.
 * Keys are stored hashed (SHA-256 of the full secret); the plaintext is shown
 * exactly once at creation. Webhook payloads are signed HMAC-SHA256 in the
 * `X-Signature` header so receivers can verify authenticity.
 */
@Injectable()
export class PublicApiService {
  private readonly logger = new Logger(PublicApiService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createApiKey(input: {
    tenantId: string;
    name: string;
    scopes: string[];
    expiresAt?: Date;
  }): Promise<{ id: string; keyPrefix: string; plaintext: string }> {
    if (!input.name || input.name.length > PUBLIC_API_LIMITS.maxNameLength) {
      throw Object.assign(new Error('invalid name'), {
        code: 'API_KEY_NAME_INVALID',
      });
    }
    const validScopes = [
      'TELEMETRY_READ', 'DEVICE_CONTROL', 'SCENE_EXECUTE', 'ANALYTICS_READ',
    ];
    const scopes = input.scopes.filter((s) => validScopes.includes(s));
    if (
      scopes.length === 0 ||
      scopes.length > PUBLIC_API_LIMITS.maxScopes ||
      scopes.length !== input.scopes.length
    ) {
      throw Object.assign(new Error('invalid scopes'), {
        code: 'API_KEY_SCOPES_INVALID',
      });
    }

    const secret = randomBytes(32).toString('hex');
    const keyPrefix = secret.slice(0, PUBLIC_API_LIMITS.keyPrefixLength);
    const keyHash = this.hashKey(secret);

    const created = await this.prisma.apiKey.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        keyPrefix,
        keyHash,
        scopes,
        expiresAt: input.expiresAt ?? null,
      },
    });

    this.logger.log({
      event: 'public_api.key.created',
      outcome: 'created',
      apiKeyId: created.id,
    });
    return { id: created.id, keyPrefix, plaintext: secret };
  }

  /** Constant-time-ish lookup by prefix then hash comparison. */
  async authenticate(
    presentedKey: string,
  ): Promise<{ tenantId: string; scopes: string[] } | null> {
    if (typeof presentedKey !== 'string' || presentedKey.length < 16) {
      return null;
    }
    const keyPrefix = presentedKey.slice(0, PUBLIC_API_LIMITS.keyPrefixLength);
    const record = await this.prisma.apiKey.findUnique({
      where: { keyPrefix },
    });
    if (!record || record.status !== ApiKeyStatus.ACTIVE) return null;
    if (record.expiresAt && record.expiresAt < new Date()) return null;

    const presentedHash = this.hashKey(presentedKey);
    if (presentedHash.length !== record.keyHash.length) return null;
    let mismatch = 0;
    for (let i = 0; i < record.keyHash.length; i += 1) {
      mismatch |= presentedHash.charCodeAt(i) ^ record.keyHash.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    await this.prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });
    return { tenantId: record.tenantId, scopes: record.scopes as string[] };
  }

  async revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id: apiKeyId, tenantId, status: ApiKeyStatus.ACTIVE },
      data: { status: ApiKeyStatus.REVOKED },
    });
  }

  signWebhookPayload(signingSecret: string, payload: unknown): string {
    return createHmac('sha256', signingSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }
}
