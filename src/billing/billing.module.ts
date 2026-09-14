import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BillingQuotaService } from './billing-quota.service';

@Module({
  imports: [PrismaModule],
  providers: [BillingQuotaService],
  exports: [BillingQuotaService],
})
export class BillingModule {}
