import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '../common/errors/error-code';
import {
  DomainBadRequestException,
  DomainNotFoundException,
} from '../common/errors/domain-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCapabilityDto } from './dto/create-capability.dto';
import { CapabilityValidator } from './capability.validator';

@Injectable()
export class CapabilityService {
  constructor(
    private prisma: PrismaService,
    private validator: CapabilityValidator,
  ) {}

  async create(tenantId: string, deviceId: string, data: CreateCapabilityDto) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });
    if (!device)
      throw new DomainNotFoundException(
        ERROR_CODES.CapabilityDeviceNotFound,
        'Device not found in tenant',
      );

    this.validator.validateSchema(data);

    try {
      return await this.prisma.capability.create({
        data: {
          ...data,
          deviceId,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002')
        throw new DomainBadRequestException(
          ERROR_CODES.CapabilityAlreadyExists,
          'Capability with this key already exists for this device',
        );
      throw error;
    }
  }

  async findAll(tenantId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, tenantId },
    });
    if (!device)
      throw new DomainNotFoundException(
        ERROR_CODES.CapabilityDeviceNotFound,
        'Device not found in tenant',
      );

    return this.prisma.capability.findMany({ where: { deviceId } });
  }
}
