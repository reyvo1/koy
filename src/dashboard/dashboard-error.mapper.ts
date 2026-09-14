import {
  DomainBadRequestException,
  DomainConflictException,
  DomainForbiddenException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from './dashboard.persistence.error';

export function mapDashboardPersistenceError(error: unknown): never {
  if (!(error instanceof DashboardPersistenceError)) {
    throw error;
  }

  switch (error.code) {
    case DASHBOARD_PERSISTENCE_ERROR_CODES.InvalidInput:
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardInvalidInput,
        error.message,
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.MembershipInvalid:
      throw new DomainForbiddenException(
        ERROR_CODES.DashboardMembershipInvalid,
        'Invalid or inactive dashboard membership',
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound:
      throw new DomainNotFoundException(
        ERROR_CODES.DashboardNotFound,
        'Dashboard not found',
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.RevisionConflict:
      throw new DomainConflictException(
        ERROR_CODES.DashboardRevisionConflict,
        'Dashboard revision conflict',
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.BindingTargetInvalid:
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardBindingTargetInvalid,
        'Dashboard binding target is invalid',
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired:
      throw new DomainForbiddenException(
        ERROR_CODES.DashboardSharedAdminRequired,
        'Tenant-shared dashboards require an active tenant administrator',
      );
    case DASHBOARD_PERSISTENCE_ERROR_CODES.WidgetResolutionInvalid:
      throw new DomainBadRequestException(
        ERROR_CODES.DashboardWidgetResolutionInvalid,
        error.message,
      );
    default:
      throw error;
  }
}
