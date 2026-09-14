import { describe, it, expect } from '@jest/globals';
import { OtaDomainError, OtaDomainValidator } from './ota-domain.validator';

describe('OtaDomainValidator', () => {
function thrownCode(fn: () => unknown): string {
  try {
    fn();
    return '';
  } catch (e) {
    return e instanceof OtaDomainError ? e.code : `unexpected:${String(e)}`;
  }
}

  const validator = new OtaDomainValidator();

  const validArtifact = {
    version: '1.2.3',
    artifactUrl: 'https://ota.example.com/fw-1.2.3.bin',
    sha256: 'a'.repeat(64),
    sizeBytes: 1048576,
    compatibleModels: ['ESP32-DEVKIT-V1'],
  };

  it('accepts a valid artifact', () => {
    expect(validator.validateArtifact(validArtifact)).toEqual({
      version: '1.2.3',
      artifactUrl: validArtifact.artifactUrl,
      sha256: validArtifact.sha256,
      sizeBytes: 1048576,
    });
  });

  it('rejects bad versions, urls, digests, sizes, models', () => {
    expect(
      thrownCode(() =>
        validator.validateArtifact({ ...validArtifact, version: '#bad' }),
      ),
    ).toBe('OTA_VERSION_INVALID');
    expect(
      thrownCode(() =>
        validator.validateArtifact({
          ...validArtifact,
          artifactUrl: 'http://insecure.example.com/fw.bin',
        }),
      ),
    ).toBe('OTA_URL_INVALID');
    expect(
      thrownCode(() =>
        validator.validateArtifact({ ...validArtifact, sha256: 'xyz' }),
      ),
    ).toBe('OTA_SHA256_INVALID');
    expect(
      thrownCode(() =>
        validator.validateArtifact({ ...validArtifact, sizeBytes: -5 }),
      ),
    ).toBe('OTA_SIZE_INVALID');
    expect(
      thrownCode(() =>
        validator.validateArtifact({ ...validArtifact, compatibleModels: [] }),
      ),
    ).toBe('OTA_MODELS_INVALID');
  });

  it('rejects invalid target lists', () => {
    expect(thrownCode(() => validator.validateTargets([]))).toBe(
      'OTA_TARGETS_INVALID',
    );
    expect(
      thrownCode(() =>
        validator.validateTargets(Array.from({ length: 501 }, (_, i) => `d${i}`)),
      ),
    ).toBe('OTA_TARGETS_INVALID');
    expect(validator.validateTargets(['d1', 'd2'])).toEqual(['d1', 'd2']);
  });

  it('enforces the forward-only rollout state machine', () => {
    expect(() => validator.assertTransition('DRAFT', 'PUBLISHED')).not.toThrow();
    expect(() =>
      validator.assertTransition('PUBLISHED', 'IN_PROGRESS'),
    ).not.toThrow();
    expect(() => validator.assertTransition('IN_PROGRESS', 'COMPLETED')).not.toThrow();
    expect(() =>
      validator.assertTransition('IN_PROGRESS', 'ROLLED_BACK'),
    ).not.toThrow();
    expect(
      thrownCode(() => validator.assertTransition('DRAFT', 'COMPLETED')),
    ).toBe('OTA_STATUS_TRANSITION_INVALID');
    expect(
      thrownCode(() => validator.assertTransition('COMPLETED', 'PUBLISHED')),
    ).toBe('OTA_STATUS_TRANSITION_INVALID');
  });
});
