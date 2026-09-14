import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsSeverity } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const ANALYTICS_LIMITS = {
  maxSummaryLength: 512,
  maxDetectorVersionLength: 32,
  maxFindingsPerBatch: 100,
} as const;

/**
 * Module 16 Slice 16.1 — provider-neutral analytics ingestion boundary.
 * Findings arrive from pluggable detectors (heuristic or external AI) with an
 * explicit detectorVersion and a bounded confidence in [0,1]. This module
 * makes no accuracy claims: it persists, bounds, and exposes findings only.
 */
@Injectable()
export class AnalyticsIngestionService {
  private readonly logger = new Logger(AnalyticsIngestionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestFinding(input: {
    tenantId: string;
    deviceId: string;
    capabilityKey: string;
    kind: 'ANOMALY' | 'RECOMMENDATION';
    severity: keyof typeof AnalyticsSeverity;
    summary: string;
    confidence: number;
    detectorVersion: string;
  }): Promise<{ id: string }> {
    this.assertFinding(input);

    const created = await this.prisma.analyticsFinding.create({
      data: {
        tenantId: input.tenantId,
        deviceId: input.deviceId,
        capabilityKey: input.capabilityKey,
        kind: input.kind,
        severity: input.severity,
        summary: input.summary,
        confidence: input.confidence,
        detectorVersion: input.detectorVersion,
      },
    });
    return { id: created.id };
  }

  async listRecent(tenantId: string, limit = 50) {
    if (limit < 1 || limit > 100) {
      throw Object.assign(new Error('limit must be 1..100'), {
        code: 'ANALYTICS_LIMIT_INVALID',
      });
    }
    return this.prisma.analyticsFinding.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
  }

  private assertFinding(input: {
    summary: string;
    confidence: number;
    detectorVersion: string;
  }): void {
    const errors: string[] = [];
    if (
      !input.summary ||
      input.summary.length > ANALYTICS_LIMITS.maxSummaryLength
    ) {
      errors.push('ANALYTICS_SUMMARY_INVALID');
    }
    if (
      typeof input.confidence !== 'number' ||
      input.confidence < 0 ||
      input.confidence > 1
    ) {
      errors.push('ANALYTICS_CONFIDENCE_INVALID');
    }
    if (
      !input.detectorVersion ||
      input.detectorVersion.length >
        ANALYTICS_LIMITS.maxDetectorVersionLength ||
      !/^[A-Za-z0-9._-]+$/.test(input.detectorVersion)
    ) {
      errors.push('ANALYTICS_DETECTOR_VERSION_INVALID');
    }
    if (errors.length > 0) {
      throw Object.assign(new Error(errors.join(',')), { code: errors[0] });
    }
  }
}
