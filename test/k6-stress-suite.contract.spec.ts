import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.next'].includes(entry.name)) continue;
      out.push(...collect(path));
    } else out.push(path);
  }
  return out;
}

interface Route {
  file: string;
  method: string;
  path: string;
}

/** The real route table, read from the controllers. A stress matrix that cannot be checked against it is decoration. */
function controllerRoutes(): Route[] {
  const routes: Route[] = [];
  for (const file of collect(resolve(root, 'src')).filter((path) => path.endsWith('.controller.ts'))) {
    const source = readFileSync(file, 'utf8');
    const base = /@Controller\('([^']+)'\)/.exec(source)?.[1] ?? '';
    for (const match of source.matchAll(
      /@(Get|Post|Put|Patch|Delete|Sse)\((?:\s*'([^']*)')?\s*\)/g,
    )) {
      routes.push({
        file: relative(resolve(root, 'src'), file).split('/').pop() as string,
        method: match[1].toUpperCase(),
        path: `/${[base, match[2] ?? ''].filter(Boolean).join('/')}`,
      });
    }
  }
  return routes;
}

const segments = (path: string): string[] => path.split('?')[0].split('/').filter(Boolean);

/** Segment-wise matcher: `:param` on either side matches anything, so declared and route params agree. */
function sameRoute(a: string, b: string): boolean {
  const left = segments(a);
  const right = segments(b);
  if (left.length !== right.length) return false;
  return left.every((segment, index) => {
    const other = right[index];
    return segment === other || segment.startsWith(':') || other.startsWith(':');
  });
}

const budget = JSON.parse(read('config/stress-budget.json')) as {
  functions: Array<{
    name: string;
    class: string;
    method?: string;
    path?: string;
    weight: number;
    requires?: string[];
    requiresEnv?: string[];
    optional?: boolean;
    type?: string;
    sequence?: Array<{ method: string; path: string }>;
  }>;
  notStressed: Array<{ path: string; method: string; reason: string }>;
  thresholds: Record<string, unknown> & { classes: Record<string, { p95Ms: number }> };
  settings: Record<string, unknown> & {
    stages: Array<{ duration: string; target: number }>;
    preAllocatedVUs: number;
  };
};

const routes = controllerRoutes();
const declaredEntries = budget.functions.flatMap((fn) =>
  fn.type === 'sequence' && fn.sequence
    ? fn.sequence.map((step) => ({ ...fn, method: step.method, path: step.path }))
    : [{ ...fn, method: fn.method as string, path: fn.path as string }],
);

