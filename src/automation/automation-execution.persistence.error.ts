export const AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES = {
  InvalidInput: 'AUTOMATION_EXECUTION_INVALID_INPUT',
  AutomationUnavailable: 'AUTOMATION_EXECUTION_AUTOMATION_UNAVAILABLE',
  TelemetryMismatch: 'AUTOMATION_EXECUTION_TELEMETRY_MISMATCH',
  ActionSnapshotMismatch: 'AUTOMATION_EXECUTION_ACTION_SNAPSHOT_MISMATCH',
  IdempotencyConflict: 'AUTOMATION_EXECUTION_IDEMPOTENCY_CONFLICT',
  CooldownInvalid: 'AUTOMATION_EXECUTION_COOLDOWN_INVALID',
  DatabaseClockUnavailable: 'AUTOMATION_EXECUTION_DATABASE_CLOCK_UNAVAILABLE',
  ExecutionNotFound: 'AUTOMATION_EXECUTION_NOT_FOUND',
  ActionNotFound: 'AUTOMATION_EXECUTION_ACTION_NOT_FOUND',
  TransitionConflict: 'AUTOMATION_EXECUTION_TRANSITION_CONFLICT',
  CommandMismatch: 'AUTOMATION_EXECUTION_COMMAND_MISMATCH',
  RetryExhausted: 'AUTOMATION_EXECUTION_RETRY_EXHAUSTED',
  RetryNotEligible: 'AUTOMATION_EXECUTION_RETRY_NOT_ELIGIBLE',
} as const;

export type AutomationExecutionPersistenceErrorCode =
  (typeof AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES)[keyof typeof AUTOMATION_EXECUTION_PERSISTENCE_ERROR_CODES];

export class AutomationExecutionPersistenceError extends Error {
  constructor(
    public readonly code: AutomationExecutionPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationExecutionPersistenceError';
  }
}
