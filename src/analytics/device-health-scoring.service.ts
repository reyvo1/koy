import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 11 — device health scoring.
 *
 * `Device.status` and `lastHeartbeatAt` already answer "is it switched on". They do not answer "is it
 * working". A device reporting every thirty seconds with readings far outside its own history is
 * reporting faithfully and is still broken, and `ACTIVE` hides that completely. This scores the second
 * question, from the same authoritative rows the rest of the platform already stores.
 *
 * Two properties matter more than the arithmetic itself.
 *
 * First, explainability. A bare number is not actionable: an operator shown "62" has no basis for acting
 * and no way to see whether it moved for a reason. So every component is returned with its own weight and
 * its own deduction, and the total is the sum of those, not an independent number that merely resembles
 * them.
 *
 * Second, honesty about silence. A device that has stopped reporting has not scored badly, it has stopped
 * producing evidence, and averaging that into a percentage would understate it. Silence gets its own band.
 *
 * Nothing here estimates a probability it cannot support. There is no trained model and no learned
 * weighting; the weights are fixed, published and versioned so a stored score can be re-derived later.
 */
@Injectable()
export class DeviceHealthScoringService {
  private readonly log = new Logger(DeviceHealthScoringService.name);

  /**
   * Pinned alongside the score. Without it, a score stored last month cannot be distinguished from one
   * computed by different arithmetic, and the two are not comparable.
   */
  static readonly SCORER_VERSION = 'component-health/1.0.0';

  /**
   * The published weights. They sum to 100, so a device with no problems and a fresh heartbeat scores
   * exactly 100, and every deduction below is a real number of points rather than a scale factor.
   */
  static readonly WEIGHTS = {
    heartbeat: 40,
    anomalies: 50,
    commandFailures: 10,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score one device and persist the result.
   *
   * `now` is supplied by the caller rather than read from the clock so that "silent for eleven minutes"
   * is a statement the test suite can actually make, and so a replay scores identically.
   */
  async score(options: {
    tenantId: string;
    deviceId: string;
    now?: Date;
    offlineAfterMs?: number;
    findingWindowMs?: number;
  }): Promise<DeviceHealthResult> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: health scoring must never run unscoped');
    }
    const now = options.now ?? new Date();
    const offlineAfterMs = options.offlineAfterMs ?? 15 * 60 * 1000;
    const findingWindowMs = options.findingWindowMs ?? 24 * 60 * 60 * 1000;

    if (!Number.isFinite(offlineAfterMs) || offlineAfterMs <= 0) {
      throw new RangeError('offlineAfterMs must be a positive number');
    }
    if (!Number.isFinite(findingWindowMs) || findingWindowMs <= 0) {
      throw new RangeError('findingWindowMs must be a positive number');
    }

    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true, lastHeartbeatAt: true, status: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    const since = new Date(now.getTime() - findingWindowMs);

