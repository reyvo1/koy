import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const PROVISIONABLE_ROLES = ['MEMBER', 'ADMIN'] as const;

/** Platform admin payload: explicit target tenant. */
export class CreateTenantUserDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  tenantId: string;

  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsIn(PROVISIONABLE_ROLES)
  role: (typeof PROVISIONABLE_ROLES)[number];
}

/** Tenant admin payload: tenant comes from the trusted context, never the body. */
export class CreateOwnTenantUserDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsIn(PROVISIONABLE_ROLES)
  role: (typeof PROVISIONABLE_ROLES)[number];
}
