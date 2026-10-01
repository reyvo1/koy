import { IsString, IsUUID, Length } from 'class-validator';

/**
 * Module 19 REST DTOs.
 *
 * Organization creation is a platform-level action (an Organization groups whole tenants as
 * branches), so it is guarded by PlatformRoleGuard rather than an RBAC permission string.
 * That is deliberate: the permission catalog in `rbac-permission-catalog.ts` is pinned
 * two-way to `@RequirePermission` decorators, and inventing a permission for this would
 * change the authorisation contract instead of exposing a service that already exists.
 */
export class CreateOrganizationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsUUID()
  firstBranchTenantId!: string;

  @IsString()
  @Length(2, 120)
  firstBranchLabel!: string;
}

export class AddBranchDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  tenantId!: string;

  @IsString()
  @Length(2, 120)
  label!: string;
}
