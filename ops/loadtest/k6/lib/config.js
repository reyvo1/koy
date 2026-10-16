/**
 * Budget loader for the k6 function stress suite.
 *
 * The budget file is the single source of truth for BOTH what the suite exercises and what it
 * enforces. That separation matters: a stress suite whose thresholds live in code and whose
 * coverage lives in a different statement drifts, and a drifted suite measures nothing useful.
 *
 * This module fails the run when the budget is missing or malformed, for the same reason
 * `scripts/run-load-gate.ts` does: a default threshold is a threshold nobody chose, and a
 * default coverage list is coverage nobody verified.
 */

const DEFAULT_BUDGET_PATH = 'config/stress-budget.json';
// k6's open() resolves relative to the ENTRY SCRIPT's directory (ops/loadtest/k6), not the process
// working directory, so a plain 'config/...' only works when the runner supplies an absolute path.
// Both spellings are tried, env first, so `npm run stress:suite` and a hand-run `k6 run` behave
// identically.
const BUDGET_CANDIDATES = [
  __ENV.STRESS_BUDGET_PATH,
  DEFAULT_BUDGET_PATH,
  '../../../config/stress-budget.json',
].filter(Boolean);

export function loadBudget() {
  let raw;
  let used = null;
  let lastError = null;
  for (const candidate of BUDGET_CANDIDATES) {
    try {
      raw = open(candidate);
      used = candidate;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (used === null) {
    throw new Error(
      `stress budget not found (tried ${BUDGET_CANDIDATES.join(', ')}): ${lastError}. The thresholds ` +
        'and the function coverage must be declared and committed, never defaulted.',
    );
  }

  let budget;
  try {
    budget = JSON.parse(raw);
  } catch (error) {
    throw new Error(`stress budget at ${used} is not valid JSON: ${error}`);
  }

  if (!budget || typeof budget !== 'object') throw new Error('stress budget must be an object');
  if (!Array.isArray(budget.functions) || budget.functions.length === 0) {
    throw new Error('stress budget declares no functions: the suite would measure nothing');
  }
  if (!budget.settings || typeof budget.settings !== 'object') {
    throw new Error('stress budget declares no settings');
  }
  if (!budget.thresholds || typeof budget.thresholds !== 'object' || !budget.thresholds.classes) {
    throw new Error('stress budget declares no class thresholds');
  }

  const totalWeight = budget.functions.reduce((sum, fn) => sum + (fn.weight || 1), 0);
  if (totalWeight <= 0) throw new Error('stress budget function weights sum to zero');

  const classes = new Set(budget.functions.map((fn) => fn.class));
  for (const cls of classes) {
    if (!budget.thresholds.classes[cls]) {
      throw new Error(
        `function class "${cls}" has no budget entry in thresholds.classes, so requests of ` +
          'that class would run unjudged',
      );
    }
  }

  return { budget, budgetPath: used, totalWeight };
}

/** Cumulative-weight picker: the declared weights ARE the traffic mix, so coverage is proportional to intent. */
export function weightedPick(functions, totalWeight, random) {
  let ticket = random() * totalWeight;
  for (const fn of functions) {
    ticket -= fn.weight || 1;
    if (ticket <= 0) return fn;
  }
  return functions[functions.length - 1];
}

export function baseUrl() {
  const url = __ENV.K6_BASE_URL || __ENV.STRESS_BASE_URL || 'http://127.0.0.1:3000';
  return url.replace(/\/+$/, '');
}
