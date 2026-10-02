import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
const runner = read('scripts/run-secret-scan.mjs');
const workflow = read('.github/workflows/ci.yml');

/**
 * Wave 13 secret scanning.
 *
 * A secret scan is only worth having if it can fail. These assertions check the two properties that make it
 * a gate rather than a report: it is wired into CI, and it rejects credential material rather than printing
 * it and continuing.
 */
describe('Wave 13 secret scanning', () => {
  it('is runnable by hand and wired into CI', () => {
    expect(pkg.scripts['security:secrets:scan']).toBe('node scripts/run-secret-scan.mjs');
    expect(workflow).toMatch(/security:secrets:scan/);
  });

  it('uses a real scanner, not a hand-rolled approximation', () => {
    expect(pkg.devDependencies.secretlint).toBeDefined();
    expect(runner).toMatch(/secretlint/);
  });

  describe('it covers the whole tree, including the paths it excludes', () => {
    it('scans every tracked file with the strict detector', () => {
      // The bug this guards against: running the narrow detector only over EXCLUDED files, which left a real
      // AWS key in src/ passing silently because secretlint's recommend preset carries no AWS rule at all.
      expect(runner).toMatch(/strictScan\(all\)/);
    });

    it('detects credential shapes secretlint does not ship a rule for', () => {
      // Pattern fragments as written, not invented literals: the GitHub rule is a character class
      // (gh[pousr]_), so asserting on the string "ghp_" would be asserting something the file never said.
      for (const shape of ['AKIA', 'gh[pousr]_', 'xox', 'sk_live_', 'PRIVATE KEY', 'AIza', 'eyJ']) {
        expect(runner).toContain(shape);
      }
    });

    it('pins the fixture TLS keys by content so a real key cannot hide there', () => {
      expect(runner).toMatch(/PINNED_FIXTURE_KEYS/);
      expect(runner).toMatch(/createHash\('sha256'\)/);
    });
  });

  describe('it fails rather than reporting', () => {
    it('exits non-zero on a finding', () => {
      expect(runner).toMatch(/process\.exit\(1\)/);
      expect(runner).toMatch(/SECRET SCAN FAILED/);
    });

    it('has no blanket suppression: allowlist entries need a substantive reason', () => {
      expect(runner).toMatch(/reason/);
      expect(runner).toMatch(/length < 20|trim\(\)\.length/);
      expect(runner).toMatch(/unregistered/);
    });

    it('treats a missing allowlist entry as a failure, not a pass', () => {
      expect(runner).toMatch(/unregistered\.length > 0/);
    });

    it('does not ignore a missing config: a scan without rules is not a scan', () => {
      expect(existsSync(resolve(root, '.secretlintrc.json'))).toBe(true);
      expect(runner).toMatch(/\.secretlintrc\.json is missing/);
    });
  });

  describe('the policy is written down', () => {
    it('documents why each exclusion exists', () => {
      expect(read('docs/SECRET-SCAN-POLICY.md')).toMatch(/fixtures/);
    });

    it('keeps every registered false positive justified', () => {
      const policy = JSON.parse(read('ops/security/secret-scan-allowlist.json')) as {
        entries: Array<{ file: string; rule: string; reason: string }>;
      };
      expect(policy.entries.length).toBeGreaterThan(0);
      for (const entry of policy.entries) {
        expect(entry.reason.trim().length).toBeGreaterThan(20);
      }
    });
  });
});
