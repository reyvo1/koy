import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [PrismaModule],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
