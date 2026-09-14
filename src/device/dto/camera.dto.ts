import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateCameraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly name: string;

  /** Optional safe presentation metadata only. Never credentials. */
  @IsString()
  @MaxLength(80)
  @IsNotEmpty()
  readonly vendor: string;

  @IsString()
  @MaxLength(120)
  @IsOptional()
  readonly model?: string;
}

export class CameraPairDto {
  /** Bounded code value collected from a user-initiated QR scan. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  readonly token: string;
}
