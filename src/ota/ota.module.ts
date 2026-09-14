import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OtaDomainValidator } from './ota-domain.validator';

@Module({
  imports: [PrismaModule],
  providers: [OtaDomainValidator],
  exports: [OtaDomainValidator],
})
export class OtaModule {}
