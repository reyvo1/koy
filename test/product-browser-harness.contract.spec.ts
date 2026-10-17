/**
 * Product browser harness chrome lifecycle contract.
 *
 * Defect this prevents: `npm run product:browser:test` — the BROWSER_FIXTURE evidence run for the
 * User Web product flows — treated every slow or crashed headless Chrome launch as one flat
 * `Chrome unavailable` verdict: a nine-second poll, no spawn-error or early-exit visibility, and no
 * relaunch. One koy acceptance run failed this way on a cold runner while every assertion in the
 * script was healthy, and it only passed on a full rerun. A test harness that cannot tell "Chrome
 * was slow to start" from "the product is broken" forces reruns and erodes the meaning of a red
 * run. This contract locks the 2026-10-17 hardening:
 *   - the DevTools wait carries a 30s bounded deadline (cold starts are tolerated, hangs are not);
 *   - spawn error, early exit and timeout each get their own message instead of one verdict;
 *   - one relaunch with a fresh profile absorbs a one-off launch crash, and the second failure is
 *     still a failure;
 *   - cleanup tolerates a Chrome process that never spawned, and every product assertion in the
 *     script is untouched (still asserts zero page errors and the decoded camera frames).
 *
 * Source set used: scripts/test-product-browser.mjs (the harness itself).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

const HARNESS = 'scripts/test-product-browser.mjs';

describe('Product browser harness chrome lifecycle (bounded wait, honest failure class, one relaunch)', () => {
  const harness = read(HARNESS);

  it('waits with a bounded deadline and names the failure class it actually hit', () => {
    expect(harness).toContain('async function launchChromeAndWait()');
    expect(harness).toContain('Date.now() + 30000');
    expect(harness).toContain('could not launch google-chrome');
    expect(harness).toContain('process exited early with code');
    expect(harness).toContain('DevTools endpoint did not answer within 30s');
    expect(harness).not.toContain("throw new Error('Chrome unavailable');");
  });

  it('relaunches once with a fresh profile and never touches the assertions', () => {
    expect(harness).toContain('launch <= 2');
    expect(harness).toContain('const launched = await launchChrome();');
    expect(harness).toContain('if (chrome) chrome.kill();');
    expect(harness).toContain('assert.equal(errors.length, 0, errors.join');
    expect(harness).toContain(
      'PASS synthetic camera frames decoded by product CameraPlayer',
    );
  });

  it('classifies itself as a current-state contract', () => {
    const policy = JSON.parse(read('test/contract-surface-policy.json')) as {
      contractClasses: Record<string, string>;
    };
    expect(
      policy.contractClasses['test/product-browser-harness.contract.spec.ts'],
    ).toBe('current-state');
  });
});
