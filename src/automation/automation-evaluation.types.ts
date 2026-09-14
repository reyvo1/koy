import {
  AutomationAction,
  AutomationDefinitionContract,
  AutomationPrimitive,
} from './automation-domain.types';

export const AUTOMATION_EVALUATION_LIMITS = {
  maxLatestValues: 32,
} as const;

export type AutomationEvaluationMode =
  'DISABLED_DEFINITION_PREVIEW' | 'APPROVED_RUNTIME';

export interface AutomationEvaluationCandidate {
  readonly automationId: string;
  readonly tenantId: string;
  readonly enabled: boolean;
  readonly revision: number;
  readonly definition: AutomationDefinitionContract;
}

export interface NormalizedCapabilityReport {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly capabilityKey: string;
  readonly value: AutomationPrimitive;
}

export interface NormalizedLatestCapabilityValue {
  readonly tenantId: string;
  readonly deviceId: string;
  readonly capabilityKey: string;
  readonly value: AutomationPrimitive;
}

export interface AutomationEvaluationRequest {
  readonly candidate: AutomationEvaluationCandidate;
  readonly report: NormalizedCapabilityReport;
  readonly latestValues: readonly NormalizedLatestCapabilityValue[];
}

export type AutomationEvaluationOutcome =
  'MATCHED' | 'NOT_MATCHED' | 'NOT_APPLICABLE' | 'REJECTED';

export type AutomationEvaluationReasonCode =
  | 'CONDITION_MATCHED'
  | 'CONDITION_FALSE'
  | 'TRIGGER_MISMATCH'
  | 'VALUE_UNAVAILABLE'
  | 'TYPE_MISMATCH'
  | 'INVALID_INPUT'
  | 'INVALID_DEFINITION'
  | 'TENANT_MISMATCH'
  | 'ACTIVATION_NOT_APPROVED';

export type AutomationActionIntent = Readonly<AutomationAction>;

export interface AutomationEvaluationResult {
  readonly automationId: string | null;
  readonly revision: number | null;
  readonly outcome: AutomationEvaluationOutcome;
  readonly reasonCode: AutomationEvaluationReasonCode;
  readonly matched: boolean;
  readonly actionIntents: readonly AutomationActionIntent[];
}
