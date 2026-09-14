export const DASHBOARD_PERSISTENCE_ERROR_CODES = {
  InvalidInput: 'DASHBOARD_PERSISTENCE_INVALID_INPUT',
  MembershipInvalid: 'DASHBOARD_MEMBERSHIP_INVALID',
  DashboardNotFound: 'DASHBOARD_NOT_FOUND',
  RevisionConflict: 'DASHBOARD_REVISION_CONFLICT',
  BindingTargetInvalid: 'DASHBOARD_BINDING_TARGET_INVALID',
  SharedAdminRequired: 'DASHBOARD_SHARED_ADMIN_REQUIRED',
  WidgetResolutionInvalid: 'DASHBOARD_WIDGET_RESOLUTION_INVALID',
} as const;

export type DashboardPersistenceErrorCode =
  (typeof DASHBOARD_PERSISTENCE_ERROR_CODES)[keyof typeof DASHBOARD_PERSISTENCE_ERROR_CODES];

export class DashboardPersistenceError extends Error {
  constructor(
    public readonly code: DashboardPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DashboardPersistenceError';
  }
}
