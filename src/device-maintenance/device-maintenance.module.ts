import { MaintenancePlanService } from './maintenance-plan.service';
import { Module } from '@nestjs/common';

import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { DeviceMaintenanceController } from './device-maintenance.controller';
import { DeviceMaintenanceService } from './device-maintenance.service';

/**
 * Technician maintenance.
 *
 * Three things here are load-bearing, and each was a real failure before it was written:
 *
 *  - **`PrismaModule`** — the service injects `PrismaService`, and a module that omits it does not
 *    fail at compile time. The container started, then restart-looped on
 *    "Nest can't resolve PrismaService", which is exactly the shape of a domain that is registered
 *    and unreachable.
 *  - **`RbacModule`** — supplies `RbacAuditService` for the mutation trail.
 *  - **`AdminRoleGuard` as a local provider** — `admin-operations` declares no `exports`, so the
 *    guard is invisible outside that module. It is stateless, reading only
 *    `request.user.tenantContext.role`, so a second instance shares no state. `OtaModule` does the
 *    same thing.
 */
@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [DeviceMaintenanceController],
  providers: [MaintenancePlanService, DeviceMaintenanceService, AdminRoleGuard],
  exports: [DeviceMaintenanceService],
})
export class DeviceMaintenanceModule {}
