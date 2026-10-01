import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RBAC_OWNERSHIP_MODEL,
  RBAC_PERMISSION_CATALOG,
} from './rbac-permission-catalog';

const SRC = join(__dirname, '..'); // .../src — every path below is relative to it
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

/**
 * Scene and Schedule are audited, not gated. That is a deliberate asymmetry with automation and
 * dashboard, and this file exists so it stays a decision rather than drifting into an accident.
 *
 * The reasoning: neither model has an owner column, so "your own, or anyone's if you are an
 * admin" cannot be written down. Gating them on a role today would either lock ordinary members
 * out of the product's primary function or permit everything. Audit-only keeps today's behaviour
 * intact while producing the evidence needed to decide whether an owner column is worth adding.
 */
describe('ungated domains are audited instead', () => {
  const scene = read('scene/scene.controller.ts');
  const schedule = read('scheduler/schedule.controller.ts');

  it('states the asymmetry in the catalog for all four domains', () => {
    for (const domain of ['automation', 'dashboard', 'scene', 'schedule'] as const) {
      expect(RBAC_OWNERSHIP_MODEL[domain].length).toBeGreaterThan(0);
    }
    // The two gated domains must not describe themselves as ungated, and vice versa.
    expect(RBAC_OWNERSHIP_MODEL.scene).toContain('tidak ada role gate');
    expect(RBAC_OWNERSHIP_MODEL.schedule).toContain('tidak ada role gate');
    expect(RBAC_OWNERSHIP_MODEL.automation).not.toContain('tidak ada role gate');
  });

  it('records a scene mutation on every mutating route', () => {
    expect(scene).toContain('RbacAuditService');
    // DELETE, the enable toggle, and CREATE.
    expect(scene.match(/recordSceneMutation\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(scene).toContain("resourceType: 'scene'");
  });

  it('records a schedule mutation on every mutating route', () => {
    expect(schedule).toContain('RbacAuditService');
    expect(schedule.match(/recordScheduleMutation\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(schedule).toContain("resourceType: 'schedule'");
  });

  it('says in the audit row that permission came from tenant scope, not a role check', () => {
    // Without this the row is indistinguishable from one written by a passing permission
    // check, and the audit trail would overstate what the system actually enforced.
    for (const [source, needle] of [
      [scene, 'no owner column and no role gate'],
      [schedule, 'no owner column and no role gate'],
    ]) {
      expect(source).toContain(needle);
    }
  });

  it('does not register an ownership resolver for a domain that has no owner column', () => {
    const rbacModule = read('rbac/rbac.module.ts');
    expect(rbacModule).toContain("register('automation'");
    expect(rbacModule).toContain("register('dashboard'");
    expect(rbacModule).not.toContain("register('scene'");
    expect(rbacModule).not.toContain("register('schedule'");
  });
});

describe('owned domains declare owner-aware permissions', () => {
  const automation = read('automation/automation.controller.ts');
  const dashboard = read('dashboard/dashboard.controller.ts');

  /**
   * Walks `route decorator` then `@RequirePermission` pairs, and checks the option against the
   * route shape rather than against a fixed list. A collection route (`@Get()`) addresses no
   * resource, so `allowOwner` would be meaningless there; a route with an `:id` does address
   * one, so it must carry it. Deriving the rule from the route is what keeps a new collection
   * route from being forced to declare an option that cannot apply.
   */
  function checkDecorators(source: string, domain: string) {
    const pairs = Array.from(
      source.matchAll(
        /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)[\s\S]{0,80}?@RequirePermission\(\s*'([^']+)'([^)]*)\)/g,
      ),
    );
    expect(pairs.length).toBeGreaterThanOrEqual(7);
    for (const [, verb, route, permission, options] of pairs) {
      const namesResource = route.includes(':');
      expect(RBAC_PERMISSION_CATALOG.some((e) => e.permission === permission)).toBe(true);
      expect(permission.startsWith(`${domain}.`)).toBe(true);
      if (namesResource) {
        expect(options).toContain('allowOwner');
      } else {
        expect(options).not.toContain('allowOwner');
      }
      void verb;
    }
  }

  it('gives every automation route a permission, and declares allowOwner exactly where the route addresses a resource', () => {
    checkDecorators(automation, 'automation');
  });

  it('gives every dashboard route a permission, and declares allowOwner exactly where the route addresses a resource', () => {
    checkDecorators(dashboard, 'dashboard');
  });

  it('mounts the permission guard on both controllers', () => {
    for (const source of [automation, dashboard]) {
      const guardList = source.match(/@UseGuards\(([^)]*)\)/)?.[1] ?? '';
      expect(guardList).toContain('JwtAuthGuard');
      expect(guardList).toContain('TenantContextGuard');
      expect(guardList).toContain('RbacPermissionGuard');
    }
  });

  it('scopes every ownership lookup by tenant as well as by owner', () => {
    const resolver = read('rbac/owned-resource.resolver.ts');
    // Both branches must carry tenantId. Dropping it would let a membership claim a resource in
    // another tenant and reach it through the owner path.
    const whereClauses = Array.from(
      resolver.matchAll(/where:\s*\{([^}]*)\}/g),
    ).map((m) => m[1]);
    expect(whereClauses.length).toBeGreaterThanOrEqual(2);
    for (const clause of whereClauses) {
      expect(clause).toContain('tenantId');
      expect(clause).toContain('ownerMembershipId');
    }
  });
});
