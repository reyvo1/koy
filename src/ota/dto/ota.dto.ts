import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

/**
 * Module 15 REST payloads.
 *
 * The limits mirror `OTA_LIMITS` in `ota-domain.validator.ts` so a request that the
 * validator would refuse is rejected at the boundary with a 400 field error instead of
 * travelling into the repository and surfacing as a translated exception. The DTO stays
 * the outer bound; the domain validator remains the authority and is still called.
 */
export class CreateFirmwareArtifactDto {
  @IsString()
  @Matches(VERSION_PATTERN, {
    message: 'version must start alphanumeric and may contain . _ + -',
  })
  @MaxLength(64)
  version!: string;

  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(512)
  artifactUrl!: string;

  @IsString()
  @Matches(SHA256_PATTERN, { message: 'sha256 must be a lowercase 64-hex digest' })
  sha256!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  sizeBytes!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  compatibleModels!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  releaseNotes?: string;
}

export class CreateRolloutDto {
  @IsString()
  firmwareId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(/^[0-9a-fA-F-]{36}$/, { each: true, message: 'targetDeviceIds must be UUIDs' })
  targetDeviceIds!: string[];
}

/** Operator-driven state change. Only the forward-only machine's legal edges are accepted. */
export class TransitionRolloutDto {
  @IsString()
  @Matches(/^(PUBLISHED|IN_PROGRESS|ROLLED_BACK)$/, {
    message: 'status must be PUBLISHED, IN_PROGRESS or ROLLED_BACK',
  })
  status!: string;
}

export class RecordRolloutProgressDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  succeededDeviceIds: string[] = [];

  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  failedDeviceIds: string[] = [];
}
