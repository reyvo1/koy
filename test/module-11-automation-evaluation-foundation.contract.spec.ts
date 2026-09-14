import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function stringUnionMembers(source: string, aliasName: string): string[] {
  const sourceFile = ts.createSourceFile(
    `${aliasName}.ts`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const alias = sourceFile.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === aliasName,
  );

  if (!alias || !ts.isUnionTypeNode(alias.type)) {
    throw new Error(`Missing string union type alias: ${aliasName}`);
  }

  return alias.type.types.map((member) => {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      throw new Error(`${aliasName} contains a non-string union member`);
    }
    return member.literal.text;
  });
}

function arrayPropertyIdentifiers(
  source: string,
  propertyName: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    `${propertyName}.ts`,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  let identifiers: string[] | undefined;

  const visit = (node: ts.Node): void => {
    if (
      identifiers === undefined &&
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === propertyName &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      identifiers = node.initializer.elements
        .filter(ts.isIdentifier)
        .map((element) => element.text);
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (identifiers === undefined) {
    throw new Error(`Missing array property: ${propertyName}`);
  }
  return identifiers;
}

function expectLabelsInOrder(
  actual: readonly string[],
  required: readonly string[],
): void {
  let previousIndex = -1;
  for (const label of required) {
    const currentIndex = actual.indexOf(label);
    expect(currentIndex).toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

type ValidationStep = {
  label: string;
  args: string[];
};

describe('Module 11 automation evaluation foundation contract', () => {
  const types = read('src/automation/automation-evaluation.types.ts');
  const evaluator = read('src/automation/automation-evaluator.ts');
  const evaluatorSpec = read('src/automation/automation-evaluator.spec.ts');
  const moduleSource = read('src/automation/automation.module.ts');
  const documentation = read(
    'docs/module-11-automation-evaluation-foundation.md',
  );
  const closure = read(
    'docs/module-11-automation-evaluation-foundation-closure.md',
  );
  const policy = JSON.parse(read('test/contract-surface-policy.json'));
  const profiles = JSON.parse(
    read('tools/module-runner/profiles/validation-profiles.json'),
  );

  it('defines one bounded normalized evaluation envelope and stable result contract', () => {
    expect(types).toContain('maxLatestValues: 32');
    expect(types).toContain('AutomationEvaluationCandidate');
    expect(types).toContain('NormalizedCapabilityReport');
    expect(types).toContain('NormalizedLatestCapabilityValue');
    expect(stringUnionMembers(types, 'AutomationEvaluationOutcome')).toEqual([
      'MATCHED',
      'NOT_MATCHED',
      'NOT_APPLICABLE',
      'REJECTED',
    ]);
    expect(stringUnionMembers(types, 'AutomationEvaluationReasonCode')).toEqual(
      [
        'CONDITION_MATCHED',
        'CONDITION_FALSE',
        'TRIGGER_MISMATCH',
        'VALUE_UNAVAILABLE',
        'TYPE_MISMATCH',
        'INVALID_INPUT',
        'INVALID_DEFINITION',
        'TENANT_MISMATCH',
        'ACTIVATION_NOT_APPROVED',
      ],
    );
  });

  it('uses deterministic three-state fail-closed condition evaluation', () => {
    expect(stringUnionMembers(evaluator, 'ConditionState')).toEqual([
      'TRUE',
      'FALSE',
      'UNKNOWN',
    ]);
    expect(evaluator).toContain("if (child.state === 'UNKNOWN') return child");
    expect(evaluator).toContain("reason: 'VALUE_UNAVAILABLE'");
    expect(evaluator).toContain("reason: 'TYPE_MISMATCH'");
    expect(evaluator).toContain('this.validator.validateDefinition');
    expect(evaluatorSpec).toContain(
      'keeps missing values unknown through NOT instead of turning them true',
    );
    expect(evaluatorSpec).toContain(
      'allows ANY to match when another branch is unknown',
    );
  });

  it('returns immutable intents without introducing execution or infrastructure side effects', () => {
    expect(evaluator).toContain('Object.freeze');
    expect(evaluator).toContain('cloneActionIntents');
    expect(arrayPropertyIdentifiers(moduleSource, 'providers')).toEqual(
      expect.arrayContaining(['AutomationEvaluator', 'AutomationRepository']),
    );
    expect(arrayPropertyIdentifiers(moduleSource, 'exports')).toEqual(
      expect.arrayContaining(['AutomationEvaluator', 'AutomationRepository']),
    );

    for (const forbidden of [
      'CommandService',
      'MqttService',
      'PrismaService',
      'RedisService',
      'TelemetryService',
    ]) {
      expect(evaluator).not.toContain(forbidden);
    }
  });

  it('keeps disabled activation and tenant boundaries fail-closed', () => {
    expect(evaluator).toContain('candidate.enabled');
    expect(evaluator).toContain("'ACTIVATION_NOT_APPROVED'");
    expect(evaluator).toContain("'TENANT_MISMATCH'");
    expect(evaluator).toContain('latestValue.tenantId !== candidate.tenantId');
    expect(documentation).toContain('Persisted automations remain disabled');
    expect(documentation).toContain(
      'Production deployment remains **NOT APPROVED**',
    );
  });

  it('documents the read-only boundary and deferred runtime slices', () => {
    expect(documentation).toContain('three-state evaluation');
    expect(documentation).toContain('`NOT UNKNOWN` remains `UNKNOWN`');
    expect(documentation).toContain('plans only');
    expect(documentation).toContain('does not dispatch');
    expect(documentation).toContain('no telemetry subscription');
    expect(documentation).toContain('runtime idempotency');
  });

  it('registers the contract and immutable evidence document', () => {
    expect(
      policy.contractClasses[
        'test/module-11-automation-evaluation-foundation.contract.spec.ts'
      ],
    ).toBe('stable-contract');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-evaluation-foundation.md',
    );
  });

  it('registers an official cheap-to-expensive validation profile', () => {
    const profile = profiles.profiles[
      'module-11-automation-evaluation-foundation'
    ] as ValidationStep[] | undefined;
    expect(profile).toBeDefined();
    if (!profile) throw new Error('Missing evaluation validation profile');

    expectLabelsInOrder(
      profile.map((step) => step.label),
      [
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Current lifecycle validation',
        'Lifecycle simulation through Module 30',
        'Focused Module 11 evaluation and transition-safety tests',
        'Prisma schema validation',
        'Prisma client generation',
        'Nest application build',
        'Full Jest suite once for the exact candidate',
        'Checkpoint-aware lifecycle and state-sensitive contract matrix',
      ],
    );

    const focused = profile.find(
      (step) =>
        step.label ===
        'Focused Module 11 evaluation and transition-safety tests',
    );
    expect(focused).toBeDefined();
    if (!focused) throw new Error('Missing focused validation step');
    expect(focused.args).toContain(
      'test/historical-contract-transition-safety.contract.spec.ts',
    );

    const closureProfile = profiles.profiles[
      'module-11-automation-evaluation-foundation-closure'
    ] as ValidationStep[] | undefined;
    expect(closureProfile).toBeDefined();
    if (!closureProfile) throw new Error('Missing evaluation closure profile');
    expectLabelsInOrder(
      closureProfile.map((step) => step.label),
      [
        'Pre-dependency Module Execution Kit self-test',
        'Module Execution Kit source checks',
        'Clean dependency bootstrap',
        'Changed TypeScript formatting check',
        'Repository non-mutating lint',
        'Current lifecycle validation',
        'Lifecycle simulation through Module 30',
        'Focused Module 11 evaluation closure and transition-safety tests',
        'Prisma schema validation',
        'Prisma client generation',
        'Nest application build',
        'Full Jest suite once for the exact candidate',
        'Checkpoint-aware lifecycle and state-sensitive contract matrix',
      ],
    );
  });

  it('records immutable remote-green closure evidence without widening runtime scope', () => {
    expect(closure).toContain(
      'exact implementation commit `ef37d0860c90c168b5ba357ccb5d0f255b0be54c` in GitHub Actions run `30798541836`',
    );
    expect(closure).toContain('116 test suites and 818 tests');
    expect(closure).toContain('artifact `8849938309`');
    expect(closure).toContain(
      'No later Module 11 slice is activated by this closure.',
    );
    expect(closure).toContain('Production deployment remains **NOT APPROVED**');
    expect(policy.transitionProof.immutableEvidenceDocuments).toContain(
      'docs/module-11-automation-evaluation-foundation-closure.md',
    );
  });
});
