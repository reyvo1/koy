#!/usr/bin/env node
/**
 * k6 function stress suite runner.
 *
 * Exists for the same reason `scripts/run-load-gate.ts` does: a stress suite that cannot fail is
 * not evidence. This runner refuses to manufacture a pass in five ways:
 *
 *   - no budget file            -> exit 1 (the thresholds and the coverage are committed choices)
 *   - no k6 binary              -> exit 1 (a missing load generator is not a green run)
 *   - unreachable target        -> exit 1 (a stress run against nothing proves nothing)
 *   - k6 exits non-zero         -> exit 1 (its own thresholds already judged the run)
 *   - a measured metric missing -> exit 1 (absent data must never read as "within budget")
 *
 * The class budgets from config/stress-budget.json are re-checked here from k6's summary export,
 * so the verdict does not depend on k6's own threshold configuration agreeing with the file.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const DEFAULT_BUDGET = 'config/stress-budget.json';
const DEFAULT_CREDENTIALS = '.stress-credentials';
const SCRIPT = 'ops/loadtest/k6/functions-stress.js';

function parseArgs(argv) {
  const args = { budget: DEFAULT_BUDGET, credentials: DEFAULT_CREDENTIALS };
  for (const arg of argv) {
    if (arg.startsWith('--budget=')) args.budget = arg.slice('--budget='.length);
    else if (arg.startsWith('--credentials=')) args.credentials = arg.slice('--credentials='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/run-k6-stress-suite.mjs [--budget=path] [--credentials=path]');
      process.exit(0);
    } else {
      console.error(`STRESS SUITE ERROR: unknown argument ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function fail(message, hint) {
  console.error(`STRESS SUITE ERROR: ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const budgetPath = resolve(root, args.budget);
let budget;
try {
  budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
} catch (error) {
  fail(
    `cannot read the stress budget at ${args.budget}: ${error.message}`,
    'The thresholds and the function coverage are committed decisions; they are never defaulted.',
  );
}
if (!budget?.functions?.length || !budget?.thresholds?.classes) {
  fail(`the stress budget at ${args.budget} is missing "functions" or "thresholds.classes"`);
}

const k6Bin = process.env.K6_BIN || 'k6';
const version = spawnSync(k6Bin, ['version'], { encoding: 'utf8' });
if (version.error || version.status !== 0) {
  fail(
    `k6 is not available as "${k6Bin}": ${version.error?.message ?? `exit ${version.status}`}`,
    'Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/) or set K6_BIN to its path. ' +
      'A missing load generator is a missing test, not a passing one.',
  );
}

const baseUrl = (
  process.env.K6_BASE_URL ||
  process.env.STRESS_BASE_URL ||
  'http://127.0.0.1:3000'
).replace(/\/+$/, '');

// Reachability: an unreachable target must fail, never skip.
const probe = spawnSync(
  process.execPath,
  [
    '-e',
    `
  fetch(process.argv[1], { signal: AbortSignal.timeout(5000) })
    .then((r) => process.exit(r.ok ? 0 : 1))
    .catch(() => process.exit(1));
`,
    `${baseUrl}/health/live`,
  ],
  { encoding: 'utf8', timeout: 15000 },
);
if (probe.status !== 0) {
  fail(
    `the stress target ${baseUrl} did not answer /health/live`,
    'Start the API (locally or through the rescue compose stack) and re-run. ' +
      'A suite that quietly passes against a dead target manufactures evidence.',
  );
}

const summaryDir = mkdtempSync(join(tmpdir(), 'k6-stress-'));
const summaryPath = join(summaryDir, 'summary.json');

console.log('k6 function stress suite');
console.log(`  budget:      ${budgetPath}`);
console.log(`  credentials: ${resolve(root, args.credentials)} (override with --credentials=)`);
console.log(`  target:      ${baseUrl}`);
console.log(`  functions:   ${budget.functions.length} declared\n`);

const run = spawnSync(
  k6Bin,
  ['run', `--summary-export=${summaryPath}`, SCRIPT],
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      K6_BASE_URL: baseUrl,
      STRESS_BUDGET_PATH: budgetPath,
      STRESS_CREDENTIALS_FILE: resolve(root, args.credentials),
    },
  },
);

if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);

let summary = null;
try {
  summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
} catch (error) {
  if (run.status !== 0) {
    rmSync(summaryDir, { recursive: true, force: true });
    fail(`k6 exited ${run.status} without a usable summary export: ${error.message}`);
  }
  rmSync(summaryDir, { recursive: true, force: true });
  fail(`k6 produced no summary export at ${summaryPath}: ${error.message}`);
}

if (run.status !== 0) {
  rmSync(summaryDir, { recursive: true, force: true });
  fail(`k6 exited ${run.status}: its declared thresholds judged this run a failure`);
}

// Judge the run from the exported numbers, never from k6's exit code alone.
const metrics = summary.metrics ?? {};
const failures = [];
const rows = [];

function metric(name) {
  const entry = metrics[name];
  if (!entry?.values) return null;
  return entry.values;
}

const globalLatency = metric('http_req_duration');
const globalFailed = metric('http_req_failed');
const checks = metric('checks');

rows.push([
  'ALL',
  'http_req_duration',
  globalLatency ? `${Number(globalLatency['p(95)']).toFixed(0)}ms` : 'MISSING',
  `p95 < ${budget.thresholds.http_req_duration.p95Ms}ms`,
]);
if (!globalLatency || !Number.isFinite(globalLatency['p(95)'])) {
  failures.push('http_req_duration p95 is missing from the k6 summary');
} else if (globalLatency['p(95)'] > budget.thresholds.http_req_duration.p95Ms) {
  failures.push(
    `http_req_duration p95 ${globalLatency['p(95)']}ms exceeds ${budget.thresholds.http_req_duration.p95Ms}ms`,
  );
}

rows.push([
  'ALL',
  'http_req_failed',
  globalFailed ? `${(globalFailed.rate * 100).toFixed(3)}%` : 'MISSING',
  `rate < ${budget.thresholds.http_req_failed.rate}`,
]);
if (!globalFailed || !Number.isFinite(globalFailed.rate)) {
  failures.push('http_req_failed rate is missing from the k6 summary');
} else if (globalFailed.rate > budget.thresholds.http_req_failed.rate) {
  failures.push(
    `http_req_failed rate ${(globalFailed.rate * 100).toFixed(3)}% exceeds ${budget.thresholds.http_req_failed.rate}`,
  );
}

rows.push([
  'ALL',
  'checks',
  checks ? `${(checks.rate * 100).toFixed(3)}%` : 'MISSING',
  `rate > ${budget.thresholds.checks.rate}`,
]);
if (!checks || !Number.isFinite(checks.rate)) {
  failures.push('checks rate is missing from the k6 summary');
} else if (checks.rate < budget.thresholds.checks.rate) {
  failures.push(`checks rate ${(checks.rate * 100).toFixed(3)}% is below ${budget.thresholds.checks.rate}`);
}

for (const [cls, limits] of Object.entries(budget.thresholds.classes)) {
  const values = metric(`iot_functions_${cls}_duration_ms`);
  const measured = values?.['p(95)'];
  rows.push([
    cls,
    `${budget.functions.filter((fn) => fn.class === cls).length} function(s)`,
    values ? `${Number(measured).toFixed(0)}ms` : 'MISSING',
    `p95 < ${limits.p95Ms}ms`,
  ]);
  if (!Number.isFinite(measured)) {
    failures.push(
      `iot_functions_${cls}_duration_ms p95 is missing: that function class was never exercised`,
    );
  } else if (measured > limits.p95Ms) {
    failures.push(`${cls} p95 ${Number(measured).toFixed(0)}ms exceeds ${limits.p95Ms}ms`);
  }
}

// Every declared function class must have produced traffic; a class with zero requests means the
// weighted picker never chose it, which is a coverage failure, not a fast run.
const requestCount = summary.root_group?.checks?.length ?? 0;
if (requestCount === 0) {
  failures.push('the k6 summary recorded no checks: no declared function was exercised');
}

const widths = [10, 26, 14, 24];
const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join(' ');
console.log(line(['class', 'surface', 'measured', 'budget']));
console.log(widths.map((width) => '-'.repeat(width)).join(' '));
for (const row of rows) console.log(line(row));
console.log('');

rmSync(summaryDir, { recursive: true, force: true });

if (failures.length > 0) {
  console.error(`STRESS SUITE FAILED: ${failures.length} budget breach(es):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('STRESS SUITE PASS: every declared function class answered inside its declared budget');
