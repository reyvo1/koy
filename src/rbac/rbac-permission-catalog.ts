/**
 * The authoritative catalog of RBAC permissions this API actually enforces.
 *
 * Why this exists: the Super Admin "Roles" page previously displayed a hand-written
 * permission matrix (`dashboard:*, device:*, scene:*, automation:*, schedule:*`) that
 * appears nowhere in the backend. It was a fabricated contract on a live product surface.
 * The real enforcement surface is exactly the set of strings passed to
 * `@RequirePermission(...)`, and nothing else — a route without the decorator passes
 * untouched, so no other permission string is meaningful.
 *
 * This file is the single source of truth for that set, so the UI can read it from the
 * API instead of inventing it. `rbac-permission-catalog.spec.ts` scans the controllers and
 * fails if this list and the decorators ever disagree in either direction, so the catalog
 * cannot silently drift from enforcement.
 */

export interface RbacPermissionDefinition {
  /** The exact string passed to @RequirePermission. */
  permission: string;
  /** Resource bucket, derived from the permission prefix by RbacPermissionGuard. */
  resourceType: string;
  /** What the permission authorises, stated in terms of the routes that enforce it. */
  description: string;
}

export const RBAC_PERMISSION_CATALOG: readonly RbacPermissionDefinition[] = [
  {
    permission: 'device.provision',
    resourceType: 'device',
    description:
      'Mendaftarkan device baru ke tenant, termasuk menerbitkan provisioning token dan klaim pairing.',
  },
  {
    permission: 'device.update',
    resourceType: 'device',
    description:
      'Mengubah device yang sudah ada: device groups dan keanggotaannya, capability, dan metadata device.',
  },
  {
    permission: 'device.assignOwner',
    resourceType: 'device',
    description: 'Mengalihkan kepemilikan device ke membership lain dalam tenant yang sama.',
  },
  {
    permission: 'automation.read',
    resourceType: 'automation',
    description:
      'Membaca automation tenant. Repository hanya mengembalikan automation milik membership pemanggil, jadi satu anggota tidak dapat membaca automation anggota lain.',
  },
  {
    permission: 'automation.create',
    resourceType: 'automation',
    description: 'Membuat automation baru; kepemilikan otomatis tercatat pada membership pemanggil.',
  },
  {
    permission: 'automation.update',
    resourceType: 'automation',
    description:
      'Mengubah, mengaktifkan, dan menonaktifkan automation milik pemanggil. Admin tenant tidak mendapat akses otomatis ke automation milik anggota lain.',
  },
  {
    permission: 'automation.delete',
    resourceType: 'automation',
    description: 'Menghapus automation milik pemanggil, dengan pemeriksaan revisi yang sama seperti perubahan.',
  },
  {
    permission: 'dashboard.read',
    resourceType: 'dashboard',
    description:
      'Membaca dashboard yang boleh dilihat pemanggil: dashboard PERSONAL miliknya sendiri dan dashboard TENANT_SHARED milik tenant.',
  },
  {
    permission: 'dashboard.create',
    resourceType: 'dashboard',
    description: 'Membuat dashboard baru; audience dan kepemilikan ditetapkan dari role pemanggil.',
  },
  {
    permission: 'dashboard.update',
    resourceType: 'dashboard',
    description:
      'Mengubah dashboard PERSONAL milik pemanggil sendiri. Dashboard TENANT_SHARED hanya boleh diubah admin tenant.',
  },
  {
    permission: 'dashboard.delete',
    resourceType: 'dashboard',
    description:
      'Menghapus dashboard PERSONAL milik pemanggil sendiri. Dashboard TENANT_SHARED hanya boleh dihapus admin tenant.',
  },
] as const;

/**
 * The per-domain access model, stated once so the UI and the API cannot describe it differently.
 *
 * This was read off the repositories rather than assumed. `AutomationRepository` filters every
 * query by `ownerMembershipId`, so automation is owner-only with no admin override.
 * `DashboardRepository` has an `audience` column and an explicit `assertMutationAccess`: PERSONAL
 * is owner-only, TENANT_SHARED requires an admin role plus a `canManageShared` request flag.
 *
 * `Scene` and `Schedule` have no owner column at all. Gating them on a role today would either
 * lock ordinary members out of the product's daily function or permit everything, so they stay
 * open and are audited instead. Those audit rows are the evidence for whether an owner column is
 * worth adding, which is a product decision rather than a refactor.
 */
export const RBAC_OWNERSHIP_MODEL = {
  automation:
    'Milik pemanggil saja. Automation query selalu difilter ownerMembershipId, jadi admin tenant pun tidak dapat mengubah atau menghapus automation milik anggota lain.',
  dashboard:
    'PERSONAL hanya untuk pemiliknya. TENANT_SHARED hanya untuk admin tenant, dan hanya bila permintaan menyatakan canManageShared.',
  scene:
    'Tidak ada kolom pemilik dan tidak ada role gate. Semua membership aktif dalam tenant boleh mengubah, dan setiap perubahan kini tercatat di RbacAuditLog.',
  schedule:
    'Tidak ada kolom pemilik dan tidak ada role gate. Semua membership aktif dalam tenant boleh mengubah, dan setiap perubahan kini tercatat di RbacAuditLog.',
} as const;

/**
 * How ADMIN/PLATFORM_ADMIN are actually treated by the policy engine. Stated explicitly
 * because it is a blanket wildcard, not a per-domain permission set — the previous UI
 * implied the opposite by listing domain-scoped permissions for ADMIN.
 */
export const RBAC_BASE_ROLE_MODEL = {
  ADMIN: 'Wildcard: RbacPolicyService short-circuits to allowed=true for every route.',
  PLATFORM_ADMIN:
    'Wildcard on any valid tenant context, identical to ADMIN plus platform-guarded routes.',
  MEMBER:
    'Denied unless a CustomRole assigned through MembershipRoleOverride grants the exact permission, or the literal "*" wildcard.',
} as const;

export function findPermissionDefinition(permission: string) {
  return RBAC_PERMISSION_CATALOG.find((entry) => entry.permission === permission);
}
