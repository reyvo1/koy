import type { AuditAction } from '@prisma/client';

/**
 * Map a `<resource>.<action>` permission to the truthful audit action.
 *
 * Permission verbs live in the suffix (`dashboard.delete`, not `delete.dashboard`). Keep this
 * mapping canonical: authorization and owner-bypass audit paths must never describe the same
 * operation differently. Mutating verbs with no exact AuditAction equivalent are recorded as
 * UPDATE rather than being mislabeled CREATE.
 */
export function auditActionForPermission(permission: string): AuditAction {
  const action = permission.split('.').pop()?.trim().toLowerCase();
  switch (action) {
    case 'read':
      return 'READ';
    case 'create':
      return 'CREATE';
    case 'delete':
      return 'DELETE';
    case 'update':
      return 'UPDATE';
    case 'share':
    case 'grant':
      return 'GRANT';
    case 'revoke':
      return 'REVOKE';
    default:
      return 'UPDATE';
  }
}
