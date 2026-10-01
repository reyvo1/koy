import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { PlatformRoleGuard } from '../admin-operations/platform-role.guard';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

@Module({
  imports: [PrismaModule],
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    // admin-operations declares no `exports`, so these guards are not visible from here.
    // Both are stateless — they read only `request.user.tenantContext.role` — so providing
    // them locally costs no shared state.
    AdminRoleGuard,
    PlatformRoleGuard,
  ],
  exports: [OrganizationService],
})
export class OrgModule {}
