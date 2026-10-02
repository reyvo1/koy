#!/usr/bin/env node
/**
 * Wave 13 load gate: measure, then hold the platform to its declared budget.
 *
 * This exists because "performance evidence" was the one Wave 13 claim with nothing behind it. The important
 * property is that this gate CAN FAIL. A benchmark that always passes measures nothing, and printing its
 * output as evidence would be worse than having no benchmark at all.
 *
 * Three ways it refuses to manufacture a pass:
 *
 *  - The budget is read from config/performance-budget.json. If it is missing the gate exits 1. A default
 *    budget would be a threshold nobody chose.
 *  - A non-finite or absent measurement is a failure, not a pass. "No data" must never read as "fast".
 *  - Every measured number is printed alongside the budget it was judged against, so a green run is auditable
 *    rather than a bare "OK".
 *
 * Numbers here are produced by autocannon against whatever base URL it is given -- in CI, the live rescue
 * API; locally, whatever the operator starts. This script never starts or stands in for a server itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from 'autocannon';

// autocannon is CommonJS and its module IS the function -- it has no `default` export. Importing it as a
// default gives `(0, autocannon_1.default) is not a function` at runtime while type-checking cleanly, so it
// is pulled in with require and typed separately.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const autocannon = require('autocannon') as typeof import('autocannon');

interface Scenario {
  name: string;
  target: string;
  connections: number;
  durationSeconds: number;
  maxP95Ms: number;
  minRequestsPerSecond: number;
}

interface Budget {
  scenarios: Scenario[];
}

const BUDGET_PATH = resolve(process.cwd(), 'config/performance-budget.json');

function fail(message: string): never {
  console.error(`LOAD GATE ERROR: ${message}`);
  process.exit(1);
}

function readBudget(): Budget {
  let raw: string;
  try {
    raw = readFileSync(BUDGET_PATH, 'utf8');
  } catch {
    fail(
      `no performance budget at ${BUDGET_PATH}. The numbers this gate enforces must be chosen and committed, ` +
        'not defaulted in code.',
    );
  }
  try {
    return JSON.parse(raw) as Budget;
  } catch (error) {
    fail(`performance budget is not valid JSON: ${(error as Error).message}`);
  }
}

function runScenario(baseUrl: string, scenario: Scenario): Promise<Result> {
  return autocannon({
    url: `${baseUrl}${scenario.target}`,
    connections: scenario.connections,
    duration: scenario.durationSeconds,
    // Only HTTP errors count against the budget. A load test that measures a healthy API should see 2xx,
    // and a failing one must not be able to hide behind connection errors.
    pipelining: 1,
  });
}

async function main(): Promise<void> {
  const baseUrl = (process.env.LOAD_TARGET_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

  // Reachability first. An unreachable target must fail the gate, never skip it -- a skipped load test that
  // reports success manufactures evidence out of nothing.
  try {
    const probe = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
    if (!probe.ok) {
      fail(`load target ${baseUrl} answered /health with HTTP ${probe.status}. Refusing to measure a target that is not up.`);
    }
  } catch (error) {
    fail(`load target ${baseUrl} is unreachable (${(error as Error).message}). A load gate that skips is not a pass.`);
  }

  const budget = readBudget();
  console.log(`Load gate against ${baseUrl}, ${budget.scenarios.length} scenario(s)\n`);

  const failures: string[] = [];

  for (const scenario of budget.scenarios) {
    const result = await runScenario(baseUrl, scenario);

    // autocannon's Result has no `p95` field -- it exposes p90, p97_5, p99 and friends. The budget says p95,
    // and reporting a percentile FRIENDLIER than the one promised would be a budget nobody can trust, so the
    // gate measures p97_5 and labels it as such rather than quietly reading p90.
    const latencyPercentileMs = result.latency.p97_5;
    // Throughput lives at requests.average; requests.avg does not exist and reads as undefined.
    const requestsPerSecond = result.requests.average;

    const latencyMeasured = Number.isFinite(latencyPercentileMs) && latencyPercentileMs > 0;
    const throughputMeasured = Number.isFinite(requestsPerSecond) && requestsPerSecond > 0;

    // Absent data is a failure. "No measurement" must never read as "within budget".
    if (!latencyMeasured || !throughputMeasured) {
      failures.push(`${scenario.name}: no usable measurement (p97.5=${latencyPercentileMs}, req/s=${requestsPerSecond})`);
      console.log(`FAIL  ${scenario.name}  no usable measurement`);
      continue;
    }

    const errorRate = result.non2xx + result.errors + result.timeouts;
    const latencyOk = latencyPercentileMs <= scenario.maxP95Ms;
    const throughputOk = requestsPerSecond >= scenario.minRequestsPerSecond;
    const errorsOk = errorRate === 0;

    const ok = latencyOk && throughputOk && errorsOk;
    if (!ok) {
      const reasons: string[] = [];
      if (!latencyOk) reasons.push(`p97.5 ${latencyPercentileMs}ms > ${scenario.maxP95Ms}ms budget`);
      if (!throughputOk) reasons.push(`${requestsPerSecond.toFixed(1)} req/s < ${scenario.minRequestsPerSecond} budget`);
      if (!errorsOk) reasons.push(`${errorRate} non-2xx/errors/timeouts (budget: 0)`);
      failures.push(`${scenario.name}: ${reasons.join('; ')}`);
    }

    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${scenario.name}\n` +
        `        ${scenario.connections} conns, ${scenario.durationSeconds}s against ${scenario.target}\n` +
        `        p97.5 ${latencyPercentileMs}ms (budget <= ${scenario.maxP95Ms}ms, labelled p95 in the budget)\n` +
        `        ${requestsPerSecond.toFixed(1)} req/s (budget >= ${scenario.minRequestsPerSecond})\n` +
        `        ${result.requests.sent} requests, ${errorRate} errors`,
    );
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`LOAD GATE FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(`LOAD GATE PASSED: ${budget.scenarios.length} scenario(s) within their declared budgets.`);
}

main().catch((error) => {
  console.error('LOAD GATE ERROR:', error);
  process.exit(1);
});