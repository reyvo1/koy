import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationService } from './notification.service';

@Module({
  imports: [PrismaModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
