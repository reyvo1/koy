import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { OtaController } from './ota.controller';
import { OtaDomainValidator } from './ota-domain.validator';
import { OtaRolloutRepository } from './ota-rollout.repository';

/**
 * `OtaRolloutRepository` was previously absent from `providers`, so it could not be injected
 * into any module and no rollout route could exist. `AdminRoleGuard` is provided here for the
 * same reason `RbacModule` provides it: `admin-operations` declares no `exports`, so the
 * guard is invisible outside that module. It is stateless — it reads only
 * `request.user.tenantContext.role` — so a second instance carries no state.
 */
@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [OtaController],
  providers: [OtaDomainValidator, OtaRolloutRepository, AdminRoleGuard],
  exports: [OtaDomainValidator, OtaRolloutRepository],
})
export class OtaModule {}
