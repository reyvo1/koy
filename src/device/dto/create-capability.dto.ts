import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsObject, IsIn } from 'class-validator';

export class CreateCapabilityDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  semanticType: string;

  @IsIn(['boolean', 'integer', 'number', 'string', 'enum', 'object'])
  dataType: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsObject()
  constraints?: any;

  @IsBoolean()
  @IsOptional()
  isReadable?: boolean;

  @IsBoolean()
  @IsOptional()
  isWritable?: boolean;

  @IsBoolean()
  @IsOptional()
  isReportable?: boolean;

  @IsString()
  @IsOptional()
  schemaVersion?: string;
}
