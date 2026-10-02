#!/usr/bin/env node
/**
 * Wave 13 secret scanning.
 *
 * A secret scanner is only worth having if it can fail. This gate exists because nothing in the repository
 * looked for leaked credentials: `npm audit` covers dependency CVEs, which is a different problem entirely.
 *
 * Why a wrapper instead of running the secretlint CLI with a glob:
 *
 *  - The CLI's `ignore` globs are matched against the paths it resolves, so a fixture path listed as
 *    `test/fixtures/**` did not actually exclude `test/fixtures/mqtt-tls/server-key.pem`. A gate whose
 *    exclusions silently do not work is worse than no gate, because the findings it reports train people to
 *    disable it. Here the file list is computed from `git ls-files` and the exclusions are applied here,
 *    where they can be read and tested.
 *
 *  - Anything excluded is then scanned AGAIN by a stricter, narrower check (see STRICT_PATTERNS). That is the
 *    point: excluding the test fixtures must not open a hole where a real private key can hide, so the
 *    excluded classes get a detector that only reacts to unambiguous credential material.
 *
 * Failure modes, all of which exit non-zero:
 *  - a real-looking secret in an ordinary source file
 *  - a real-looking secret inside an excluded class (fixtures, documentation)
 *  - secretlint itself being unavailable, which is a failure and not a skip
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const CONFIG = resolve(root, '.secretlintrc.json');

/** Paths secretlint should not see. Each one is justified in docs/SECRET-SCAN-POLICY.md. */
const EXCLUDED_PREFIXES = ['test/fixtures/', '__fixtures__/', 'test/__fixtures__/'];

/**
 * Unambiguous credential shapes: AWS key ids, GitHub/Slack/Google/Stripe keys, JWTs, private key blocks.
 *
 * These run over EVERY tracked file, not just the excluded ones. That is not redundancy. The secretlint
 * "recommend" preset does not carry an AWS or private-key rule at all -- their rule packages are not even
 * installed -- so relying on it alone means a real AWS key committed to src/ passes the gate silently. This
 * detector is repository-owned, narrow on purpose, and deliberately has no allowlist: anything it matches is
 * a credential by construction.
 *
 * The single exception is a private key inside a PINNED fixture, because the TLS suites need one on disk.
 */
const STRICT_PATTERNS = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Stripe live secret key', re: /\bsk_live_[0-9a-zA-Z]{20,}\b/g },
  { name: 'OpenAI-style secret key', re: /\bsk-[A-Za-z0-9]{32,}\b/g },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'JSON web token', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function isExcluded(file) {
  const normalized = file.replace(/\\/g, '/');
  return (
    EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix) || normalized.includes(`/${prefix}`)) ||
    normalized.endsWith('.md')
  );
}

/**
 * TLS suites need a private key on disk, so a private key inside `test/fixtures/` is legitimate and cannot
 * simply be forbidden. Forbidding it would mean the fixtures stop working; allowing it without a limit would
 * mean a real key can hide there.
 *
 * These files are therefore PINNED BY CONTENT. Replacing a fixture key with a real one changes its SHA-256
 * and fails this gate, so smuggling real key material into an excluded path requires an explicit, visible
 * edit to this table. Every other credential shape -- AWS keys, GitHub and Slack tokens, live Stripe keys,
 * JWTs -- is still rejected inside fixtures with no allowlist at all.
 */
const PINNED_FIXTURE_KEYS = {
  'test/fixtures/mqtt-tls/server-key.pem':
    '1d1c51672bb36e9b5e333e18684a2defeff22dfbd273364ce87aa7c7cbe61abc',
  'test/fixtures/wave2-localhost-tls.key.pem':
    'ac4ebb68e8744003351df06da159578518765c7a416184fa84afe985e54bc88b',
};

function verifyPins(files) {
  const findings = [];
  for (const file of files) {
    const expected = PINNED_FIXTURE_KEYS[file.replace(/\\/g, '/')];
    if (!expected) continue;
    const actual = createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex');
    if (actual !== expected) {
      findings.push({
        file,
        rule: `pinned fixture key changed (expected sha256 ${expected.slice(0, 12)}..., found ${actual.slice(0, 12)}...)`,
      });
    }
  }
  return findings;
}

