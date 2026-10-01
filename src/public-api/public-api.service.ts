import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ApiKeyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainNotFoundException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

export const PUBLIC_API_LIMITS = {
  keyPrefixLength: 12,
  maxNameLength: 120,
  maxScopes: 4,
} as const;

/**
 * Outcome of a revocation. `alreadyRevoked` is true when the key was already REVOKED, which is
 * how the caller keeps its idempotent "sudah dicabut" answer without a second query.
 */
export interface ApiKeyRevocation {
  id: string;
  status: ApiKeyStatus;
  alreadyRevoked: boolean;
}

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

  /**
   * Revoke a key that belongs to `tenantId`.
   *
   * Both the lookup and the write are scoped by tenant. The write is an `updateMany` because
   * Prisma's `update` only accepts unique fields, and `id` alone would drop the tenant from
   * the write — a revocation that reads scoped and writes unscoped is a cross-tenant hazard
   * that happens to be safe today only because `ApiKey.tenantId` is immutable.
   *
   * The scope difference between this and {@link revokeApiKeyAsPlatform} is a property of the
   * caller's authority, so it is two named methods rather than one with an optional tenant.
   */
  async revokeApiKey(tenantId: string, apiKeyId: string): Promise<ApiKeyRevocation> {
    return this.revokeWithin({ id: apiKeyId, tenantId });
  }

  /**
   * Revoke any key regardless of tenant.
   *
   * Only for a caller that is already authorised at platform level — the route behind this is
   * guarded by `PlatformRoleGuard`. Named separately so an unscoped write is always visible
   * at the call site.
   */
  async revokeApiKeyAsPlatform(apiKeyId: string): Promise<ApiKeyRevocation> {
    return this.revokeWithin({ id: apiKeyId });
  }

  private async revokeWithin(scope: { id: string; tenantId?: string }): Promise<ApiKeyRevocation> {
    const existing = await this.prisma.apiKey.findFirst({
      where: scope,
      select: { id: true, status: true },
    });
    if (!existing) {
      // A real `HttpException`, not `Object.assign(new Error(msg), { code })`. The exception
      // filter only translates `HttpException` subclasses and falls back to 500, so a plain
      // error with a `code` property would turn "key not found" into a server fault.
      throw new DomainNotFoundException(ERROR_CODES.NotFound, 'API key tidak ditemukan');
    }
    if (existing.status === ApiKeyStatus.REVOKED) {
      return { id: scope.id, status: ApiKeyStatus.REVOKED, alreadyRevoked: true };
    }
    const { count } = await this.prisma.apiKey.updateMany({
      where: { ...scope, status: ApiKeyStatus.ACTIVE },
      data: { status: ApiKeyStatus.REVOKED },
    });
    return { id: scope.id, status: ApiKeyStatus.REVOKED, alreadyRevoked: count === 0 };
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