    // Bounded on both axes: a device with a very long history, and a tenant with a very large number of
    // findings, must not make this loop grow without limit.
    const findings = await this.prisma.analyticsFinding.findMany({
      where: { tenantId: options.tenantId, deviceId: options.deviceId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { severity: true },
    });

    const silenceMs = device.lastHeartbeatAt ? now.getTime() - device.lastHeartbeatAt.getTime() : Infinity;

    // Silence is not a low score, it is the absence of evidence. Scored as a percentage it would average
    // in with everything else and understate a device nobody can hear from.
    if (silenceMs > offlineAfterMs) {
      const result: DeviceHealthResult = {
        deviceId: options.deviceId,
        tenantId: options.tenantId,
        score: 0,
        status: 'OFFLINE',
        scoredAt: now,
        scorerVersion: DeviceHealthScoringService.SCORER_VERSION,
        components: [
          {
            name: 'heartbeat',
            weight: DeviceHealthScoringService.WEIGHTS.heartbeat,
            deduction: DeviceHealthScoringService.WEIGHTS.heartbeat,
            detail: device.lastHeartbeatAt
              ? `silent for ${Math.round(silenceMs / 1000)}s`
              : 'never reported a heartbeat',
          },
        ],
      };
      await this.persist(result);
      return result;
    }

    const critical = findings.filter((finding) => finding.severity === 'CRITICAL').length;
    const warning = findings.filter((finding) => finding.severity === 'WARNING').length;
    const info = findings.filter((finding) => finding.severity === 'INFO').length;

    // Each severity costs a fixed fraction of its component's weight, and the fractions rise steeply:
    // one critical reading out of context matters far more than a page of informational ones. The step is
    // applied per finding so a device cannot hide a crisis behind a single capped deduction.
    const anomalyDeduction = Math.min(
      DeviceHealthScoringService.WEIGHTS.anomalies,
      critical * 25 + warning * 8 + info * 2,
    );

    // A heartbeat that is present but nearly expired is not the same as a fresh one.
    const heartbeatRatio = Number.isFinite(silenceMs) ? silenceMs / offlineAfterMs : 1;
    const heartbeatDeduction = Math.min(
      DeviceHealthScoringService.WEIGHTS.heartbeat,
      Math.round(heartbeatRatio * DeviceHealthScoringService.WEIGHTS.heartbeat),
    );

    const commandFailures = await this.countFailedCommands(options.tenantId, options.deviceId, since);
    const commandDeduction = Math.min(
      DeviceHealthScoringService.WEIGHTS.commandFailures,
      commandFailures * 5,
    );

    const total = [heartbeatDeduction, anomalyDeduction, commandDeduction].reduce((sum, value) => sum + value, 0);
    const score = Math.max(0, Math.min(100, 100 - total));

    const result: DeviceHealthResult = {
      deviceId: options.deviceId,
      tenantId: options.tenantId,
      score,
      status: bandFor(score),
      scoredAt: now,
      scorerVersion: DeviceHealthScoringService.SCORER_VERSION,
      components: [
        {
          name: 'heartbeat',
          weight: DeviceHealthScoringService.WEIGHTS.heartbeat,
          deduction: heartbeatDeduction,
          detail: device.lastHeartbeatAt
            ? `last heartbeat ${Math.round(silenceMs / 1000)}s ago`
            : 'never reported a heartbeat',
        },
        {
          name: 'anomalies',
          weight: DeviceHealthScoringService.WEIGHTS.anomalies,
          deduction: anomalyDeduction,
          detail: `${critical} critical, ${warning} warning, ${info} info`,
        },
        {
          name: 'commandFailures',
          weight: DeviceHealthScoringService.WEIGHTS.commandFailures,
          deduction: commandDeduction,
          detail: `${commandFailures} failed command(s)`,
        },
      ],
    };

    await this.persist(result);
    return result;
  }

  private async countFailedCommands(tenantId: string, deviceId: string, since: Date): Promise<number> {
    return this.prisma.deviceCommand.count({
      where: { tenantId, deviceId, status: 'FAILED', createdAt: { gte: since } },
    });
  }

  private async persist(result: DeviceHealthResult): Promise<void> {
    await this.prisma.device.update({
      where: { id: result.deviceId },
      data: {
        healthScore: result.score,
        healthStatus: result.status,
        healthEvaluatedAt: result.scoredAt,
        healthScorerVersion: result.scorerVersion,
      },
    });
    this.log.log(
      `${result.deviceId} scored ${result.score} (${result.status}): ${result.components
        .map((component) => `${component.name} -${component.deduction}`)
        .join(', ')}`,
    );
  }
}

export interface HealthComponent {
  name: string;
  weight: number;
  deduction: number;
  detail: string;
}

export interface DeviceHealthResult {
  deviceId: string;
  tenantId: string;
  score: number;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'OFFLINE';
  scoredAt: Date;
  scorerVersion: string;
  components: HealthComponent[];
}

function bandFor(score: number): 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' {
  if (score >= 80) {
    return 'HEALTHY';
  }
  if (score >= 50) {
    return 'DEGRADED';
  }
  return 'UNHEALTHY';
}