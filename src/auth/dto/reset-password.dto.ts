import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    readonly token: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    readonly password: string;
}