describe('k6 function stress suite (coverage, budgets, and a run that can fail)', () => {
  describe('the budget declares coverage instead of assuming it', () => {
    it('declares a non-trivial function set', () => {
      expect(budget.functions.length).toBeGreaterThan(50);
      for (const fn of budget.functions) {
        expect(fn.name.length).toBeGreaterThan(2);
        expect(fn.weight).toBeGreaterThan(0);
        expect(typeof fn.class).toBe('string');
      }
    });

    it('resolves every declared function to a real controller route', () => {
      const unresolvable = declaredEntries.filter(
        (fn) => !routes.some((route) => route.method === fn.method && sameRoute(fn.path, route.path)),
      );
      expect(unresolvable.map((fn) => `${fn.method} ${fn.path}`)).toEqual([]);
    });

    it('exercises every product-UI controller, or names why not', () => {
      const census = read('docs/BACKEND-FRONTEND-SURFACE-CENSUS.md');
      const productUiControllers = [
        ...census.matchAll(/\| `([a-z0-9\-.]+\.controller\.ts)` \| \d+ \| ([A-Z_ +]*?) \|/g),
      ]
        .filter((match) => match[2].includes('PRODUCT_UI'))
        .map((match) => match[1]);

      expect(productUiControllers.length).toBeGreaterThan(20);

      const uncovered = productUiControllers.filter((file) => {
        const forController = routes.filter((route) => route.file === file);
        const exercised = forController.some((route) =>
          declaredEntries.some((fn) => fn.method === route.method && sameRoute(fn.path, route.path)),
        );
        const excuseComplete = forController.every((route) =>
          budget.notStressed.some(
            (entry) => entry.method === route.method && sameRoute(entry.path, route.path),
          ),
        );
        return !exercised && !excuseComplete;
      });

      expect(uncovered).toEqual([]);
    });

    it('explains every exclusion instead of dropping a surface silently', () => {
      for (const entry of budget.notStressed) {
        expect(entry.reason.length).toBeGreaterThan(40);
        expect(entry.path.startsWith('/')).toBe(true);
        expect(
          routes.some((route) => route.method === entry.method && sameRoute(entry.path, route.path)),
        ).toBe(true);
      }
    });

    it('guards optional entries behind an explicit environment variable', () => {
      for (const fn of budget.functions.filter((entry) => entry.optional)) {
        expect((fn.requiresEnv ?? []).length).toBeGreaterThan(0);
      }
    });
  });

  describe('the budget declares latency and throughput budgets per class', () => {
    it('gives every exercised class a budget, so no traffic runs unjudged', () => {
      const classes = new Set(budget.functions.map((fn) => fn.class));
      for (const cls of classes) {
        expect(budget.thresholds.classes[cls]).toBeDefined();
        expect(budget.thresholds.classes[cls].p95Ms).toBeGreaterThan(0);
      }
    });

    it('pins a reproducible load profile', () => {
      expect(budget.settings.preAllocatedVUs).toBeGreaterThan(0);
      expect(budget.settings.stages.length).toBeGreaterThanOrEqual(3);
      for (const stage of budget.settings.stages) {
        expect(typeof stage.target).toBe('number');
        expect(stage.duration).toMatch(/^(\d+)(ms|s|m)$/);
      }
    });
  });

  describe('the k6 script measures the real platform', () => {
    const script = read('ops/loadtest/k6/functions-stress.js');

    it('derives its thresholds from the budget rather than hardcoding numbers', () => {
      expect(script).toContain('loadBudget()');
      expect(script).toContain('thresholds.classes');
      expect(script).not.toMatch(/p\(95\)<\d{3,}/);
    });

    it('reads credentials and entities from the live runtime, never from fixtures', () => {
      expect(script).toContain('/auth/login');
      expect(read('ops/loadtest/k6/lib/auth.js')).toContain('.stress-credentials');
      expect(script).not.toMatch(/mock|simulate|fake/i);
    });

    it('judges every response, so a broken function cannot hide in the average', () => {
      expect(script).toContain('check(response');
      expect(script).toMatch(/answered 2xx/);
      expect(script).toContain('classTrends');
    });

    it('fails the run when a declared entity cannot be resolved', () => {
      expect(script).toMatch(/fail\(/);
      expect(script).toContain('Every function declared in the budget must have a');
    });

    it('leaves no credential and no state change behind', () => {
      expect(script).toContain('export function teardown');
      expect(script).toContain('delete api key');
      expect(script).toContain('restore automation');
      expect(script).toContain('apiKey.id');
    });

    it('throws away nothing: the sequence write path cleans itself within one iteration', () => {
      const churn = budget.functions.find((fn) => fn.type === 'sequence');
      expect(churn?.sequence?.map((step) => step.method)).toEqual(['POST', 'POST', 'DELETE', 'DELETE']);
    });
  });

  describe('the runner can fail, and is wired in', () => {
    const runner = read('scripts/run-k6-stress-suite.mjs');

    it('refuses to pass when the budget, k6 or the target is missing', () => {
      expect(runner).toContain('config/stress-budget.json');
      expect(runner).toContain('k6 is not available');
      expect(runner).toContain('did not answer /health/live');
      expect(runner).toMatch(/process\.exit\(1\)/);
    });

    it('re-checks k6\'s own numbers from the summary export', () => {
      expect(runner).toContain('--summary-export');
      expect(runner).toContain('--summary-mode=legacy');
      expect(runner).toContain('iot_functions_');
      expect(runner).toContain('exceeds');
    });

    it('treats a missing metric as a failure, never as a pass', () => {
      expect(runner).toContain('is missing from the k6 summary');
      expect(runner).toContain('never exercised');
    });

    it('is backed by a seeder, so an empty platform fails instead of skipping coverage', () => {
      const seeder = read('scripts/seed-stress-baseline.mjs');
      expect(seeder).toContain('argon2.hash');
      expect(seeder).toContain('.stress-credentials');
      expect(seeder).toContain('process.exit(1)');
      expect(read('.gitignore')).toContain('.stress-credentials');
      const workflow = read('.github/workflows/ci.yml');
      expect(workflow).toContain('npm run stress:seed');
    });

    it('is operator-runnable and CI-wired with a timeout', () => {
      const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
      expect(pkg.scripts['stress:suite']).toContain('run-k6-stress-suite');
      expect(pkg.scripts['stress:seed']).toContain('seed-stress-baseline');
      const workflow = read('.github/workflows/ci.yml');
      expect(workflow).toContain('npm run stress:suite');
      expect(workflow).toMatch(/k6 function stress suite[\s\S]{0,200}timeout-minutes:\s*\d+/);
      expect(workflow).not.toContain('continue-on-error: true');
    });
  });

  describe('Grafana can render the results without pretending it already does', () => {
    const dashboard = read('ops/monitoring/grafana/dashboards/k6-stress-overview.json');

    it('is provisioned beside the monitoring stack', () => {
      expect(dashboard).toContain('iot-platform-k6-stress');
      expect(dashboard).toContain('iot-platform-prometheus');
    });

    it('states that the data requires the operator-owned remote-write export', () => {
      expect(dashboard).toContain('experimental-prometheus-rw');
      expect(dashboard).toContain('not that the platform was never stressed');
      expect(read('ops/loadtest/README.md')).toContain('experimental-prometheus-rw');
    });
  });
});
