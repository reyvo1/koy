import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacPolicyService } from './rbac-policy.service';

@Module({
  imports: [PrismaModule],
  providers: [RbacPolicyService],
  exports: [RbacPolicyService],
})
export class RbacModule {}
