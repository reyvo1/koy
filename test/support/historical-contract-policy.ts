import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import * as ts from 'typescript';

export type ContractClass =
  | 'current-state'
  | 'historical-evidence'
  | 'policy-enforcement'
  | 'stable-contract';

export type ContractSurfacePolicy = {
  version: number;
  mutableCurrentStateDocuments: string[];
  stableArchitecturePolicyDocuments: string[];
  repositoryPolicyDocuments: string[];
  currentStateContracts: string[];
  policyEnforcementContracts: string[];
  contractClasses: Record<string, ContractClass>;
  historicalStableDocumentOwners: Record<string, string[]>;
  remediationBoundary: {
    baseSha: string;
    invalidArtifacts: string[];
    prohibitedOwnerGates: string[];
  };
  transitionProof: {
    mutableSummaryDocuments: string[];
    immutableEvidenceDocuments: string[];
    validationCommands: string[][];
    states: Array<{
      label: string;
      transitions: string[][];
      churnCurrentSummaries: boolean;
    }>;
  };
};

export type ContractPolicyFinding = {
  code:
    | 'UNCLASSIFIED_CONTRACT'
    | 'STALE_CONTRACT_CLASSIFICATION'
    | 'MUTABLE_CURRENT_STATE_READ'
    | 'REPOSITORY_POLICY_FAN_OUT'
    | 'HISTORICAL_ASSERTION_ON_STABLE_SURFACE'
    | 'HISTORICAL_SHARED_ARCHITECTURE_READ'
    | 'EXACT_PROSE_ASSERTION_ON_REPOSITORY_POLICY';
  relativePath: string;
  line: number;
  column: number;
  message: string;
};

type Flow = {
  paths: Set<string>;
  sources: Set<string>;
};

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

type ImportedBinding = {
  modulePath: string;
  exportedName: string;
};

const emptyFlow = (): Flow => ({ paths: new Set(), sources: new Set() });

const mergeFlows = (flows: Iterable<Flow>): Flow => {
  const merged = emptyFlow();
  for (const flow of flows) {
    for (const path of flow.paths) merged.paths.add(path);
    for (const source of flow.sources) merged.sources.add(source);
  }
  return merged;
};

const normalized = (path: string): string => path.replace(/\\/g, '/');

