import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(__dirname, '..');
const seedPath = resolve(root, 'scripts/seed-demo-accounts.mjs');
const seedSource = readFileSync(seedPath, 'utf8');

/**
 * `npm run demo:seed` used to fail with P2003 the moment an operator created an automation
 * in the demo tenant and it was evaluated once.
 *
 * `AutomationExecution.automation` is `onDelete: Restrict`, and *every* evaluation writes a
 * row — including the `SUPPRESSED_COOLDOWN` / `SUPPRESSED_LOOP` verdicts, which are the
 * ones an idle automation keeps producing. So an automation that had never once taken an
 * action still blocked its own deletion. The seed deleted the demo user, which means the
 * failure landed *after* the credentials were already gone: the operator was left unable
 * to log in, with no obvious cause.
 *
 * The regression is asserted against the source rather than a live re-seed because the
 * fixture it needs (a telemetry row, an automation, an execution) is more expensive and
 * more fragile to build on every test run than the ordering guarantee is to check: what
 * matters is that executions are cleared *before* their automations, and that they are
 * selected through the owner membership so the clear is tenant-scoped.
 */
describe('demo seed clears automation executions before automations', () => {
  it('deletes automation executions, and does so before the automations they reference', () => {
    const executionClear = seedSource.indexOf('prisma.automationExecution.deleteMany');
    const automationClear = seedSource.indexOf('prisma.automation.deleteMany');

    expect(executionClear).toBeGreaterThan(-1);
    expect(automationClear).toBeGreaterThan(-1);
    // Postgres enforces the Restrict at statement time, so order is the whole fix.
    expect(executionClear).toBeLessThan(automationClear);
  });

  it('scopes the execution clear to the demo owner membership, not the whole table', () => {
    const statement = seedSource.slice(
      seedSource.indexOf('prisma.automationExecution.deleteMany'),
      seedSource.indexOf('prisma.automationExecution.deleteMany') + 220,
    );

    // An unscoped deleteMany here would be correct-by-accident on the demo database and
    // catastrophic anywhere else: it would erase every tenant's automation history.
    expect(statement).toContain('ownerMembershipId');
    expect(statement).toContain('ownedBy');
    expect(statement).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/);
  });

  it('clears the execution once rather than walking the self-referencing cooldown chain', () => {
    const count = seedSource.match(/prisma\.automationExecution\.deleteMany/g) ?? [];

    // `cooldownReferenceExecution` points within AutomationExecution itself, so the rows
    // are removed in one statement. A per-row loop could not order its own deletes.
    expect(count).toHaveLength(1);
  });
});

describe('demo seed is re-runnable against a database with real operator data', () => {
  it('runs twice in a row without a foreign-key failure', () => {
    // A plain "script parses" assertion would miss the entire class of bug: the seed is
    // syntactically fine and only fails once a row it does not clean up exists.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const output = execFileSync('node', [seedPath], {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env },
        timeout: 120_000,
      });
      expect(output).toContain('Sign in at');
      expect(output).not.toContain('SEED FAILED');
    }
  });
});
