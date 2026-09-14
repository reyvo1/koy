import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const API_KEY_SCOPES = [
  'TELEMETRY_READ',
  'DEVICE_CONTROL',
  'SCENE_EXECUTE',
  'ANALYTICS_READ',
] as const;

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(API_KEY_SCOPES, { each: true })
  scopes: (typeof API_KEY_SCOPES)[number][];
}

export class PlatformCreateApiKeyDto extends CreateApiKeyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  tenantId: string;
}
