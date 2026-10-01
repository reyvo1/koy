import { MaintenanceStatus } from '@prisma/client';

import { DomainBadRequestException } from '../common/errors/domain-exceptions';
import { ERROR_CODES } from '../common/errors/error-code';

/**
 * Body validation for the maintenance routes.
 *
 * Hand-written rather than a `class-validator` DTO, for the same reason this domain refuses a silent
 * default: the parse either produces a value the renderer can use or it says why it could not. The
 * one rule that matters most is that `reason` is required — a window with no reason tells the next
 * technician nothing, and "maintenance" with no explanation is indistinguishable from a device that
 * was simply forgotten about.
 */

export function isMaintenanceStatus(candidate: unknown): candidate is MaintenanceStatus {
  return (
    typeof candidate === 'string' &&
    (Object.values(MaintenanceStatus) as string[]).includes(candidate)
  );
}

export interface OpenMaintenanceBody {
  reason: string;
}

export interface ResolveMaintenanceBody {
  resolutionNote?: string;
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return body as Record<string, unknown>;
}

export function openMaintenanceBody(body: unknown): OpenMaintenanceBody {
  const record = asRecord(body);
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  if (reason.length === 0) {
    throw new DomainBadRequestException(
      ERROR_CODES.BadRequest,'reason is required to open a maintenance window.');
  }
  // A body field naming a tenant would be a cross-tenant write waiting to happen; the tenant comes
  // from verified context and its presence in the payload is rejected rather than ignored.
  if (record.tenantId !== undefined) {
    throw new DomainBadRequestException(
      ERROR_CODES.BadRequest,
      'tenantId is taken from the verified session and must not be sent in the body.',
    );
  }
  return { reason };
}

export function resolveMaintenanceBody(body: unknown): ResolveMaintenanceBody {
  const record = asRecord(body);
  if (record.tenantId !== undefined) {
    throw new DomainBadRequestException(
      ERROR_CODES.BadRequest,
      'tenantId is taken from the verified session and must not be sent in the body.',
    );
  }
  const note = typeof record.resolutionNote === 'string' ? record.resolutionNote.trim() : undefined;
  return { resolutionNote: note };
}