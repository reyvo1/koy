import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Module 10 tenant-isolated dashboard API contract', () => {
  const controller = read('src/dashboard/dashboard.controller.ts');
  const service = read('src/dashboard/dashboard.service.ts');
  const repository = read('src/dashboard/dashboard.repository.ts');
  const dto = read('src/dashboard/dto/dashboard.dto.ts');
  const guard = read('src/users/guards/tenant-context.guard.ts');
  const moduleSource = read('src/dashboard/dashboard.module.ts');
  const errorHandling = read('docs/error-handling.md');

  it('exposes bounded authenticated CRUD under trusted tenant context', () => {
    expect(controller).toContain("@Controller('dashboards')");
    // Assert the guard list by membership, not as a pinned string. Pinning
    // `JwtAuthGuard, TenantContextGuard)` meant that adding a third guard failed the test even
    // though the extra guard only strengthens the boundary this assertion exists to protect.
    // The intent is "authenticated and tenant-scoped"; that stays true as guards are added.
    const guardList = controller.match(/@UseGuards\(([^)]*)\)/)?.[1] ?? '';
    expect(guardList).toContain('JwtAuthGuard');
    expect(guardList).toContain('TenantContextGuard');
    expect(controller).toContain('@ApiBearerAuth()');
    expect(controller).toContain("name: 'X-Tenant-Id'");
    expect(controller).toContain('@Post()');
    expect(controller).toContain('@Get()');
    expect(controller).toContain("@Get(':dashboardId')");
    expect(controller).toContain("@Put(':dashboardId')");
    expect(controller).toContain("@Delete(':dashboardId')");
    expect(controller).toContain('ParseIntPipe');
  });

  it('derives ownership server-side and never accepts tenant or owner identifiers in DTOs', () => {
    expect(guard).toContain('membershipId: membership.id');
    expect(service).toContain('tenantId: context.tenantId');
    expect(service).toContain('ownerMembershipId: context.membershipId');
    expect(dto).not.toContain('tenantId: string');
    expect(dto).not.toContain('ownerMembershipId');
    expect(dto).toContain('@ArrayMaxSize(3)');
    expect(dto).toContain('@ArrayMaxSize(100)');
    expect(dto).toContain('@ArrayMaxSize(1600)');
  });

  it('enforces personal ownership, shared reads, and admin-only shared mutations', () => {
    expect(repository).toContain('DashboardAudience.TENANT_SHARED');
    expect(repository).toContain('ownerMembershipId: actorMembershipId');
    expect(repository).toContain('SharedAdminRequired');
    expect(service).toContain('context.role === ADMIN_ROLE');
    expect(repository).toContain("const ADMIN_ROLES = new Set(['ADMIN', 'PLATFORM_ADMIN'])");
    expect(repository).toContain('ADMIN_ROLES.has(actorMembership.role)');
    expect(service).not.toContain('dto.ownerMembershipId');
  });

  it('maps persistence errors and excludes internal ownership fields from API responses', () => {
    const mapper = read('src/dashboard/dashboard-error.mapper.ts');
    expect(mapper).toContain('DashboardRevisionConflict');
    expect(mapper).toContain('DashboardSharedAdminRequired');
    expect(service).not.toContain('tenantId: record.tenantId');
    expect(service).not.toContain(
      'ownerMembershipId: record.ownerMembershipId',
    );
    expect(errorHandling).toContain('DASHBOARD_NOT_FOUND');
    expect(errorHandling).toContain('DASHBOARD_REVISION_CONFLICT');
    expect(errorHandling).toContain('DASHBOARD_SHARED_ADMIN_REQUIRED');
  });

  it('registers the controller and advances only Slice 10.3', () => {
    expect(moduleSource).toContain('controllers: [DashboardController]');
    expect(moduleSource).toContain('DashboardService');
  });

});
