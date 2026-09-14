import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DashboardAudience,
  DashboardBindingIntent,
  DashboardBindingMode,
  DashboardBreakpoint,
  DashboardWidgetKind,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardLayoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: DashboardBreakpoint })
  @IsEnum(DashboardBreakpoint)
  breakpoint: DashboardBreakpoint;

  @ApiProperty({ minimum: 1, maximum: 24 })
  @IsInt()
  @Min(1)
  @Max(24)
  columns: number;

  @ApiProperty({ minimum: 1, maximum: 512 })
  @IsInt()
  @Min(1)
  @Max(512)
  rowHeight: number;

  @ApiProperty({ minimum: 0, maximum: 64 })
  @IsInt()
  @Min(0)
  @Max(64)
  gap: number;
}

export class DashboardWidgetDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: DashboardWidgetKind })
  @IsEnum(DashboardWidgetKind)
  kind: DashboardWidgetKind;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @ApiPropertyOptional({ enum: ['1.0.0'], default: '1.0.0' })
  @IsOptional()
  @IsIn(['1.0.0'])
  schemaVersion?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  presentationConfig?: Record<string, unknown>;
}

export class DashboardLayoutItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  layoutId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  widgetId: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  x: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  y: number;

  @ApiProperty({ minimum: 1, maximum: 24 })
  @IsInt()
  @Min(1)
  @Max(24)
  width: number;

  @ApiProperty({ minimum: 1, maximum: 256 })
  @IsInt()
  @Min(1)
  @Max(256)
  height: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 24 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  minWidth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 256 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(256)
  minHeight?: number;
}

export class DashboardBindingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  widgetId: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  alias: string;

  @ApiProperty({ enum: DashboardBindingIntent })
  @IsEnum(DashboardBindingIntent)
  intent: DashboardBindingIntent;

  @ApiProperty({ enum: DashboardBindingMode })
  @IsEnum(DashboardBindingMode)
  mode: DashboardBindingMode;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  deviceId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  capabilityId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  queryConfig?: Record<string, unknown>;
}

export class DashboardAggregateDto {
  @ApiProperty({ maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: ['1.0.0'], default: '1.0.0' })
  @IsOptional()
  @IsIn(['1.0.0'])
  schemaVersion?: string;

  @ApiProperty({ type: [DashboardLayoutDto], maxItems: 3 })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => DashboardLayoutDto)
  layouts: DashboardLayoutDto[];

  @ApiProperty({ type: [DashboardWidgetDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetDto)
  widgets: DashboardWidgetDto[];

  @ApiProperty({ type: [DashboardLayoutItemDto], maxItems: 300 })
  @IsArray()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => DashboardLayoutItemDto)
  layoutItems: DashboardLayoutItemDto[];

  @ApiProperty({ type: [DashboardBindingDto], maxItems: 1600 })
  @IsArray()
  @ArrayMaxSize(1600)
  @ValidateNested({ each: true })
  @Type(() => DashboardBindingDto)
  bindings: DashboardBindingDto[];
}

export class CreateDashboardDto extends DashboardAggregateDto {
  @ApiProperty({ enum: DashboardAudience })
  @IsEnum(DashboardAudience)
  audience: DashboardAudience;
}

export class ReplaceDashboardDto extends DashboardAggregateDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @IsPositive()
  expectedRevision: number;
}
