import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminRoleGuard } from '../admin-operations/admin-role.guard';
import { RbacPolicyService } from './rbac-policy.service';
import { RbacAuditService } from './rbac-audit.service';
import { RbacAuditController } from './rbac-audit.controller';
import { TenantRoleController } from './tenant-role.controller';
import { OwnedResourceResolver } from './owned-resource.resolver';
import { ResourceOwnershipRegistry } from './resource-ownership';

/**
 * Binds each `resourceType` that has an owner column to the resolver that can check it.
 *
 * This is the only place a resource type is declared ownable. `scene` and `schedule` are
 * deliberately absent: neither model has an owner column, so `allowOwner` on those routes
 * would fall through and deny the owner — the guard treats a missing resolver as "not owned".
 */
@Injectable()
export class OwnershipBootstrap implements OnModuleInit {
  constructor(private readonly registry: ResourceOwnershipRegistry) {}

  onModuleInit(): void {
    this.registry.register('automation', OwnedResourceResolver);
    this.registry.register('dashboard', OwnedResourceResolver);
  }
}

/**
 * Global because `ResourceOwnershipRegistry` is consulted by `RbacPermissionGuard` on every
 * denied request, and the binding is declared in one place. A scoped module would make the
 * guard's view of ownership depend on which module happened to import it.
 */
@Global()
@Module({
  imports: [PrismaModule],
  // TenantRoleController is the writer for `custom_roles` and `membership_role_overrides`.
  // Those tables were read by the policy service and written by nothing, so every MEMBER was
  // permanently unprivileged and every permission-gated route refused every member.
  controllers: [RbacAuditController, TenantRoleController],
  providers: [
    RbacPolicyService,
    RbacAuditService,
    ResourceOwnershipRegistry,
    OwnedResourceResolver,
    OwnershipBootstrap,
    // Provided here rather than imported: admin-operations declares no `exports`, so the
    // guard is not visible outside that module. It is stateless — it reads only
    // `request.user.tenantContext.role` — so a second instance carries no state to share.
    AdminRoleGuard,
  ],
  exports: [
    RbacPolicyService,
    RbacAuditService,
    ResourceOwnershipRegistry,
    OwnedResourceResolver,
  ],
})
export class RbacModule {}
