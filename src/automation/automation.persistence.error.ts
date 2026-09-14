export const AUTOMATION_PERSISTENCE_ERROR_CODES = {
  InvalidInput: 'AUTOMATION_PERSISTENCE_INVALID_INPUT',
  MembershipInvalid: 'AUTOMATION_MEMBERSHIP_INVALID',
  AutomationNotFound: 'AUTOMATION_NOT_FOUND',
  RevisionConflict: 'AUTOMATION_REVISION_CONFLICT',
  TargetInvalid: 'AUTOMATION_TARGET_INVALID',
  ActivationNotApproved: 'AUTOMATION_ACTIVATION_NOT_APPROVED',
} as const;

export type AutomationPersistenceErrorCode =
  (typeof AUTOMATION_PERSISTENCE_ERROR_CODES)[keyof typeof AUTOMATION_PERSISTENCE_ERROR_CODES];

export class AutomationPersistenceError extends Error {
  constructor(
    public readonly code: AutomationPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AutomationPersistenceError';
  }
}
