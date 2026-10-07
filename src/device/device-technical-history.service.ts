import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ROLLOUT_SCAN = 100;
const MAX_UPDATE_HISTORY = 20;
const MAX_FINDING_HISTORY = 20;

export type DeviceUpdateEvidenceState =
  | 'COMPLETED_RECORDED'
  | 'FAILED_RECORDED'
  | 'TARGETED_NO_DEVICE_RESULT';

/**
 * Blueprint Device Detail technical evidence read model.
 *
 * Firmware and protocol come only from authenticated device heartbeat reports.
 * Missing reports remain unavailable; rollout metadata never proves installation.
 */
@Injectable()
export class DeviceTechnicalHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async read(tenantId: string, deviceId: string) {
    const [device, rolloutRows, findings] = await Promise.all([
      this.prisma.device.findFirst({
        where: { id: deviceId, tenantId },
        select: { id: true, type: true, reportedFirmwareVersion: true, reportedProtocol: true, runtimeReportedAt: true },
      }),
      this.prisma.otaRollout.findMany({
        where: { tenantId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: MAX_ROLLOUT_SCAN,
        include: {
          firmware: {
            select: {
              id: true,
              version: true,
              sha256: true,
              sizeBytes: true,
              releaseNotes: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.analyticsFinding.findMany({
        where: { tenantId, deviceId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_FINDING_HISTORY,
        select: {
          id: true,
          capabilityKey: true,
          kind: true,
          severity: true,
          summary: true,
          confidence: true,
          detectorVersion: true,
          evidenceTelemetryId: true,
          createdAt: true,
        },
      }),
    ]);

    if (!device) {
      // DeviceAccessGuard should make this unreachable for HTTP callers, but
      // keeping service output fail-closed prevents accidental cross-tenant use.
      return null;
    }

    const matchingRollouts = rolloutRows
      .filter((rollout) => includesDeviceId(rollout.targetDeviceIds, deviceId))
      .slice(0, MAX_UPDATE_HISTORY);

    return {
      deviceId,
      deviceType: device.type,
      firmware: {
        currentVersion: device.reportedFirmwareVersion ?? null,
        reportedAt: device.runtimeReportedAt ?? null,
        availability: device.reportedFirmwareVersion ? 'DEVICE_REPORTED' : 'UNAVAILABLE_BY_CONTRACT',
        reason:
          'Versi hanya berasal dari laporan heartbeat terautentikasi; bukan bukti instalasi fisik atau metadata rollout.',
      },
      protocol: {
        name: device.reportedProtocol ?? null,
        reportedAt: device.runtimeReportedAt ?? null,
        availability: device.reportedProtocol ? 'DEVICE_REPORTED' : 'UNAVAILABLE_BY_CONTRACT',
        reason:
          'Protocol hanya berasal dari laporan heartbeat terautentikasi; tidak ditebak dari tipe perangkat.',
      },
      updateHistory: matchingRollouts.map((rollout) => {
        const completed = includesDeviceId(rollout.completedDeviceIds, deviceId);
        const failed = includesDeviceId(rollout.failedDeviceIds, deviceId);
        const evidenceState: DeviceUpdateEvidenceState = failed
          ? 'FAILED_RECORDED'
          : completed
            ? 'COMPLETED_RECORDED'
            : 'TARGETED_NO_DEVICE_RESULT';

        return {
          rolloutId: rollout.id,
          rolloutStatus: rollout.status,
          evidenceState,
          firmware: {
            id: rollout.firmware.id,
            version: rollout.firmware.version,
            sha256Metadata: rollout.firmware.sha256,
            sizeBytes: rollout.firmware.sizeBytes.toString(),
            releaseNotes: rollout.firmware.releaseNotes,
            createdAt: rollout.firmware.createdAt,
          },
          targeted: true,
          completedRecorded: completed,
          failedRecorded: failed,
          artifactBytesVerifiedByPlatform: false,
          physicalInstallProven: false,
          createdAt: rollout.createdAt,
          updatedAt: rollout.updatedAt,
        };
      }),
      updateHistoryBounded: true,
      updateHistoryLimit: MAX_UPDATE_HISTORY,
      rolloutScanLimit: MAX_ROLLOUT_SCAN,
      rolloutScanSaturated: rolloutRows.length === MAX_ROLLOUT_SCAN,
      analyticsFindings: findings,
      analyticsFindingLimit: MAX_FINDING_HISTORY,
      alertDeliveryHistory: {
        available: false,
        reason:
          'Module 16 analytics findings tersedia, tetapi riwayat delivery notifikasi/alert end-user belum menjadi bukti yang sama.',
      },
    };
  }
}

function includesDeviceId(value: unknown, deviceId: string): boolean {
  return Array.isArray(value) && value.some((entry) => entry === deviceId);
}
