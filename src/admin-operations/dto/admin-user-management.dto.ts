import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const PROVISIONABLE_ROLES = ['MEMBER', 'ADMIN'] as const;
export const MEMBERSHIP_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export const DEVICE_TYPES = ['SENSOR', 'ACTUATOR', 'GATEWAY', 'CAMERA'] as const;

export class PlatformUpdateUserDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  tenantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(PROVISIONABLE_ROLES)
  role?: (typeof PROVISIONABLE_ROLES)[number];

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: (typeof MEMBERSHIP_STATUSES)[number];
}

export class TenantUpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(PROVISIONABLE_ROLES)
  role?: (typeof PROVISIONABLE_ROLES)[number];

  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  status?: (typeof MEMBERSHIP_STATUSES)[number];
}

export class PlatformResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  tenantId: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class TenantResetPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class PlatformProvisionDeviceDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  tenantId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(DEVICE_TYPES)
  type: (typeof DEVICE_TYPES)[number];
}

export class TenantProvisionDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsIn(DEVICE_TYPES)
  type: (typeof DEVICE_TYPES)[number];
}
