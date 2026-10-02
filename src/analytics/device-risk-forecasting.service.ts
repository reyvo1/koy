import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Wave 11 — maintenance risk forecasting.
 *
 * `DeviceMaintenance` records that work was opened and resolved; the health scorer grades a device right
 * now. Neither answers what an operator has to plan against: is this getting worse, and how long have I got.
 *
 * This deliberately does not produce a probability. There is no labelled history of devices that actually
 * failed, so any percentage would be invented while reading as measured -- and a number like "0.73" gets
 * quoted into a report as a fact. What it produces instead is a band, a horizon in days, and the evidence
 * behind both, and it refuses to band a device whose signals cannot support one.
 *
 * The trend is the signal, not the count. A device that has always dropped commands is a standing
 * condition; a device whose drop rate is climbing is a device in trouble. Only comparing a recent window
 * against an earlier one tells those apart.
 */
@Injectable()
export class DeviceRiskForecastingService {
  private readonly log = new Logger(DeviceRiskForecastingService.name);

  /** Pinned so a stored band can be re-derived after the thresholds change. */
  static readonly FORECAST_VERSION = 'trend-band/1.0.0';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Forecast one device's maintenance risk.
   *
   * `now` is a parameter so the window boundaries are reproducible and testable, not a reading of the clock
   * hidden inside the arithmetic.
   */
  async forecast(options: {
    tenantId: string;
    deviceId: string;
    now?: Date;
    recentWindowMs?: number;
    priorWindowMs?: number;
    minCommands?: number;
  }): Promise<RiskForecastResult> {
    if (!options.tenantId) {
      throw new RangeError('tenantId is required: risk forecasting must never run unscoped');
    }

    const now = options.now ?? new Date();
    const recentWindowMs = options.recentWindowMs ?? 24 * 60 * 60 * 1000;
    const priorWindowMs = options.priorWindowMs ?? 7 * 24 * 60 * 60 * 1000;
    const minCommands = options.minCommands ?? 5;

    if (!Number.isFinite(recentWindowMs) || recentWindowMs <= 0) {
      throw new RangeError('recentWindowMs must be a positive number');
    }
    if (!Number.isFinite(priorWindowMs) || priorWindowMs <= 0) {
      throw new RangeError('priorWindowMs must be a positive number');
    }
    if (!Number.isFinite(minCommands) || minCommands <= 0) {
      throw new RangeError('minCommands must be a positive number');
    }

    const recentSince = new Date(now.getTime() - recentWindowMs);
    const priorSince = new Date(now.getTime() - priorWindowMs - recentWindowMs);

    const device = await this.prisma.device.findFirst({
      where: { id: options.deviceId, tenantId: options.tenantId },
      select: { id: true, lastHeartbeatAt: true },
    });
    if (!device) {
      throw new RangeError(`device ${options.deviceId} does not exist in this tenant`);
    }

    // Work already in hand. Forecasting on top of it produces a second, conflicting instruction for
    // something an operator has already picked up, so the open record wins and nothing is invented.
    const openMaintenance = await this.prisma.deviceMaintenance.findFirst({
      where: { tenantId: options.tenantId, deviceId: options.deviceId, status: 'OPEN' },
      select: { id: true },
    });
    if (openMaintenance) {
      return this.persist({
        deviceId: options.deviceId,
        tenantId: options.tenantId,
        band: 'NOT_ESTABLISHED',
        horizonDays: null,
        scoredAt: now,
        evidence: [
          `maintenance already open (${openMaintenance.id}); forecasting would duplicate work in hand`,
        ],
      });
    }

    const [recentCommands, priorCommands, findings] = await Promise.all([
      this.prisma.deviceCommand.findMany({
        where: {
          tenantId: options.tenantId,
          deviceId: options.deviceId,
          createdAt: { gte: recentSince },
        },
        select: { status: true },
        take: 500,
      }),
      this.prisma.deviceCommand.findMany({
        where: {
          tenantId: options.tenantId,
          deviceId: options.deviceId,
          createdAt: { gte: priorSince, lt: recentSince },
        },
        select: { status: true },
        take: 500,
      }),
      this.prisma.analyticsFinding.findMany({
        where: { tenantId: options.tenantId, deviceId: options.deviceId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { severity: true },
      }),
    ]);

    const recentFailures = countFailures(recentCommands);
    const priorFailures = countFailures(priorCommands);
    const recentRate = recentCommands.length === 0 ? 0 : recentFailures / recentCommands.length;
    const priorRate = priorCommands.length === 0 ? 0 : priorFailures / priorCommands.length;

    const critical = findings.filter((finding) => finding.severity === 'CRITICAL').length;

    const evidence = [
      `${recentFailures}/${recentCommands.length} commands failed recently (${round(recentRate * 100)}%)`,
      `${priorFailures}/${priorCommands.length} failed in the earlier window (${round(priorRate * 100)}%)`,
      `${critical} critical anomaly finding(s)`,
    ];

    // Too little to compare against. Reporting "stable" here would rank the least-observed devices as the
    // safest ones, which is exactly backwards: absence of evidence is not evidence of health.
    if (recentCommands.length < minCommands || priorCommands.length === 0) {
      return this.persist({
        deviceId: options.deviceId,
        tenantId: options.tenantId,
        band: 'NOT_ESTABLISHED',
        horizonDays: null,
        scoredAt: now,
        evidence: [
          ...evidence,
          `need at least ${minCommands} recent and one earlier command to compare; have ${recentCommands.length} and ${priorCommands.length}`,
        ],
      });
    }

    // The trend: how much worse the recent window is than the earlier one. A device whose rate rose is in
    // different trouble from one that has always failed at the same rate.
    const trend = recentRate - priorRate;
    const absoluteFailure = recentRate >= 0.5;
    const criticalPressure = critical >= 3;

    let band: RiskBand;
    let horizonDays: number | null;

    if (absoluteFailure || (criticalPressure && trend > 0)) {
      band = 'IMMINENT';
      horizonDays = 1;
    } else if (trend >= 0.2) {
      band = 'DECLINING';
      // The horizon shrinks with the size of the rise, on a floor of two days so "declining" never implies
      // "act this afternoon" on the strength of three commands.
      horizonDays = Math.max(2, Math.round(10 - trend * 20));
    } else if (recentRate > 0 || criticalPressure) {
      band = 'WATCH';
      horizonDays = 14;
    } else {
      band = 'STABLE';
      horizonDays = 30;
    }

    evidence.push(`trend ${trend >= 0 ? '+' : ''}${round(trend * 100)} points against the earlier window`);

    return this.persist({
      deviceId: options.deviceId,
      tenantId: options.tenantId,
      band,
      horizonDays,
      scoredAt: now,
      evidence,
    });
  }

  private async persist(result: RiskForecastResult): Promise<RiskForecastResult> {
    await this.prisma.device.update({
      where: { id: result.deviceId },
      data: {
        riskBand: result.band,
        riskHorizonDays: result.horizonDays,
        riskEvaluatedAt: result.scoredAt,
        riskForecastVersion: DeviceRiskForecastingService.FORECAST_VERSION,
      },
    });
    this.log.log(`${result.deviceId} risk ${result.band}${result.horizonDays ? ` in ${result.horizonDays}d` : ''}`);
    return result;
  }
}

type RiskBand = 'NOT_ESTABLISHED' | 'STABLE' | 'WATCH' | 'DECLINING' | 'IMMINENT';

export interface RiskForecastResult {
  deviceId: string;
  tenantId: string;
  band: RiskBand;
  horizonDays: number | null;
  scoredAt: Date;
  evidence: string[];
}

/** A command that did not complete. FAILED and TIMED_OUT are the same outcome from the device's side. */
function countFailures(commands: { status: string }[]): number {
  return commands.filter(
    (command) => command.status === 'FAILED' || command.status === 'TIMED_OUT',
  ).length;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}