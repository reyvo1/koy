import { IsEnum, IsISO8601, IsUUID } from 'class-validator';

/**
 * Module 18 REST surface.
 *
 * The service (`DeviceShareService`) has been complete since Slice 18.1 — bounded expiry,
 * active-grant ceiling, self-grant refusal, and an audit row per mutation — but it had no
 * controller, so `createGrant` had no caller outside its own spec. A share could therefore
 * only be produced by writing directly to `device_share_grants`, which is why a MEMBER could
 * not control any device through the product even though the access path that CONSUMES a
 * grant (`DeviceAccessService`) was live and working.
 *
 * This DTO exposes that existing, already-tested service. It does not widen the contract:
 * `permission` matches the schema enum and `expiresAt` is validated again at the service
 * against the database clock, not merely against request time.
 */
export class CreateDeviceShareDto {
  @IsUUID()
  grantedToMembershipId!: string;

  @IsEnum(['VIEW', 'CONTROL'])
  permission!: 'VIEW' | 'CONTROL';

  @IsISO8601()
  expiresAt!: string;
}
