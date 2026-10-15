/**
 * Admin Web navigation parity contract.
 *
 * Defect this prevents: a sidebar/menu entry that points at a page which does not exist
 * (a dead menu), or a tenant-capable shell that keeps a PRIVATE copy of the tenant
 * navigation and drifts so a newly shipped production route silently disappears from the
 * field/lab/quick-access surfaces. docs/PRODUCT-SURFACE-AUDIT-2026-10-07.md concluded the
 * static inspection found no broad class of static placeholder menu pages and no dead
 * menus ("tidak ditemukan menu mati"): every Super Admin canonical target, every Tenant
 * Admin canonical target and every field/lab QUARANTINE entry resolves to a real page, and
 * TenantShell / AdminShellV3 / the operational-summary quick access all import the single
 * `TENANT_NAV_GROUPS` model instead of a private href list. This contract LOCKS that
 * invariant from the current source so a regression fails CI:
 *   - a new shell link with no resolvable `page.tsx`, or
 *   - a shell that reintroduces its own tenant href list (a link outside the canonical
 *     set that is neither a canonical tenant route nor an allowlisted quarantine page).
 *
 * Sets are derived from the source, never asserted to a fixed total, so an unrelated NEW
 * page or menu item cannot break these checks — only a link with no resolvable page can.
 *
 * Source sets used (verified by reading the current files):
 *   - Super Admin sidebar: `href: '...'` items parsed from apps/admin-web/components/super-admin-shell.tsx
 *     (24 hrefs, incl. the /noc beta entry). One entry (`/noc`) is deliberately labelled quarantine.
 *   - Tenant canonical menu: `href: '...'` items parsed from apps/admin-web/lib/tenant-navigation.ts (23).
 *   - Shell derivatives: tenant-shell.tsx (`NAV_GROUPS = TENANT_NAV_GROUPS`),
 *     admin-shell-v3.tsx (`...TENANT_NAV_GROUPS` + a quarantine lab group {/technician,/cctv,/mobile-preview}),
 *     operational-summary-experience.tsx (`NAV_SECTIONS = TENANT_NAV_GROUPS`).
 *   - Existing pages: routes derived from a readdirSync walk of apps/admin-web/app (any
 *     depth) collecting every page.tsx.
 *   - Fail-closed allowlist (verified honest, read each): telemetry-stream/route.ts (STREAM_NOT_READY
 *     503) and the "Belum tersedia" roadmap disclosure on super/ai/page.tsx.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const ADMIN_APP = join(root, 'apps/admin-web/app');

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// Derive the set of real page routes from the file tree, not a hard-coded list.
function existingPageRoutes(appRoot: string): Set<string> {
  const routes = new Set<string>();
  for (const file of walkFiles(appRoot)) {
    if (!/\/page\.tsx?$/.test(file)) continue;
    const route = `/${file.slice(appRoot.length + 1).replace(/\/page\.tsx?$/, '')}`;
    routes.add(route);
  }
  return routes;
}

function unresolvedRoutes(routes: Set<string>, hrefs: readonly string[]): string[] {
  return hrefs.filter((href) => href !== '/' && !routes.has(href));
}

const superShell = read('apps/admin-web/components/super-admin-shell.tsx');
const tenantNav = read('apps/admin-web/lib/tenant-navigation.ts');
// The nav arrays use single-quoted `href: '/...'` items; `homeHref="/..."` (double quote,
// a `=`) is intentionally excluded here so the count reflects menu items only.
const superHrefs = [...superShell.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
const tenantHrefs = [...tenantNav.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
const routes = existingPageRoutes(ADMIN_APP);

describe('Admin Web navigation parity (no dead menus, canonical single-source sidebar)', () => {
  it('ships every Super Admin sidebar link to a resolvable page.tsx', () => {
    // Known anchors prove the parse extracted real items (not a vacuous empty set).
    expect(superHrefs.length).toBeGreaterThanOrEqual(20);
    expect(superHrefs).toContain('/super/dashboard');
    expect(superHrefs).toContain('/super/security');
    // The only non-/super entry (/noc) must stay visibly quarantine-labelled, never silently promoted.
    expect(superShell).toContain('belum produksi');
    expect(unresolvedRoutes(routes, superHrefs)).toEqual([]);
  });

  it('ships every canonical Tenant Admin menu link to a resolvable page.tsx', () => {
    expect(tenantHrefs.length).toBeGreaterThanOrEqual(20);
    expect(tenantHrefs).toContain('/tenant/dashboard');
    expect(tenantHrefs).toContain('/tenant/pengguna');
    expect(unresolvedRoutes(routes, tenantHrefs)).toEqual([]);
  });

  it('derives every tenant-capable sidebar from the single canonical TENANT_NAV_GROUPS model', () => {
    const tenantShell = read('apps/admin-web/components/tenant-shell.tsx');
    const fieldShell = read('apps/admin-web/components/admin-shell-v3.tsx');
    const summary = read('apps/admin-web/components/operational-summary-experience.tsx');

    expect(tenantShell).toContain("import { TENANT_NAV_GROUPS } from '@/lib/tenant-navigation'");
    expect(tenantShell).toContain('const NAV_GROUPS = TENANT_NAV_GROUPS;');
    expect(fieldShell).toContain('...TENANT_NAV_GROUPS,');
    expect(summary).toContain("import { TENANT_NAV_GROUPS } from '@/lib/tenant-navigation'");
    expect(summary).toContain('const NAV_SECTIONS = TENANT_NAV_GROUPS;');
  });

  it('keeps every field-shell sidebar href inside the canonical list plus the documented quarantine allowlist', () => {
    const tenantShell = read('apps/admin-web/components/tenant-shell.tsx');
    const fieldShell = read('apps/admin-web/components/admin-shell-v3.tsx');
    // Quarantine pages are legitimately outside the canonical tenant list; each must resolve
    // to a real page and stay under an explicit "Laboratorium · belum produksi" group.
    const QUARANTINE_EXTRA = ['/technician', '/cctv', '/mobile-preview'];
    for (const href of QUARANTINE_EXTRA) {
      expect(routes.has(href)).toBe(true);
    }
    expect(fieldShell).toContain('Laboratorium');
    expect(fieldShell).toContain('belum produksi');

    const allowed = new Set<string>([...tenantHrefs, ...QUARANTINE_EXTRA]);
    for (const shell of [tenantShell, fieldShell]) {
      const literals = [...shell.matchAll(/href\s*[:=]\s*['"]([^'"]+)['"]/gi)].map((m) => m[1]);
      for (const href of literals) {
        expect(allowed.has(href)).toBe(true);
      }
    }
  });

  it('has no static placeholder stub page among admin-web page surfaces', () => {
    const pageFiles = walkFiles(ADMIN_APP).filter((f) => /\/page\.tsx?$/.test(f));
    expect(pageFiles.length).toBeGreaterThan(0);
    // Genuine stub markers. "belum tersedia" is handled separately as a possibly-honest
    // fail-closed string (see the next test) rather than a stub marker.
    const STUB_PATTERNS: RegExp[] = [
      /coming\s*soon/i,
      /comingsoon/i,
      /segera\s*hadir/i,
      /sedang\s*dikembang/i,
      /dalam\s+pengembangan/i,
      /under\s+construction/i,
      /belum\s+diimplementasi/i,
      /not\s+implemented/i,
      /placeholder\s+page/i,
      /\bTODO\b/,
      /\bFIXME\b/,
    ];
    const stubHits: string[] = [];
    for (const file of pageFiles) {
      const src = readFileSync(file, 'utf8');
      for (const pattern of STUB_PATTERNS) {
        if (pattern.test(src)) stubHits.push(`${file} :: ${pattern}`);
      }
    }
    expect(stubHits).toEqual([]);
  });

  it('confines every fail-closed "belum tersedia" string to a documented honest route response', () => {
    const relFrom = (file: string): string => file.slice(root.length + 1);
    // Verified by reading each file; only honest fail-closed / empty-roadmap states are allowlisted:
    const FAIL_CLOSED_ALLOWLIST = [
      {
        file: 'apps/admin-web/app/api/admin/telemetry-stream/route.ts',
        contains: 'stream belum tersedia',
        reason: 'honest 503 STREAM_NOT_READY when the backend telemetry-stream forward fails or returns no body',
      },
      {
        file: 'apps/admin-web/app/super/ai/page.tsx',
        contains: 'Belum tersedia',
        reason:
          'honest roadmap disclosure: the "Belum tersedia"/"Belum ada" section states planned detector capabilities do not exist and that no detector/endpoint/config produces them — the inverse of a misleading placeholder',
      },
    ];
    for (const entry of FAIL_CLOSED_ALLOWLIST) {
      expect(read(entry.file)).toContain(entry.contains);
    }

    const boundary = walkFiles(ADMIN_APP).filter((f) =>
      /(?:^|\/)(page|route|error|not-found|loading|template|default)\.tsx?$/.test(f),
    );
    const flagged = boundary
      .filter((f) => /belum\s+tersedia/i.test(readFileSync(f, 'utf8')))
      .map(relFrom);
    const allowedFiles = new Set(FAIL_CLOSED_ALLOWLIST.map((e) => e.file));
    // No surface-boundary file may carry a "belum tersedia" string that is not allowlisted.
    expect(flagged.filter((f) => !allowedFiles.has(f))).toEqual([]);
    // The allowlist is non-vacuous: exactly the documented honest strings are present.
    expect(new Set(flagged)).toEqual(allowedFiles);
  });
});
