import {
  Controller,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import { DomainUnauthorizedException } from '../common/errors/domain-exceptions';
import { DeviceService } from './device.service';
import { DeviceAuthGuard } from './guards/device-auth.guard';
import { PairDeviceDto, RotateCredentialDto } from './dto/device.dto';

@Controller('devices')
export class DevicePublicController {
  constructor(private deviceService: DeviceService) {}

  @Post(':id/pair')
  async pair(@Param('id') id: string, @Body() dto: PairDeviceDto) {
    return this.deviceService.pair(id, dto.token, dto.password);
  }

  @UseGuards(DeviceAuthGuard)
  @Patch(':id/heartbeat')
  async heartbeat(@Param('id') id: string, @Request() req: any) {
    if (req.device.id !== id)
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceIdentityMismatch,
        'Identity mismatch',
      );
    return this.deviceService.updateHeartbeat(
      req.device.tenantId,
      req.device.id,
    );
  }

  @UseGuards(DeviceAuthGuard)
  @Patch(':id/rotate')
  async rotate(
    @Param('id') id: string,
    @Body() dto: RotateCredentialDto,
    @Request() req: any,
  ) {
    if (req.device.id !== id)
      throw new DomainUnauthorizedException(
        ERROR_CODES.DeviceIdentityMismatch,
        'Identity mismatch',
      );
    return this.deviceService.rotateCredential(
      req.device.tenantId,
      req.device.id,
      dto.oldSecret,
      dto.newSecret,
    );
  }
}
