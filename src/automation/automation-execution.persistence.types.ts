import { AutomationActionIntent } from './automation-evaluation.types';
import { AutomationPrimitive } from './automation-domain.types';

export const AUTOMATION_EXECUTION_PERSISTENCE_LIMITS = {
  maxAncestryDepth: 16,
  maxEventIdLength: 256,
  maxCooldownSeconds: 86400,
  maxTransitionErrorCodeLength: 128,
} as const;

export interface AutomationExecutionAncestryItem {
  readonly executionId: string;
  readonly automationId: string;
}

export interface ReserveMatchedAutomationExecutionInput {
  readonly tenantId: string;
  readonly automationId: string;
  readonly automationRevision: number;
  readonly triggerTelemetryId: string;
  readonly triggerEventId: string;
  readonly triggerDeviceId: string;
  readonly triggerCapabilityId: string;
  readonly triggerCapabilityKey: string;
  readonly triggerValue: AutomationPrimitive;
  readonly triggerOccurredAt: Date;
  readonly ancestry: readonly AutomationExecutionAncestryItem[];
  readonly actionIntents: readonly AutomationActionIntent[];
}

export type AutomationExecutionReservationDisposition = 'CREATED' | 'REPLAYED';

export interface AutomationExecutionIdentityInput {
  readonly tenantId: string;
  readonly executionId: string;
}

export interface RecordAutomationActionSucceededInput extends AutomationExecutionIdentityInput {
  readonly actionId: string;
  readonly commandId: string;
}

export interface RecordAutomationActionFailedInput extends AutomationExecutionIdentityInput {
  readonly actionId: string;
  readonly errorCode: string;
  readonly commandId?: string;
}

/** Deterministic bounded retry policy for failed automation action dispatch. */
export const AUTOMATION_RETRY_LIMITS = {
  maxDispatchAttempts: 3,
  /** Backoff seconds by attempt index (after attempt N fails, wait backoff[N-1]). */
  backoffSecondsByAttempt: [5, 15],
} as const;

/** Error codes eligible for bounded retry. Everything else stays terminal. */
export const RETRYABLE_ACTION_ERROR_CODES = new Set<string>([
  'COMMAND_PUBLISH_FAILED',
  'AUTOMATION_COMMAND_DISPATCH_COMMAND_TIMED_OUT',
  'AUTOMATION_COMMAND_DISPATCH_UNEXPECTED',
]);

export type AutomationActionRetryDecision =
  | { readonly kind: 'RETRY_SCHEDULED'; readonly attemptCount: number; readonly nextEligibleAt: Date }
  | { readonly kind: 'TERMINAL_FAILURE' };

export type AutomationExecutionTransitionDisposition = 'APPLIED' | 'REPLAYED';
