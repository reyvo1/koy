import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
    @ApiProperty({ description: 'The new name of the user' })
    @IsString()
    @IsNotEmpty()
    readonly name: string;
}
