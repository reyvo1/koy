import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OrganizationService } from './organization.service';

@Module({
  imports: [PrismaModule],
  providers: [OrganizationService],
  exports: [OrganizationService],
})
export class OrgModule {}