const historicalEvidencePatterns = [
  /(?:^|[^0-9a-f])(?=[0-9a-f]{7,40}(?:[^0-9a-f]|$))(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?:[^0-9a-f]|$)/i,
  /\b\d{8,}\b/,
  /\b\d+\/\d+\b/,
  /\b\d+\s+(?:Jest\s+)?suites?\s*(?:\/|with)\s*\d+\s+tests?\b/i,
  /\b\d+\s+manifest entries\b/i,
  /\b(?:commit|run|artifact)\s+[`']?[0-9a-f\d]{7,64}/i,
];

const containsHistoricalEvidence = (node: ts.Node): boolean => {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (found) return;
    if (
      ts.isStringLiteral(candidate) ||
      ts.isNoSubstitutionTemplateLiteral(candidate) ||
      ts.isRegularExpressionLiteral(candidate)
    ) {
      if (historicalEvidencePatterns.some((pattern) => pattern.test(candidate.text))) {
        found = true;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
};


const containsExactProse = (node: ts.Node): boolean => {
  let found = false;
  const visit = (candidate: ts.Node): void => {
    if (found) return;
    if (
      ts.isStringLiteral(candidate) ||
      ts.isNoSubstitutionTemplateLiteral(candidate)
    ) {
      const value = candidate.text.trim();
      const words = value.split(/\s+/).filter((word) => word.length > 0);
      if (value.length >= 24 && words.length >= 4) {
        found = true;
        return;
      }
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
};

const contractFilesUnder = (root: string, start: string): string[] => {
  const absoluteStart = resolve(root, start);
  const found: string[] = [];
  const walk = (absolutePath: string): void => {
    for (const entry of readdirSync(absolutePath)) {
      const child = resolve(absolutePath, entry);
      if (statSync(child).isDirectory()) {
        walk(child);
      } else if (entry.endsWith('contract.spec.ts')) {
        found.push(normalized(relative(root, child)));
      }
    }
  };
  walk(absoluteStart);
  return found;
};

export const discoverContractFiles = (root: string): string[] =>
  [...contractFilesUnder(root, 'src'), ...contractFilesUnder(root, 'test')].sort();

export const loadContractSurfacePolicy = (
  root: string,
): ContractSurfacePolicy =>
  JSON.parse(
    readFileSync(resolve(root, 'test/contract-surface-policy.json'), 'utf8'),
  ) as ContractSurfacePolicy;

class ModuleModel {
  readonly sourceFile: ts.SourceFile;
  readonly variables = new Map<string, ts.Expression>();
  readonly functions = new Map<string, FunctionLike>();
  readonly imports = new Map<string, ImportedBinding>();
  readonly namespaces = new Map<string, string>();
  readonly nativeReadBindings = new Set<string>();
  readonly nativeFileSystemNamespaces = new Set<string>();

  constructor(
    readonly root: string,
    readonly relativePath: string,
    readonly source: string,
    private readonly moduleCache: Map<string, ModuleModel>,
  ) {
    this.sourceFile = ts.createSourceFile(
      relativePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    this.collect(this.sourceFile);
  }

  private collect(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        this.functions.set(node.name.text, node.initializer);
      } else {
        this.variables.set(node.name.text, node.initializer);
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      this.functions.set(node.name.text, node);
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      const clause = node.importClause;
      if ((specifier === 'node:fs' || specifier === 'fs') && clause !== undefined) {
        if (clause.namedBindings !== undefined) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            this.nativeFileSystemNamespaces.add(clause.namedBindings.name.text);
          } else {
            for (const element of clause.namedBindings.elements) {
              const importedName = element.propertyName?.text ?? element.name.text;
              if (importedName === 'readFileSync' || importedName === 'readFile') {
                this.nativeReadBindings.add(element.name.text);
              }
            }
          }
        }
      }

      const modulePath = this.resolveImport(specifier);
      if (modulePath !== null && clause !== undefined) {
        if (clause.name !== undefined) {
          this.imports.set(clause.name.text, {
            modulePath,
            exportedName: 'default',
          });
        }
        if (clause.namedBindings !== undefined) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            this.namespaces.set(clause.namedBindings.name.text, modulePath);
          } else {
            for (const element of clause.namedBindings.elements) {
              this.imports.set(element.name.text, {
                modulePath,
                exportedName: element.propertyName?.text ?? element.name.text,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => this.collect(child));
  }

  private resolveImport(specifier: string): string | null {
    if (!specifier.startsWith('.')) return null;
    const base = resolve(this.root, dirname(this.relativePath), specifier);
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.mjs`,
      `${base}.cjs`,
      resolve(base, 'index.ts'),
    ];
    for (const candidate of candidates) {
      try {
        if (statSync(candidate).isFile()) {
          return normalized(relative(this.root, candidate));
        }
      } catch {
        // Continue through the bounded local-module candidates.
      }
    }
    return null;
  }

  private loadModule(relativePath: string): ModuleModel {
    const cached = this.moduleCache.get(relativePath);
    if (cached !== undefined) return cached;
    const model = new ModuleModel(
      this.root,
      relativePath,
      readFileSync(resolve(this.root, relativePath), 'utf8'),
      this.moduleCache,
    );
    this.moduleCache.set(relativePath, model);
    return model;
  }

  evaluate(
    node: ts.Expression,
    bindings: Map<string, Flow> = new Map(),
    seen: Set<string> = new Set(),
  ): Flow {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return { paths: new Set([normalized(node.text)]), sources: new Set() };
    }

    if (ts.isRegularExpressionLiteral(node)) return emptyFlow();

    if (ts.isIdentifier(node)) {
      const bound = bindings.get(node.text);
      if (bound !== undefined) return bound;
      const initializer = this.variables.get(node.text);
      const key = `${this.relativePath}:variable:${node.text}`;
      if (initializer !== undefined && !seen.has(key)) {
        const nextSeen = new Set(seen).add(key);
        return this.evaluate(initializer, bindings, nextSeen);
      }
      return emptyFlow();
    }

    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAwaitExpression(node)
    ) {
      return this.evaluate(node.expression, bindings, seen);
    }

    if (ts.isArrayLiteralExpression(node)) {
      return mergeFlows(
        node.elements
          .filter(ts.isExpression)
          .map((element) => this.evaluate(element, bindings, seen)),
      );
    }

    if (ts.isObjectLiteralExpression(node)) {
      return mergeFlows(
        node.properties.flatMap((property) => {
          if (ts.isPropertyAssignment(property)) {
            return [this.evaluate(property.initializer, bindings, seen)];
          }
          if (ts.isShorthandPropertyAssignment(property)) {
            return [this.evaluate(property.name, bindings, seen)];
          }
          return [];
        }),
      );
    }

    if (ts.isTemplateExpression(node)) {
      const flows = node.templateSpans.map((span) =>
        this.evaluate(span.expression, bindings, seen),
      );
      const merged = mergeFlows(flows);
      if (flows.every((flow) => flow.paths.size === 1 && flow.sources.size === 0)) {
        let value = node.head.text;
        node.templateSpans.forEach((span, index) => {
          value += [...flows[index].paths][0] + span.literal.text;
        });
        merged.paths.add(normalized(value));
      }
      return merged;
    }

    if (ts.isBinaryExpression(node)) {
      const left = this.evaluate(node.left, bindings, seen);
      const right = this.evaluate(node.right, bindings, seen);
      const merged = mergeFlows([left, right]);
      if (
        node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        left.paths.size === 1 &&
        right.paths.size === 1 &&
        left.sources.size === 0 &&
        right.sources.size === 0
      ) {
        merged.paths.add(normalized(`${[...left.paths][0]}${[...right.paths][0]}`));
      }
      return merged;
    }

    if (ts.isConditionalExpression(node)) {
      return mergeFlows([
        this.evaluate(node.whenTrue, bindings, seen),
        this.evaluate(node.whenFalse, bindings, seen),
      ]);
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      return this.evaluate(node.expression, bindings, seen);
    }

    if (ts.isCallExpression(node)) {
      return this.evaluateCall(node, bindings, seen);
    }

    return emptyFlow();
  }

  private evaluateCall(
    node: ts.CallExpression,
    bindings: Map<string, Flow>,
    seen: Set<string>,
  ): Flow {
    const argumentFlows = node.arguments.map((argument) =>
      this.evaluate(argument, bindings, seen),
    );

    if (ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      if (
        name === 'readFileSync' ||
        name === 'readFile' ||
        this.nativeReadBindings.has(name)
      ) {
        return {
          paths: new Set(),
          sources: new Set(argumentFlows[0]?.paths ?? []),
        };
      }
      if (name === 'JSON' || name === 'String') {
        return mergeFlows(argumentFlows);
      }
      const local = this.functions.get(name);
      if (local !== undefined) {
        return this.evaluateFunction(local, argumentFlows, bindings, seen);
      }
      const imported = this.imports.get(name);
      if (imported !== undefined) {
        const model = this.loadModule(imported.modulePath);
        const fn = model.functions.get(imported.exportedName);
        if (fn !== undefined) {
          return model.evaluateFunction(fn, argumentFlows, new Map(), seen);
        }
      }
      return mergeFlows(argumentFlows);
    }

    if (ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const method = node.expression.name.text;

      if (
        (method === 'readFileSync' || method === 'readFile') &&
        (ts.isPropertyAccessExpression(receiver) ||
          (ts.isIdentifier(receiver) &&
            (this.nativeFileSystemNamespaces.has(receiver.text) ||
              receiver.text === 'fs')))
      ) {
        return {
          paths: new Set(),
          sources: new Set(argumentFlows[0]?.paths ?? []),
        };
      }

      if (ts.isIdentifier(receiver)) {
        const namespacePath = this.namespaces.get(receiver.text);
        if (namespacePath !== undefined) {
          const model = this.loadModule(namespacePath);
          const fn = model.functions.get(method);
          if (fn !== undefined) {
            return model.evaluateFunction(fn, argumentFlows, new Map(), seen);
          }
        }
      }

      if (['resolve', 'join'].includes(method)) {
        return mergeFlows(argumentFlows);
      }

      const receiverFlow = this.evaluate(receiver, bindings, seen);
      if (method === 'map' || method === 'flatMap') {
        if (node.arguments.length === 0) return receiverFlow;
        const callback = node.arguments[0];
        const callbackArgument: Flow = {
          paths: new Set(receiverFlow.paths),
          sources: new Set(receiverFlow.sources),
        };
        if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
          return this.evaluateFunction(
            callback,
            [callbackArgument],
            bindings,
            seen,
          );
        }
        if (ts.isIdentifier(callback)) {
          const local = this.functions.get(callback.text);
          if (local !== undefined) {
            return this.evaluateFunction(local, [callbackArgument], bindings, seen);
          }
          const imported = this.imports.get(callback.text);
          if (imported !== undefined) {
            const model = this.loadModule(imported.modulePath);
            const fn = model.functions.get(imported.exportedName);
            if (fn !== undefined) {
              return model.evaluateFunction(fn, [callbackArgument], new Map(), seen);
            }
          }
        }
        return receiverFlow;
      }

      if (
        [
          'join',
          'replace',
          'replaceAll',
          'trim',
          'trimEnd',
          'trimStart',
          'toString',
          'slice',
          'filter',
        ].includes(method)
      ) {
        return mergeFlows([receiverFlow, ...argumentFlows]);
      }

      return mergeFlows([receiverFlow, ...argumentFlows]);
    }

    return mergeFlows(argumentFlows);
  }

  private evaluateFunction(
    fn: FunctionLike,
    argumentFlows: Flow[],
    parentBindings: Map<string, Flow>,
    seen: Set<string>,
  ): Flow {
    const key = `${this.relativePath}:function:${fn.pos}`;
    if (seen.has(key)) return emptyFlow();
    const nextSeen = new Set(seen).add(key);
    const bindings = new Map(parentBindings);
    fn.parameters.forEach((parameter, index) => {
      if (ts.isIdentifier(parameter.name)) {
        bindings.set(parameter.name.text, argumentFlows[index] ?? emptyFlow());
      }
    });

    if (ts.isArrowFunction(fn) && ts.isExpression(fn.body)) {
      return this.evaluate(fn.body, bindings, nextSeen);
    }

    if (fn.body === undefined) return emptyFlow();
    const returns: Flow[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isReturnStatement(node) && node.expression !== undefined) {
        returns.push(this.evaluate(node.expression, bindings, nextSeen));
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.body);
    return mergeFlows(returns);
  }
}

