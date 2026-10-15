/**
 * User Web surface completeness contract.
 *
 * Defect this prevents: a User Web menu item that points at a page which does not exist
 * (a dead menu), or a top-level User Web page that no shell menu can reach (an orphan page
 * you can only open by typing the URL), or a page.tsx that is a static placeholder stub.
 * docs/PRODUCT-SURFACE-AUDIT-2026-10-07.md recorded User Web as 7/7 governed menu entries,
 * each with a real page, and found no broad class of static placeholder menu pages. The
 * user-shell docblock is explicit that the menu "is asserted against the route map ... so a
 * new User Web page cannot be added without either a menu entry or an explicit quarantine."
 * This contract LOCKS that bidirectionally from the current source:
 *   - the seven canonical targets are present in the shell nav AND each resolves to a page.tsx;
 *   - every top-level User Web page directory is reachable from the shell nav (no orphan);
 *   - no page surface is a static placeholder stub, and every fail-closed "belum tersedia"
 *     string is confined to a documented honest route response.
 *
 * Both nav targets and reachable pages are derived from the source / file tree, so an
 * unrelated new nested page cannot break these checks.
 *
 * Source sets used (verified by reading the current files):
 *   - Shell nav: `href: '...'` items parsed from apps/user-web/components/user-shell.tsx (7 targets).
 *   - Reachable top-level pages: immediate child dirs of apps/user-web/app that contain a
 *     page.tsx (excluding the api subtree) — derived via readdirSync, must equal the nav set.
 *   - Honest fail-closed string: apps/user-web/app/api/device-routines/[[...segments]]/route.ts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const USER_APP = join(root, 'apps/user-web/app');

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

const userShell = read('apps/user-web/components/user-shell.tsx');
const navTargets = [...userShell.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);

describe('User Web surface completeness (every governed target reachable, no stub pages)', () => {
  it('exposes all seven canonical User Web targets as real pages', () => {
    expect(navTargets.length).toBe(7);
    for (const target of navTargets) {
      expect(existsSync(join(USER_APP, target.slice(1), 'page.tsx'))).toBe(true);
    }
  });

  it('keeps every top-level User Web page reachable from the shell menu (no orphan pages)', () => {
    const topRoutes = new Set<string>();
    for (const name of readdirSync(USER_APP)) {
      const dir = join(USER_APP, name);
      if (!statSync(dir).isDirectory()) continue;
      if (name === 'api') continue; // BFF routes are not navigable pages
      if (existsSync(join(dir, 'page.tsx'))) topRoutes.add(`/${name}`);
    }

    // Every menu item is a real top-level page.
    for (const target of navTargets) {
      expect(topRoutes.has(target)).toBe(true);
    }
    // Every top-level page is reachable from the menu (no orphan).
    for (const route of topRoutes) {
      expect(navTargets.includes(route)).toBe(true);
    }
    // The governed menu and the reachable page set are exactly the seven canonical targets.
    expect([...topRoutes].sort()).toEqual([...navTargets].sort());
  });

  it('has no static placeholder stub page among User Web surfaces', () => {
    const pageFiles = walkFiles(USER_APP).filter((f) => /\/page\.tsx?$/.test(f));
    expect(pageFiles.length).toBeGreaterThan(0);
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
    // Verified by reading: this is an honest 503 (runtime routine service unavailable), not a stub.
    const FAIL_CLOSED_ALLOWLIST = [
      {
        file: 'apps/user-web/app/api/device-routines/[[...segments]]/route.ts',
        contains: 'Runtime layanan belum tersedia.',
        reason: 'honest 503 when the device-routine runtime service is unavailable',
      },
    ];
    for (const entry of FAIL_CLOSED_ALLOWLIST) {
      expect(read(entry.file)).toContain(entry.contains);
    }

    const boundary = walkFiles(USER_APP).filter((f) =>
      /(?:^|\/)(page|route|error|not-found|loading|template|default)\.tsx?$/.test(f),
    );
    const flagged = boundary
      .filter((f) => /belum\s+tersedia/i.test(readFileSync(f, 'utf8')))
      .map(relFrom);
    const allowedFiles = new Set(FAIL_CLOSED_ALLOWLIST.map((e) => e.file));
    expect(flagged.filter((f) => !allowedFiles.has(f))).toEqual([]);
    expect(new Set(flagged)).toEqual(allowedFiles);
  });
});
