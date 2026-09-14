import { Injectable, Logger } from '@nestjs/common';

export const OTA_LIMITS = {
  maxVersionLength: 64,
  maxUrlLength: 512,
  maxTargetDevices: 500,
  sha256Pattern: /^[0-9a-f]{64}$/,
} as const;

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

export type OtaDomainErrorCode =
  | 'OTA_VERSION_INVALID'
  | 'OTA_URL_INVALID'
  | 'OTA_SHA256_INVALID'
  | 'OTA_SIZE_INVALID'
  | 'OTA_MODELS_INVALID'
  | 'OTA_TARGETS_INVALID'
  | 'OTA_STATUS_TRANSITION_INVALID';

/** Forward-only rollout state machine. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['IN_PROGRESS', 'ROLLED_BACK'],
  IN_PROGRESS: ['COMPLETED', 'ROLLED_BACK'],
  COMPLETED: [],
  ROLLED_BACK: [],
};

export class OtaDomainError extends Error {
  constructor(
    public readonly code: OtaDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OtaDomainError';
  }
}

/**
 * Module 15 Slice 15.1 — OTA metadata validation and forward-only rollout
 * state machine. Artifacts are URL + SHA-256 references; no binary storage.
 */
@Injectable()
export class OtaDomainValidator {
  private readonly logger = new Logger(OtaDomainValidator.name);

  validateArtifact(input: {
    version?: unknown;
    artifactUrl?: unknown;
    sha256?: unknown;
    sizeBytes?: unknown;
    compatibleModels?: unknown;
  }): { version: string; artifactUrl: string; sha256: string; sizeBytes: number } {
    const version =
      typeof input.version === 'string' ? input.version.trim() : '';
    if (!version || !VERSION_PATTERN.test(version)) {
      throw new OtaDomainError(
        'OTA_VERSION_INVALID',
        `version must match ${VERSION_PATTERN.source}`,
      );
    }

    const artifactUrl =
      typeof input.artifactUrl === 'string' ? input.artifactUrl.trim() : '';
    if (
      !artifactUrl ||
      artifactUrl.length > OTA_LIMITS.maxUrlLength ||
      !/^https:\/\/.+/.test(artifactUrl)
    ) {
      throw new OtaDomainError(
        'OTA_URL_INVALID',
        'artifactUrl must be an https URL',
      );
    }

    const sha256 = typeof input.sha256 === 'string' ? input.sha256 : '';
    if (!OTA_LIMITS.sha256Pattern.test(sha256)) {
      throw new OtaDomainError(
        'OTA_SHA256_INVALID',
        'sha256 must be a lowercase 64-hex digest',
      );
    }

    const sizeBytes = input.sizeBytes;
    if (
      typeof sizeBytes !== 'number' ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      throw new OtaDomainError('OTA_SIZE_INVALID', 'sizeBytes must be positive');
    }

    const models = input.compatibleModels;
    if (
      !Array.isArray(models) ||
      models.length === 0 ||
      !models.every((m) => typeof m === 'string' && m.length <= 64)
    ) {
      throw new OtaDomainError(
        'OTA_MODELS_INVALID',
        'compatibleModels must be a non-empty array of model strings',
      );
    }

    return { version, artifactUrl, sha256, sizeBytes };
  }

  validateTargets(deviceIds: unknown): string[] {
    if (
      !Array.isArray(deviceIds) ||
      deviceIds.length === 0 ||
      deviceIds.length > OTA_LIMITS.maxTargetDevices ||
      !deviceIds.every((d) => typeof d === 'string')
    ) {
      throw new OtaDomainError(
        'OTA_TARGETS_INVALID',
        `targetDeviceIds must be 1..${OTA_LIMITS.maxTargetDevices} strings`,
      );
    }
    return deviceIds;
  }

  assertTransition(from: string, to: string): void {
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new OtaDomainError(
        'OTA_STATUS_TRANSITION_INVALID',
        `illegal rollout transition ${from} -> ${to}`,
      );
    }
    this.logger.log({
      event: 'ota.rollout.transition_validated',
      outcome: 'allowed',
      from,
      to,
    });
  }
}
