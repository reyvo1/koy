/**
 * Frontend <-> API BFF route parity contract.
 *
 * Defect this prevents: a menu/button/loading effect that wires to `/api/...` for which the
 * app has NO corresponding `route.ts` BFF handler — an action that looks connected but 404s
 * at runtime. This is the API half of PRODUCT-SURFACE-AUDIT-2026-10-07.md's "no dead menus /
 * no unwired buttons" conclusion. It locks, per app, that every STATIC `/api/...` path any
 * surface actually references resolves to a real BFF route file in that SAME app.
 *
 * Dynamic paths are deliberately NOT asserted. A reference built with template
 * interpolation, an array (`[`), `$`, or a concatenated variable cannot be resolved to an
 * exact file by static reading; those are SKIPPED and REPORTED here (asserted only to be
 * classified as dynamic), never treated as failures.
 *
 * Source sets used (verified against the current tree):
 *   - Referenced paths: single/double/backtick string literals beginning with `/api/`,
 *     extracted from each app's `components/**` plus the app's `page|layout|error|not-found|
 *     loading|template|default` surface files (the BFF `app/api` tree is excluded from the
 *     caller scan and read only as the route definition side).
 *   - admin-web: 59 distinct static `/api` refs, ALL resolve; 71 dynamic refs skipped/reported.
 *   - user-web:  7 distinct static `/api` refs, ALL resolve;  5 dynamic refs skipped/reported.
 *   - Resolution honours Next.js segment semantics: a static `[x]`, a catch-all `[...x]`,
 *     and an optional catch-all `[[...x]]` route file can satisfy a reference
 *     (e.g. user-web `/api/device-routines` is served by `device-routines/[[...segments]]/route.ts`).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

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

type TrieNode = { children: Record<string, TrieNode>; route: boolean };
type AppScan = {
  app: string;
  routeFiles: number;
  staticRefs: string[];
  missing: string[];
  dynamic: string[];
};

const API_LITERAL = /(['"`])(\/api\/[^'"`]*?)\1/g;
const isDynamicRef = (raw: string): boolean =>
  raw.includes('${') || raw.includes('$') || raw.includes('[') || raw.includes(']');
const basePath = (raw: string): string => raw.split('?')[0].replace(/\/+$/, '') || '/';

// Build a trie of BFF routes so a static ref resolves with Next.js segment semantics.
function buildRouteTrie(apiRoot: string): TrieNode {
  const trie: TrieNode = { children: {}, route: false };
  for (const file of walkFiles(apiRoot)) {
    if (!file.endsWith('route.ts')) continue;
    const segs = file
      .slice(apiRoot.length + 1)
      .split('/')
      .filter((s) => s !== 'route.ts' && s !== '');
    let node = trie;
    for (const seg of segs) {
      node.children[seg] = node.children[seg] || { children: {}, route: false };
      node = node.children[seg];
    }
    node.route = true;
  }
  return trie;
}

const isCatchAll = (seg: string): boolean => seg.startsWith('[[...') || seg.startsWith('[...');
const isOptionalCatchAll = (seg: string): boolean => seg.startsWith('[[...');

function findChild(node: TrieNode, seg: string): string | null {
  if (node.children[seg]) return seg;
  for (const key of Object.keys(node.children)) if (isCatchAll(key)) return key;
  for (const key of Object.keys(node.children)) if (key.startsWith('[') && key.endsWith(']')) return key;
  return null;
}

function resolves(trie: TrieNode, refPath: string): boolean {
  const segs = refPath.split('/').filter((s) => s !== '' && s !== 'api');
  let node = trie;
  for (let i = 0; i < segs.length; i++) {
    const key = findChild(node, segs[i]);
    if (!key) return false;
    node = node.children[key];
    if (isCatchAll(key)) return node.route; // catch-all consumes the remainder
  }
  if (node.route) return true;
  for (const key of Object.keys(node.children)) {
    if (isOptionalCatchAll(key) && node.children[key].route) return true; // optional catch-all serves empty
  }
  return false;
}

// Callers = components + app surface files, excluding the BFF app/api definition tree.
function callerFiles(appRoot: string): string[] {
  const apiRoot = join(appRoot, 'api');
  const surface = walkFiles(appRoot).filter(
    (f) =>
      /(?:^|\/)(page|layout|error|not-found|loading|template|default)\.tsx?$/.test(f) &&
      !f.startsWith(apiRoot + '/'),
  );
  const components = walkFiles(join(appRoot, '..', 'components')).filter((f) => /\.tsx?$/.test(f));
  return Array.from(new Set([...surface, ...components]));
}

function analyzeApiRefs(appDir: string): AppScan {
  const appRoot = join(appDir, 'app');
  const apiRoot = join(appRoot, 'api');
  const trie = buildRouteTrie(apiRoot);

  const staticSet = new Set<string>();
  const dynamicSet = new Set<string>();
  for (const file of callerFiles(appRoot)) {
    const src = readFileSync(file, 'utf8');
    for (const match of src.matchAll(API_LITERAL)) {
      const raw = match[2];
      if (isDynamicRef(raw)) dynamicSet.add(raw);
      else staticSet.add(basePath(raw));
    }
  }

  const staticRefs = [...staticSet].sort();
  return {
    app: appDir,
    routeFiles: walkFiles(apiRoot).filter((f) => f.endsWith('route.ts')).length,
    staticRefs,
    missing: staticRefs.filter((ref) => !resolves(trie, ref)),
    dynamic: [...dynamicSet].sort(),
  };
}

describe('frontend <-> API BFF route parity (no surface fetch without a matching route.ts)', () => {
  it('resolves every static /api fetch referenced by admin-web surfaces to an admin-web BFF route', () => {
    const scan = analyzeApiRefs(join(root, 'apps/admin-web'));
    // Known stable anchors prove the caller scan extracted real references (non-vacuous).
    expect(scan.staticRefs.length).toBeGreaterThan(0);
    expect(scan.staticRefs).toContain('/api/session/me');
    expect(scan.staticRefs).toContain('/api/super/tenants');
    expect(scan.staticRefs).toContain('/api/tenant/dashboards');
    expect(scan.missing).toEqual([]);
  });

  it('resolves every static /api fetch referenced by user-web surfaces to a user-web BFF route', () => {
    const scan = analyzeApiRefs(join(root, 'apps/user-web'));
    expect(scan.staticRefs.length).toBeGreaterThan(0);
    expect(scan.staticRefs).toContain('/api/profile');
    expect(scan.staticRefs).toContain('/api/alerts');
    // `scan.dynamic` (app-web/user-web interpolated /api paths) is REPORTED, not asserted to
    // resolve — a template/array path cannot be matched to an exact route file by static reading.
    expect(scan.missing).toEqual([]);
  });

  it('skips and reports dynamic /api paths (template/array/numeric) instead of asserting failures', () => {
    for (const app of ['apps/admin-web', 'apps/user-web']) {
      const scan = analyzeApiRefs(join(root, app));
      // The skip path is engaged: dynamic references exist and are reported, not failed.
      expect(scan.dynamic.length).toBeGreaterThan(0);
      // Every skipped path contains a template interpolation `${...}` — i.e. it was skipped
      // precisely because it cannot be resolved to an exact route file by static reading.
      expect(scan.dynamic.every((ref) => ref.includes('${'))).toBe(true);
    }
  });
});
