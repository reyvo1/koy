import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class CreateCommandDto {
  @ApiProperty({
    example: {
      power: true,
      temperature: 25,
    },
    description: 'Command payload based on device capabilities',
  })
  @IsObject()
  payload: Record<string, any>;

  @ApiPropertyOptional({
    example: 'cmd-20260714-001',
    description: 'Optional idempotency key',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}