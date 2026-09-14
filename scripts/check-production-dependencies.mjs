import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const policyPath = resolve(root, 'ops/security/production-audit-policy.json');
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 20 * 1024 * 1024,
});

if (!audit.stdout.trim()) {
  throw new Error(`npm audit produced no JSON output: ${audit.stderr}`);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  throw new Error(`Unable to parse npm audit JSON: ${error.message}`);
}
if (report.error) {
  throw new Error(
    `npm audit failed: ${report.error.summary ?? report.error.message ?? JSON.stringify(report.error)}`,
  );
}
if (!report.metadata?.vulnerabilities || !report.vulnerabilities) {
  throw new Error('npm audit JSON is missing vulnerability metadata');
}

const criticalPackages = Object.entries(report.vulnerabilities)
  .filter(([, finding]) => finding.severity === 'critical')
  .map(([name]) => name)
  .sort();
const accepted = new Map(
  (policy.acceptedCriticalFindings ?? []).map((finding) => [
    finding.package,
    finding,
  ]),
);
const today = new Date().toISOString().slice(0, 10);

for (const packageName of criticalPackages) {
  const finding = accepted.get(packageName);
  if (!finding) {
    throw new Error(
      `Unreviewed critical production dependency: ${packageName}`,
    );
  }
  if (finding.expiresOn < today) {
    throw new Error(
      `Critical dependency acceptance expired for ${packageName}`,
    );
  }
}
for (const packageName of accepted.keys()) {
  if (!criticalPackages.includes(packageName)) {
    console.log(`Accepted critical finding no longer present: ${packageName}`);
  }
}


const totals = report.metadata.vulnerabilities;
console.log(
  `Production dependency audit: ${totals.critical ?? 0} critical, ${totals.high ?? 0} high, ${totals.moderate ?? 0} moderate`,
);
if (criticalPackages.length > 0) {
  console.log(
    `Time-bounded accepted critical packages: ${criticalPackages.join(', ')}`,
  );
}
