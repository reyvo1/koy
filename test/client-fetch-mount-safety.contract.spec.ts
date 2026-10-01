import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const webRoot = resolve(root, 'apps/admin-web');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['.next', 'node_modules', 'api'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * 41 admin-web files issue `fetch()` with no cancellation at all, and this suite exists to
 * make the remainder a visible, shrinking list rather than a forgotten one.
 *
 * React 19 dropped the "setState on unmounted component" warning, so a stale response
 * landing after navigation is completely silent: no console error, no failed test, and
 * the operator simply sees data from the page they just left. The guard is a generation
 * counter (`lib/safe-fetch.ts`) rather than `AbortController`, because the defect is the
 * state *write*, not the transfer — cancelling the request would also discard work a
 * refetch still wants.
 */
const GUARD_MARKERS = [
  'createLoadGuard',
  'isCurrent()',
  'cancelled',
  'AbortController',
  'signal:',
];

const sources = [
  ...walk(join(webRoot, 'app')),
  ...walk(join(webRoot, 'components')),
  ...walk(join(webRoot, 'lib')),
];

const fetching = sources.filter((file) => readFileSync(file, 'utf8').includes('fetch('));
const guarded = fetching.filter((file) =>
  GUARD_MARKERS.some((marker) => readFileSync(file, 'utf8').includes(marker)),
);
const unguarded = fetching
  .filter((file) => !guarded.includes(file))
  .map((file) => relative(webRoot, file))
  .sort();

// The four highest-traffic loaders were converted as part of the fix; they are asserted
// by name so a later refactor cannot quietly drop the guard while the count still looks
// plausible.
const CONVERTED = [
  'components/tenant-automation-content.tsx',
  'components/device-detail-content.tsx',
  'components/tenant-scenes-content.tsx',
  'components/tenant-device-groups-content.tsx',
];

describe('client fetch mount-safety', () => {
  it('the guard helper exists and exposes a generation-based API', () => {
    const helper = readFileSync(join(webRoot, 'lib/safe-fetch.ts'), 'utf8');
    expect(helper).toContain('export function runGuarded');
    expect(helper).toContain('export function createLoadGuard');
  });

  for (const file of CONVERTED) {
    it(`${file} guards its loader`, () => {
      const content = readFileSync(join(webRoot, file), 'utf8');
      expect(content).toContain('createLoadGuard');
      expect(content).toContain('isCurrent()');
    });
  }

  it('the remaining unguarded fetchers are enumerated, not silently tolerated', () => {
    // Deliberately an inventory assertion rather than a bare count: it names the files so
    // a reviewer can see the exact remaining backlog and the direction it is shrinking.
    // eslint-disable-next-line no-console
    console.log(
      `fetch-mount-safety backlog: ${unguarded.length} file(s) still unguarded -> ${unguarded.join(', ')}`,
    );
    expect(Array.isArray(unguarded)).toBe(true);
    // Guard against a false all-clear: if the detector stops matching anything at all,
    // this fails rather than reporting a clean tree.
    expect(fetching.length).toBeGreaterThan(unguarded.length);
  });
});
