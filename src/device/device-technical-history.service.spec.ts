import { DeviceTechnicalHistoryService } from './device-technical-history.service';

describe('DeviceTechnicalHistoryService', () => {
  it('keeps current firmware/protocol unavailable and maps only device-targeted rollout evidence', async () => {
    const prisma: any = {
      device: { findFirst: jest.fn().mockResolvedValue({ id: 'd1', type: 'ACTUATOR' }) },
      otaRollout: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1', status: 'COMPLETED', targetDeviceIds: ['d1'],
            completedDeviceIds: ['d1'], failedDeviceIds: [],
            createdAt: new Date('2026-09-13T00:00:00Z'), updatedAt: new Date('2026-09-13T01:00:00Z'),
            firmware: { id: 'f1', version: '1.2.3', sha256: 'a'.repeat(64), sizeBytes: 1234n, releaseNotes: null, createdAt: new Date('2026-09-12T00:00:00Z') },
          },
          {
            id: 'r2', status: 'COMPLETED', targetDeviceIds: ['d2'],
            completedDeviceIds: ['d2'], failedDeviceIds: [],
            createdAt: new Date(), updatedAt: new Date(),
            firmware: { id: 'f2', version: '9.9.9', sha256: 'b'.repeat(64), sizeBytes: 1n, releaseNotes: null, createdAt: new Date() },
          },
        ]),
      },
      analyticsFinding: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DeviceTechnicalHistoryService(prisma);
    const result = await service.read('t1', 'd1');

    expect(result?.firmware.availability).toBe('UNAVAILABLE_BY_CONTRACT');
    expect(result?.protocol.availability).toBe('UNAVAILABLE_BY_CONTRACT');
    expect(result?.updateHistory).toHaveLength(1);
    expect(result?.updateHistory[0]).toMatchObject({
      evidenceState: 'COMPLETED_RECORDED',
      physicalInstallProven: false,
      artifactBytesVerifiedByPlatform: false,
    });
  });

  it('returns null if the tenant-scoped device is absent', async () => {
    const prisma: any = {
      device: { findFirst: jest.fn().mockResolvedValue(null) },
      otaRollout: { findMany: jest.fn().mockResolvedValue([]) },
      analyticsFinding: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DeviceTechnicalHistoryService(prisma);
    await expect(service.read('t1', 'foreign')).resolves.toBeNull();
  });
});
