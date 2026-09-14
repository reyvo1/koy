import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { DeviceType } from '@prisma/client';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  readonly name: string;

  @IsEnum(DeviceType)
  readonly type: DeviceType;
}

export class PairDeviceDto {
    @IsString()
    @IsNotEmpty()
    readonly token: string;

    @IsString()
    @IsNotEmpty()
    readonly password: string;
}

export class RotateCredentialDto {
    @IsString()
    @IsNotEmpty()
    readonly oldSecret: string;

    @IsString()
    @IsNotEmpty()
    readonly newSecret: string;
}

export class AssignOwnerDto {
    @IsString()
    @IsNotEmpty()
    readonly userId: string;
}
