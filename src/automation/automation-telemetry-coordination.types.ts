import { AutomationPrimitive } from './automation-domain.types';
import { AutomationExecutionAncestryItem } from './automation-execution.persistence.types';

export const AUTOMATION_TELEMETRY_COORDINATION_LIMITS = {
  maxReports: 32,
  maxCandidatesPerReport: 64,
  maxFailures: 32,
} as const;

export type AutomationTelemetryOrigin =
  'EXTERNAL_ACCEPTED' | 'AUTOMATION_DERIVED';

export interface AutomationTelemetryCapabilityReport {
  readonly capabilityId: string;
  readonly capabilityKey: string;
  readonly value: AutomationPrimitive;
}

export interface AutomationTelemetryCoordinationEnvelope {
  readonly tenantId: string;
  readonly telemetryId: string;
  readonly deviceId: string;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly origin: AutomationTelemetryOrigin;
  readonly ancestry: readonly AutomationExecutionAncestryItem[];
  readonly reports: readonly AutomationTelemetryCapabilityReport[];
}

export interface AutomationTelemetryCoordinationFailure {
  readonly automationId: string | null;
  readonly capabilityKey: string;
  readonly errorCode: string;
}

export interface AutomationTelemetryCoordinationResult {
  readonly reportCount: number;
  readonly candidateCount: number;
  readonly matchedCount: number;
  readonly reservationCreatedCount: number;
  readonly reservationReplayedCount: number;
  readonly dispatchedCount: number;
  readonly suppressedCount: number;
  readonly failedCount: number;
  readonly failures: readonly AutomationTelemetryCoordinationFailure[];
}
