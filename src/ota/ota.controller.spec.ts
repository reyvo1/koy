import { OtaRolloutStatus } from '@prisma/client';
import { OtaController } from './ota.controller';
import { RbacAuditService } from '../rbac/rbac-audit.service';
import { OtaRolloutRepository } from './ota-rollout.repository';

/**
 * These tests protect the part the repository spec cannot see: that an operator's refusal
 * reaches the client as its real status, and that the tenant is taken from verified context
 * rather than from anything the caller supplied.
 *
 * The failure being guarded is specific. `GlobalExceptionFilter` maps only HttpException, so
 * an untranslated refusal arrives as 500 — telling an operator the platform is broken when
 * the real problem is a lowercase sha256 or a state machine edge that does not exist.
 */
const TENANT = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP = '22222222-2222-4222-8222-222222222222';
const CTX = {
  user: {
    userId: 'user-1',
    tenantContext: { tenantId: TENANT, membershipId: MEMBERSHIP, role: 'ADMIN' },
  },
};

const ARTIFACT_DTO = {
  version: '2.0.0',
  artifactUrl: 'https://ota.example.com/fw.bin',
  sha256: 'a'.repeat(64),
  sizeBytes: 1024,
  compatibleModels: ['ESP32-V1'],
};

function makeRepo(over: Partial<Record<keyof OtaRolloutRepository, jest.Mock>> = {}) {
  return {
    createArtifact: jest.fn().mockResolvedValue({
      id: 'fw-1',
      version: '2.0.0',
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      compatibleModels: ['ESP32-V1'],
      createdAt: new Date('2026-09-30T00:00:00Z'),
    }),
    createRollout: jest.fn().mockResolvedValue({
      id: 'ro-1',
      firmwareId: 'fw-1',
      status: 'DRAFT',
      targetDeviceIds: ['d1', 'd2'],
    }),
    transition: jest.fn().mockResolvedValue(undefined),
    recordProgress: jest.fn().mockResolvedValue({
      completedCount: 1,
      failedCount: 1,
      done: true,
      status: OtaRolloutStatus.ROLLED_BACK,
    }),
    findRollout: jest.fn().mockResolvedValue(null),
    ...over,
  } as unknown as OtaRolloutRepository;
}

const makeAudit = () => ({ recordMutation: jest.fn() }) as unknown as RbacAuditService;

describe('OtaController', () => {
  it('takes the tenant from verified context, not from the body', async () => {
    const repo = makeRepo();
    await new OtaController(repo, makeAudit()).createArtifact(CTX, {
      ...ARTIFACT_DTO,
      // A caller-supplied tenant must be ignored even if the DTO would let it through.
      tenantId: '99999999-9999-4999-8999-999999999999',
    } as any);

    expect(repo.createArtifact).toHaveBeenCalledWith(
      TENANT,
      expect.objectContaining({ version: '2.0.0' }),
    );
  });

  it('creates a rollout scoped to the caller tenant', async () => {
    const repo = makeRepo();
    const result = await new OtaController(repo, makeAudit()).createRollout(CTX, {
      firmwareId: 'fw-1',
      targetDeviceIds: ['d1', 'd2'],
    });

    expect(repo.createRollout).toHaveBeenCalledWith({
      tenantId: TENANT,
      firmwareId: 'fw-1',
      targetDeviceIds: ['d1', 'd2'],
    });
    expect(result).toEqual({ id: 'ro-1', firmwareId: 'fw-1', status: 'DRAFT', targetCount: 2 });
  });

  it('records an audit row for every rollout mutation', async () => {
    const audit = makeAudit();
    await new OtaController(makeRepo(), audit).createRollout(CTX, {
      firmwareId: 'fw-1',
      targetDeviceIds: ['d1'],
    });

    expect(audit.recordMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        membershipId: MEMBERSHIP,
        resourceType: 'ota',
        resourceId: 'ro-1',
        action: 'CREATE',
      }),
    );
  });

  it('surfaces a rolled-back rollout as ROLLED_BACK, never as a clean completion', async () => {
    const repo = makeRepo();
    const result = await new OtaController(repo, makeAudit()).recordProgress(
      CTX,
      'ro-1',
      { succeededDeviceIds: ['d1'], failedDeviceIds: ['d2'] },
    );

    expect(result).toEqual({
      id: 'ro-1',
      completedCount: 1,
      failedCount: 1,
      done: true,
      status: OtaRolloutStatus.ROLLED_BACK,
    });
  });

  it('reports a rollout from another tenant as 404, not 403', async () => {
    // findRollout pins tenantId, so another tenant's rollout is absent rather than
    // forbidden. A 403 would confirm the id exists somewhere.
    const repo = makeRepo();
    await expect(
      new OtaController(repo, makeAudit()).read(CTX, 'ro-foreign'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it.each([
    ['OTA_SHA256_INVALID', 400],
    ['OTA_VERSION_INVALID', 400],
    ['OTA_URL_INVALID', 400],
    ['OTA_SIZE_INVALID', 400],
    ['OTA_MODELS_INVALID', 400],
    ['OTA_TARGETS_INVALID', 400],
    ['OTA_INVALID_IDENTITY', 400],
    ['OTA_STATUS_TRANSITION_INVALID', 409],
    ['OTA_TRANSITION_CONFLICT', 409],
    ['OTA_ROLLOUT_NOT_IN_PROGRESS', 409],
    ['OTA_ROLLOUT_NOT_FOUND', 404],
  ])('translates %s to HTTP %i rather than 500', async (code, status) => {
    const repo = makeRepo({
      createArtifact: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { code })),
    });

    const error = await new OtaController(repo, makeAudit())
      .createArtifact(CTX, ARTIFACT_DTO)
      .catch((e) => e);

    expect(error).toMatchObject({ status, response: { code } });
  });

  it('leaves a non-OTA failure untouched rather than mislabelling it', async () => {
    const repo = makeRepo({
      createArtifact: jest.fn().mockRejectedValue(new Error('connection reset')),
    });

    await expect(
      new OtaController(repo, makeAudit()).createArtifact(CTX, ARTIFACT_DTO),
    ).rejects.toThrow('connection reset');
  });
});
