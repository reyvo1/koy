import { PrismaService } from '../prisma/prisma.service';
import { OtaDomainValidator } from './ota-domain.validator';
import { OtaRolloutRepository } from './ota-rollout.repository';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const firmwareId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ownedDevice = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const foreignDevice = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/**
 * A rollout may only target devices that belong to the caller's tenant.
 *
 * The repository used to store whatever device ids the request supplied, so a tenant admin
 * could name any id in the system and the row would assert that a foreign device was being
 * updated. Nothing downstream re-checks: `recordProgress` merges by id, so the rollout reads
 * back as legitimate fleet activity for a fleet the caller does not own. Tenant isolation is
 * the product here, so the target set is resolved against the database.
 */
describe('OtaRolloutRepository — rollout targets are tenant-owned', () => {
  let create: jest.Mock;
  let deviceFindMany: jest.Mock;
  let repo: OtaRolloutRepository;

  const owned = (ids: string[]) =>
    deviceFindMany.mockResolvedValue(ids.map((id) => ({ id })));

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'ro-1' });
    deviceFindMany = jest.fn().mockResolvedValue([]);
    repo = new OtaRolloutRepository(
      {
        device: { findMany: deviceFindMany },
        otaRollout: { create },
      } as unknown as PrismaService,
      new OtaDomainValidator(),
    );
  });

  it('resolves targets scoped to the tenant rather than trusting the body', async () => {
    owned([ownedDevice]);
    await repo.createRollout({
      tenantId,
      firmwareId,
      targetDeviceIds: [ownedDevice],
    });

    expect(deviceFindMany).toHaveBeenCalledWith({
      where: { tenantId, id: { in: [ownedDevice] } },
      select: { id: true },
    });
  });

  it('refuses a target that is not in this tenant, and writes nothing', async () => {
    owned([ownedDevice]);

    await expect(
      repo.createRollout({
        tenantId,
        firmwareId,
        targetDeviceIds: [ownedDevice, foreignDevice],
      }),
    ).rejects.toMatchObject({ code: 'OTA_TARGETS_NOT_IN_TENANT' });

    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a target set where every device is foreign', async () => {
    owned([]);

    await expect(
      repo.createRollout({ tenantId, firmwareId, targetDeviceIds: [foreignDevice] }),
    ).rejects.toMatchObject({ code: 'OTA_TARGETS_NOT_IN_TENANT' });
    expect(create).not.toHaveBeenCalled();
  });

  it('still creates the rollout when every target is owned', async () => {
    owned([ownedDevice]);
    await repo.createRollout({ tenantId, firmwareId, targetDeviceIds: [ownedDevice] });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          targetDeviceIds: [ownedDevice],
          status: 'DRAFT',
        }),
      }),
    );
  });
});

/**
 * `FirmwareArtifact` is unique on (tenantId, version), so a repeated version is a client
 * mistake. Prisma raises it as P2002, which `GlobalExceptionFilter` does not recognise, so
 * the operator saw 500 INTERNAL_ERROR for something they can fix — and a 500 invites a
 * retry, which is the wrong advice for a conflict.
 */
describe('OtaRolloutRepository — a version is registered once per tenant', () => {
  const artifact = {
    version: '2.0.0',
    artifactUrl: 'https://ota.example.com/fw.bin',
    sha256: 'a'.repeat(64),
    sizeBytes: 1024,
    compatibleModels: ['ESP32-V1'],
  };

  const build = (existing: Array<{ id: string }>) =>
    new OtaRolloutRepository(
      {
        firmwareArtifact: {
          findFirst: jest.fn().mockResolvedValue(existing[0] ?? null),
          create: jest.fn(),
        },
      } as unknown as PrismaService,
      new OtaDomainValidator(),
    );

  it('refuses a version that already exists in this tenant', async () => {
    const repo = build([{ id: 'fw-existing' }]);
    await expect(repo.createArtifact(tenantId, artifact)).rejects.toMatchObject({
      code: 'OTA_VERSION_ALREADY_EXISTS',
    });
  });

  it('writes nothing when the version is refused', async () => {
    const repo = build([{ id: 'fw-existing' }]);
    const inner = (repo as unknown as { prisma: { firmwareArtifact: { create: jest.Mock } } })
      .prisma.firmwareArtifact.create;
    await repo.createArtifact(tenantId, artifact).catch(() => undefined);
    expect(inner).not.toHaveBeenCalled();
  });

  it('checks the conflict against the tenant, not globally', async () => {
    const repo = build([]);
    const findFirst = (
      repo as unknown as { prisma: { firmwareArtifact: { findFirst: jest.Mock } } }
    ).prisma.firmwareArtifact.findFirst;
    (repo as unknown as { prisma: { firmwareArtifact: { create: jest.Mock } } }).prisma.firmwareArtifact.create = jest
      .fn()
      .mockResolvedValue({ id: 'fw-new' });

    await repo.createArtifact(tenantId, artifact);

    expect(findFirst).toHaveBeenCalledWith({
      where: { tenantId, version: '2.0.0' },
      select: { id: true },
    });
  });
});