const matcherNames = new Set([
  'toBe',
  'toContain',
  'toEqual',
  'toMatch',
  'toStrictEqual',
]);

const findExpectArgument = (node: ts.Expression): ts.Expression | null => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'expect' &&
    node.arguments.length > 0
  ) {
    return node.arguments[0];
  }
  if (ts.isPropertyAccessExpression(node)) {
    return findExpectArgument(node.expression);
  }
  if (ts.isCallExpression(node)) {
    return findExpectArgument(node.expression);
  }
  return null;
};

const excludedReadLikeCalls = new Set([
  'describe',
  'expect',
  'it',
  'test',
  'toBe',
  'toContain',
  'toEqual',
  'toMatch',
  'toStrictEqual',
]);

const callName = (node: ts.CallExpression): string => {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return '';
};

export const analyzeContractFile = ({
  root,
  relativePath,
  policy,
  contractClass,
}: {
  root: string;
  relativePath: string;
  policy: ContractSurfacePolicy;
  contractClass?: ContractClass;
}): ContractPolicyFinding[] => {
  const normalizedPath = normalized(relativePath);
  const source = readFileSync(resolve(root, normalizedPath), 'utf8');
  const moduleCache = new Map<string, ModuleModel>();
  const model = new ModuleModel(root, normalizedPath, source, moduleCache);
  moduleCache.set(normalizedPath, model);
  const findings: ContractPolicyFinding[] = [];
  const findingKeys = new Set<string>();
  const mutable = new Set(policy.mutableCurrentStateDocuments);
  const stable = new Set(policy.stableArchitecturePolicyDocuments);
  const repositoryPolicy = new Set(policy.repositoryPolicyDocuments);
  const effectiveClass =
    contractClass ?? policy.contractClasses[normalizedPath] ?? 'historical-evidence';
  const currentStateAllowed = effectiveClass === 'current-state';
  const policyAllowed = effectiveClass === 'policy-enforcement';
  const historicalStableOwners = new Set(
    policy.historicalStableDocumentOwners[normalizedPath] ?? [],
  );

  const addFinding = (
    code: ContractPolicyFinding['code'],
    node: ts.Node,
    message: string,
  ): void => {
    const location = model.sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const key = `${code}:${location.line}:${message}`;
    if (findingKeys.has(key)) return;
    findingKeys.add(key);
    findings.push({
      code,
      relativePath: normalizedPath,
      line: location.line + 1,
      column: location.character + 1,
      message,
    });
  };

  const visit = (node: ts.Node, bindings: Map<string, Flow>): void => {
    if (ts.isForOfStatement(node)) {
      const iterable = model.evaluate(node.expression, bindings);
      const nextBindings = new Map(bindings);
      if (
        ts.isVariableDeclarationList(node.initializer) &&
        node.initializer.declarations.length === 1 &&
        ts.isIdentifier(node.initializer.declarations[0].name)
      ) {
        nextBindings.set(node.initializer.declarations[0].name.text, iterable);
      }
      visit(node.statement, nextBindings);
      return;
    }

    if (ts.isCallExpression(node)) {
      const flow = model.evaluate(node, bindings);
      const mutableSources = [...flow.sources].filter((path) => mutable.has(path));
      const policySources = [...flow.sources].filter((path) =>
        repositoryPolicy.has(path),
      );
      const unownedStableSources = [...flow.sources].filter(
        (path) =>
          stable.has(path) &&
          effectiveClass === 'historical-evidence' &&
          !historicalStableOwners.has(path),
      );
      const name = callName(node);

      if (
        mutableSources.length > 0 &&
        !currentStateAllowed &&
        !excludedReadLikeCalls.has(name)
      ) {
        addFinding(
          'MUTABLE_CURRENT_STATE_READ',
          node,
          `historical/shared contract reads mutable current-state source(s): ${mutableSources.sort().join(', ')}`,
        );
      }

      if (
        policySources.length > 0 &&
        !policyAllowed &&
        !excludedReadLikeCalls.has(name)
      ) {
        addFinding(
          'REPOSITORY_POLICY_FAN_OUT',
          node,
          `contract reads repository policy evidence owned by the enforcement contract: ${policySources.sort().join(', ')}`,
        );
      }

      if (
        unownedStableSources.length > 0 &&
        !excludedReadLikeCalls.has(name)
      ) {
        addFinding(
          'HISTORICAL_SHARED_ARCHITECTURE_READ',
          node,
          `historical contract reads shared architecture surface not owned by that contract: ${unownedStableSources.sort().join(', ')}`,
        );
      }

      if (
        ts.isPropertyAccessExpression(node.expression) &&
        matcherNames.has(node.expression.name.text)
      ) {
        const expectArgument = findExpectArgument(node.expression.expression);
        if (expectArgument !== null) {
          const targetSources = model.evaluate(expectArgument, bindings).sources;
          const stableTargets = [...targetSources].filter(
            (path) => stable.has(path) || mutable.has(path),
          );
          if (
            stableTargets.length > 0 &&
            node.arguments.some((argument) => containsHistoricalEvidence(argument))
          ) {
            addFinding(
              'HISTORICAL_ASSERTION_ON_STABLE_SURFACE',
              node,
              `historical checkpoint evidence is asserted against a mutable/stable shared surface: ${stableTargets.sort().join(', ')}`,
            );
          }

          const repositoryPolicyTargets = [...targetSources].filter((path) =>
            repositoryPolicy.has(path),
          );
          if (
            repositoryPolicyTargets.length > 0 &&
            node.arguments.some((argument) => containsExactProse(argument))
          ) {
            addFinding(
              'EXACT_PROSE_ASSERTION_ON_REPOSITORY_POLICY',
              node,
              `repository policy enforcement must use structured policy data instead of exact prose assertions: ${repositoryPolicyTargets.sort().join(', ')}`,
            );
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, bindings));
  };

  visit(model.sourceFile, new Map());
  return findings;
};

export const analyzeRepositoryContractPolicy = (
  root: string,
): ContractPolicyFinding[] => {
  const policy = loadContractSurfacePolicy(root);
  const discovered = discoverContractFiles(root);
  const classified = Object.keys(policy.contractClasses).sort();
  const findings: ContractPolicyFinding[] = [];

  for (const relativePath of discovered.filter(
    (path) => !Object.prototype.hasOwnProperty.call(policy.contractClasses, path),
  )) {
    findings.push({
      code: 'UNCLASSIFIED_CONTRACT',
      relativePath,
      line: 1,
      column: 1,
      message: 'contract is not classified by test/contract-surface-policy.json',
    });
  }

  for (const relativePath of classified.filter(
    (path) => !discovered.includes(path),
  )) {
    findings.push({
      code: 'STALE_CONTRACT_CLASSIFICATION',
      relativePath,
      line: 1,
      column: 1,
      message: 'policy classifies a contract file that is not present',
    });
  }

  for (const relativePath of discovered) {
    findings.push(
      ...analyzeContractFile({ root, relativePath, policy }),
    );
  }

  return findings;
};
