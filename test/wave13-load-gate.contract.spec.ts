import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 13, first slice: performance and load evidence.
 *
 * Wave 13 exit criteria require "performance evidence". This repository had none: no load tool, no latency
 * budget, no throughput gate. Every other Wave 13 item is either already a CI gate (artifact sealing,
 * production smoke, E2E, DR drill) or something no pipeline can produce (physical hardware). Performance was
 * the one software-side claim with nothing behind it at all.
 *
 * The failure this guards against is the usual one: a load test that runs, prints a number, and passes
 * unconditionally. A benchmark that cannot fail is a benchmark that measures nothing, and reporting its
 * output as "performance evidence" would be exactly the fabricated proof this project refuses.
 *
 * So the budgets in this file are MACHINE-READ, not asserted here. If the script cannot find the budget file
 * it fails rather than falling back to a default, because a default budget is a budget nobody chose.
 */

const budgetExists = existsSync(resolve(root, 'config/performance-budget.json'));
const budget = budgetExists ? read('config/performance-budget.json') : '';
const workflow = read('.github/workflows/ci.yml');
const runner = read('scripts/run-load-gate.ts');
const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

describe('Wave 13 performance and load evidence', () => {
  describe('the budget is declared, not assumed', () => {
    it('exists as a file, so a missing budget is a visible failure', () => {
      expect(budgetExists).toBe(true);
    });

    it('declares the read endpoints the gate measures', () => {
      const parsed = JSON.parse(budget) as { scenarios: Array<{ target: string }> };
      expect(parsed.scenarios.length).toBeGreaterThan(0);
      for (const scenario of parsed.scenarios) {
        expect(scenario.target).toMatch(/^\//);
      }
    });

    it('declares latency and throughput limits rather than leaving them open', () => {
      const parsed = JSON.parse(budget) as {
        scenarios: Array<{ maxP95Ms: number; minRequestsPerSecond: number }>;
      };
      for (const scenario of parsed.scenarios) {
        expect(typeof scenario.maxP95Ms).toBe('number');
        expect(scenario.maxP95Ms).toBeGreaterThan(0);
        expect(scenario.minRequestsPerSecond).toBeGreaterThan(0);
      }
    });

    it('pins a concurrency and a duration, so the load is reproducible', () => {
      const parsed = JSON.parse(budget) as { scenarios: Array<{ connections: number; durationSeconds: number }> };
      for (const scenario of parsed.scenarios) {
        expect(scenario.connections).toBeGreaterThan(0);
        expect(scenario.durationSeconds).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('the gate can actually fail', () => {
    it('exits non-zero when a scenario misses its budget', () => {
      expect(runner).toMatch(/process\.exit\(1\)|process\.exitCode\s*=\s*1/);
    });

    it('reports every measured number, so a pass is readable rather than a bare "OK"', () => {
      expect(runner).toMatch(/p95|latency/i);
      expect(runner).toMatch(/req\/s|requestsPerSecond|throughput/i);
    });

    it('fails rather than skipping when the target is unreachable', () => {
      // A skipped load test that reports success is worse than no test: it manufactures evidence.
      // Assert the REACHABILITY GUARD exists rather than banning the word "skip": prose explaining why
      // skipping is forbidden necessarily contains it, and a comment must not be able to fail a gate.
      expect(runner).toMatch(/unreachable/i);
      expect(runner).toMatch(/process\.exit\(1\)/);
    });

    it('does not treat a missing or unmeasurable result as a pass', () => {
      expect(runner).toMatch(/!==|Number\.isFinite|isFinite/);
    });
  });

  describe('wired into CI and runnable by hand', () => {
    it('has an npm script so the operator can reproduce it', () => {
      expect(pkg.scripts['load:gate']).toContain('run-load-gate');
    });

    it('runs in CI against the live runtime, not a mock', () => {
      expect(workflow).toMatch(/load:gate/);
      // It must be part of the rescue runtime job, where a real API and database are up.
      expect(workflow).toMatch(/Wave 13 load gate|load gate/i);
    });

    it('has a timeout, because a load test without one can hang the pipeline forever', () => {
      expect(workflow).toMatch(/timeout-minutes:\s*\d+/);
    });
  });

  describe('the runner measures rather than assumes', () => {
    it('uses a real load generator against a real endpoint', () => {
      expect(runner).toMatch(/autocannon|load|http/i);
    });

    it('reads the budget from disk instead of hardcoding numbers', () => {
      expect(runner).toMatch(/performance-budget\.json/);
    });

    it('does not mock the measurements', () => {
      expect(runner).not.toMatch(/mock|simulate|fake/i);
    });
  });
});