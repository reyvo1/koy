import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  RBAC_BASE_ROLE_MODEL,
  RBAC_PERMISSION_CATALOG,
} from './rbac-permission-catalog';

const SRC_ROOT = join(__dirname, '..');

/**
 * Walks the real controller sources and collects every string passed to
 * `@RequirePermission(...)`. This is the enforcement surface, so it is the ground truth the
 * catalog has to match — in both directions, because a stale entry would let the console
 * advertise a permission nothing checks, and a missing entry would hide one that does.
 */
function collectDecoratedPermissions(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      collectDecoratedPermissions(path, acc);
      continue;
    }
    if (!name.endsWith('.controller.ts')) continue;
    const source = readFileSync(path, 'utf8');
    // The trailing `[^)]*` matters: `@RequirePermission` now takes an optional options object
    // (`{ allowOwner: true }`), and a pattern that required a closing paren straight after the
    // string silently collected nothing from every owned-resource route. The catalog then
    // looked fabricated while the decorators were all present and correct.
    for (const match of source.matchAll(/@RequirePermission\(\s*'([^']+)'[^)]*\)/g)) {
      acc.push(match[1]);
    }
  }
  return acc;
}

describe('RBAC permission catalog', () => {
  const decorated = Array.from(new Set(collectDecoratedPermissions(SRC_ROOT))).sort();
  const catalogued = Array.from(
    new Set(RBAC_PERMISSION_CATALOG.map((entry) => entry.permission)),
  ).sort();

  it('matches every @RequirePermission string exactly, in both directions', () => {
    expect(catalogued).toEqual(decorated);
  });

  it('never advertises a permission the backend does not enforce', () => {
    // The specific regression this file exists to prevent: the console displayed
    // `dashboard:*, device:*, scene:*, automation:*, schedule:*`, none of which appear
    // anywhere in the API.
    const fabricated = catalogued.filter((permission) => !decorated.includes(permission));
    expect(fabricated).toEqual([]);
  });

  it('collects permissions declared with the options form as well as the bare form', () => {
    // Regression guard for the collector above: with `automation.*` and `dashboard.*` declared as
    // `@RequirePermission('x.y', { allowOwner: true })`, a pattern requiring `)` right after the
    // string collects none of them and the parity test fails for the wrong reason.
    const source = readFileSync(join(SRC_ROOT, 'automation/automation.controller.ts'), 'utf8');
    const withOptions = source.match(
      /@RequirePermission\(\s*'automation\.[a-z]+'\s*,\s*\{/g,
    );
    expect(withOptions?.length ?? 0).toBeGreaterThan(0);
    expect(source).toContain("'automation.create'");
  });

  it('derives resourceType the same way RbacPermissionGuard does', () => {
    // The guard splits on '.' and uses the prefix as resourceType, so a catalog entry whose
    // resourceType disagrees with that split would describe a bucket the audit log never sees.
    for (const entry of RBAC_PERMISSION_CATALOG) {
      expect(entry.resourceType).toBe(entry.permission.split('.')[0]);
    }
  });

  it('has a non-empty description for every permission', () => {
    for (const entry of RBAC_PERMISSION_CATALOG) {
      expect(entry.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('states the base-role model as a wildcard rather than a domain permission set', () => {
    // Guards the corrected claim: ADMIN/PLATFORM_ADMIN are short-circuited to allowed=true,
    // so describing them with per-domain permissions would be a second fabrication.
    expect(RBAC_BASE_ROLE_MODEL.ADMIN).toContain('Wildcard');
    expect(RBAC_BASE_ROLE_MODEL.PLATFORM_ADMIN).toContain('Wildcard');
    expect(RBAC_BASE_ROLE_MODEL.MEMBER).toContain('CustomRole');
  });
});