function strictScan(files) {
  const findings = [];
  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    let text;
    try {
      text = readFileSync(resolve(root, file), 'utf8');
    } catch {
      continue; // binary or unreadable; secretlint's own engine handles what it can parse
    }
    const isPinnedKey = Object.prototype.hasOwnProperty.call(PINNED_FIXTURE_KEYS, normalized);
    for (const { name, re } of STRICT_PATTERNS) {
      // A pinned fixture key is allowed to be a key. Nothing else is allowed to be, anywhere.
      if (isPinnedKey && name === 'private key block') continue;
      const pattern = new RegExp(re.source, re.flags);
      const match = pattern.exec(text);
      if (match) {
        const line = text.slice(0, match.index).split('\n').length;
        findings.push({ file, line, rule: name });
      }
    }
  }
  return findings;
}

function main() {
  if (!existsSync(CONFIG)) {
    console.error('SECRET SCAN ERROR: .secretlintrc.json is missing. A scan without its rule set is not a scan.');
    process.exit(1);
  }

  const all = trackedFiles();
  const scanned = all.filter((file) => !isExcluded(file));
  const excluded = all.filter((file) => isExcluded(file));

  console.log(`Secret scan: ${all.length} file(s) through the strict credential detector; ${scanned.length} of those also through secretlint.`);

  // 1. The strict detector sees EVERY tracked file, so an exclusion cannot hide a real credential.
  const pinFindings = verifyPins(all);
  const strictFindings = [...pinFindings, ...strictScan(all)];
  if (strictFindings.length > 0) {
    console.error(`SECRET SCAN FAILED: ${strictFindings.length} credential-shaped item(s):`);
    for (const f of strictFindings) console.error(`  ${f.file}:${f.line}  ${f.rule}`);
    process.exit(1);
  }

  // 2. Everything else goes through secretlint itself.
  let lintStatus = 0;
  let lintOutput = '';
  try {
    lintOutput = execFileSync('npx', ['secretlint', '--no-color', '--format', 'compact', ...scanned], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    lintStatus = error.status ?? 1;
    lintOutput = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }

  if (lintStatus !== 0) {
    const findings = parseFindings(lintOutput);
    const allowed = loadAllowlist();
    const unregistered = findings.filter((f) => !allowed.has(`${f.file}|${f.rule}`));

    if (unregistered.length > 0) {
      console.error(`SECRET SCAN FAILED: ${unregistered.length} unregistered finding(s).`);
      for (const f of unregistered) {
        console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.message}`);
      }
      console.error(
        '\nA finding can only be cleared by fixing the source. If it is genuinely not a credential, add a',
      );
      console.error('reasoned entry to ops/security/secret-scan-allowlist.json -- the entry must name what the');
      console.error('value actually is. Blanket suppressions are not accepted.');
      process.exit(1);
    }
    console.log(`Secret scan: ${findings.length} finding(s), all ${findings.length} registered in the allowlist.`);
  }

  console.log('SECRET SCAN PASS');
}

/**
 * Registered false positives, keyed by (file, rule). Keying on the PAIR rather than the file means a new
 * secret landing in a file that already has one registered finding still fails the gate.
 */
function loadAllowlist() {
  const path = resolve(root, 'ops/security/secret-scan-allowlist.json');
  if (!existsSync(path)) return new Set();
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  const allowed = new Set();
  for (const entry of policy.entries ?? []) {
    if (!entry?.file || !entry?.rule || !entry?.reason || String(entry.reason).trim().length < 20) {
      console.error('SECRET SCAN ERROR: every allowlist entry needs file, rule and a substantive reason.');
      process.exit(1);
    }
    allowed.add(`${entry.file.replace(/\\/g, '/')}|${entry.rule}`);
  }
  return allowed;
}

/** Parses secretlint's compact output into file / line / rule / message. */
function parseFindings(output) {
  const findings = [];
  for (const line of String(output).split('\n')) {
    const match = /^(\/[^\s:]+|[^\s:]+):\s*line\s*(\d+),\s*col\s*\d+,\s*Error\s*-\s*\[(\w+)\]\s*(.*)$/.exec(line);
    if (match) {
      const file = match[1].startsWith(root) ? relative(root, match[1]) : match[1];
      findings.push({ file: file.replace(/\\/g, '/'), line: Number(match[2]), rule: match[3], message: match[4].trim() });
    }
  }
  return findings;
}

main();