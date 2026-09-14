#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { runChecked } from './lib/process.mjs';
import {
  validateManifest,
  validateValidationProfiles,
} from './lib/manifest.mjs';

const root = process.cwd();
const runnerRoot = resolve(root, 'tools/module-runner');
const compactSource = (value) => value.replace(/\s+/g, '');
const sourceIncludes = (source, snippet) =>
  compactSource(source).includes(compactSource(snippet));

function validateFormatterStableSourceMatcher() {
  const formatted = `this.runtimeReads.findEnabledCandidatesForReport(
  {
    tenantId: envelope.tenantId,
  },
)`;
  if (
    !sourceIncludes(
      formatted,
      'this.runtimeReads.findEnabledCandidatesForReport({',
    )
  ) {
    throw new Error('Formatter-stable source matcher regression.');
  }
}

function stripCommentsAndQuotedStrings(source) {
  let result = '';
  let index = 0;
  let state = 'code';
  let quote = '';
  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1] ?? '';
    if (state === 'code') {
      if (character === '/' && next === '/') {
        state = 'line-comment';
        result += '  ';
        index += 2;
        continue;
      }
      if (character === '/' && next === '*') {
        state = 'block-comment';
        result += '  ';
        index += 2;
        continue;
      }
      if (character === "'" || character === '"') {
        state = 'quoted-string';
        quote = character;
        result += ' ';
        index += 1;
        continue;
      }
      result += character;
      index += 1;
      continue;
    }
    if (state === 'line-comment') {
      result += character === '\n' ? '\n' : ' ';
      if (character === '\n') state = 'code';
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        state = 'code';
        result += '  ';
        index += 2;
      } else {
        result += character === '\n' ? '\n' : ' ';
        index += 1;
      }
      continue;
    }
    if (character === '\\') {
      result += '  ';
      index += 2;
    } else if (character === quote) {
      state = 'code';
      result += ' ';
      index += 1;
    } else {
      result += character === '\n' ? '\n' : ' ';
      index += 1;
    }
  }
  return result;
}

function findUnusedNamedImports(relativePath, source) {
  if (
    !relativePath.startsWith('src/') ||
    !relativePath.endsWith('.ts') ||
    relativePath.endsWith('.spec.ts')
  ) {
    return [];
  }
  const importPattern =
    /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"]\s*;/g;
  const imports = [];
  const spans = [];
  for (const match of source.matchAll(importPattern)) {
    spans.push([match.index, match.index + match[0].length]);
    for (const rawEntry of match[1].split(',')) {
      const entry = rawEntry.trim().replace(/^type\s+/, '');
      if (!entry) continue;
      const localName = entry.includes(' as ')
        ? entry.slice(entry.lastIndexOf(' as ') + 4).trim()
        : entry;
      if (/^[A-Za-z_$][\w$]*$/.test(localName)) imports.push(localName);
    }
  }
  const bodyCharacters = [...source];
  for (const [start, end] of spans) {
    for (let index = start; index < end; index += 1) {
      if (bodyCharacters[index] !== '\n') bodyCharacters[index] = ' ';
    }
  }
  const body = stripCommentsAndQuotedStrings(bodyCharacters.join(''));
  return imports.filter(
    (localName) => !new RegExp(`\\b${localName}\\b`, 'u').test(body),
  );
}

async function validateRuntimeSourceNamedImports(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot, 'src');
  const sourceFiles = (await collectFiles(sourceRoot)).filter(
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
  );
  for (const sourcePath of sourceFiles) {
    const relativePath = sourcePath
      .slice(repositoryRoot.length + 1)
      .replaceAll('\\\\', '/');
    const source = await readFile(sourcePath, 'utf8');
    const unused = findUnusedNamedImports(relativePath, source);
    if (unused.length > 0) {
      throw new Error(
        `${relativePath} contains unused named import(s): ${unused.join(', ')}`,
      );
    }
  }

  const mutation =
    `import { UsedType, UnusedType } from './fixture';\n` +
    `export type Proof = UsedType;\n`;
  const mutationFindings = findUnusedNamedImports('src/fixture.ts', mutation);
  if (mutationFindings.length !== 1 || mutationFindings[0] !== 'UnusedType') {
    throw new Error('Unused named import mutation guard regression.');
  }
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  validateFormatterStableSourceMatcher();
  const files = await collectFiles(runnerRoot);
  const modules = files.filter((path) => extname(path) === '.mjs');

  for (const modulePath of modules) {
    await runChecked(process.execPath, ['--check', modulePath], {
      cwd: root,
      timeoutMs: 30_000,
    });
  }

  const template = JSON.parse(
    await readFile(resolve(runnerRoot, 'manifests', 'TEMPLATE.json'), 'utf8'),
  );
  validateManifest(template, 'tools/module-runner/manifests/TEMPLATE.json');

  const profilePath = resolve(
    runnerRoot,
    'profiles',
    'validation-profiles.json',
  );
  const profiles = JSON.parse(await readFile(profilePath, 'utf8'));
  validateValidationProfiles(
    profiles,
    'tools/module-runner/profiles/validation-profiles.json',
  );
  validateDatabaseIntegrationProfileEnvironmentGuards(profiles);
  validateBaseCompatibleGateOrderGuard(profiles);

  await validateHandoffProtocolConsistency(root);
  await validateLifecycleFormattingInvariant(root);
  await validateOptionalHandoffContextInvariant(root);
  await validateValidationProfileContractFlexibility(root);
  await validateValidationStepContractShapes(root);
  await validateProjectConfigContractTypeShapes(root);
  await validateRuntimeSourceNamedImports(root);
  await validateStableContractMutableSurfaceIsolation(root);
  await validateHistoricalRemediationBoundaryInvariant(root);
  await validateAutomationReservationTimestampInvariant(root);
  await validateStructuredLoggingLiteralEvents(root);
  await validateClosureInvariantBindings(root);
  await validateIosFinalReleasePolicy(root);
  await validateAutomationCommandDispatchSelection(root);
  await validateAutomationCommandDispatchImplementation(root);
  await validateAutomationTelemetryCoordinationSelection(root);
  await validateAutomationTelemetryCoordinationImplementation(root);
  await validateAutomationTelemetryClosureRetrySelection(root);
  await validateBootstrapFailFastPreamble(root);

  console.log(`Checked ${modules.length} module-runner JavaScript files.`);
  console.log('MODULE RUNNER SOURCE CHECK PASSED');
}

async function validateLifecycleFormattingInvariant(repositoryRoot) {
  const manager = await readFile(
    resolve(repositoryRoot, 'scripts/manage-module-state.mjs'),
    'utf8',
  );

  for (const snippet of [
    'normalizeManagedLifecycleBlock',
    "content.replace(/\\s+/g, ' ').trim()",
    'extractManagedLifecycleBlock',
    'actualBlock !== expectedBlock',
  ]) {
    if (!manager.includes(snippet)) {
      throw new Error(
        `Lifecycle formatting guard is missing formatter-stable invariant ${snippet}.`,
      );
    }
  }

  if (manager.includes('content.includes(expectedBlock)')) {
    throw new Error(
      'Lifecycle validation must not compare a raw formatter-sensitive Markdown block.',
    );
  }
}

async function validateOptionalHandoffContextInvariant(repositoryRoot) {
  const handoff = await readFile(
    resolve(repositoryRoot, 'tools/module-runner/lib/handoff-core.mjs'),
    'utf8',
  );

  for (const snippet of [
    "const OPTIONAL_CONTEXT_PATHS = ['docs/ios-final-release-proof-policy.md'];",
    'SAFE_DEFAULT_RELEASE_POLICY',
    'resolveReleasePolicy',
    'selectExistingContextPaths',
    "error?.code !== 'ENOENT'",
    '...optionalContextPaths',
  ]) {
    if (!handoff.includes(snippet)) {
      throw new Error(
        `Portable handoff optional-context guard is missing ${snippet}.`,
      );
    }
  }

  const coreStart = handoff.indexOf('const CORE_CONTEXT_PATHS = [');
  const coreEnd = handoff.indexOf('];', coreStart);
  const coreBlock = handoff.slice(coreStart, coreEnd);
  if (coreBlock.includes('docs/ios-final-release-proof-policy.md')) {
    throw new Error(
      'Slice-specific iOS policy documentation must not be a mandatory core handoff fixture path.',
    );
  }
}

function validateDatabaseIntegrationProfileEnvironmentGuards(profiles) {
  const source = 'database-integration-profile-regression';
  const locateStep = (candidate) => {
    for (const steps of Object.values(candidate.profiles ?? {})) {
      const step = steps.find(
        (entry) =>
          entry.command === 'npm' &&
          entry.args?.[0] === 'run' &&
          entry.args?.[1] === 'test:integration:db',
      );
      if (step) return step;
    }
    throw new Error('No database integration validation step is registered.');
  };
  const assertRejected = (mutate, expectedMessage) => {
    const candidate = structuredClone(profiles);
    mutate(locateStep(candidate));
    try {
      validateValidationProfiles(candidate, source);
    } catch (error) {
      if (error instanceof Error && error.message.includes(expectedMessage)) {
        return;
      }
      throw error;
    }
    throw new Error(
      `Database integration profile guard did not reject ${expectedMessage}.`,
    );
  };

  assertRejected(
    (step) => delete step.env.DATABASE_INTEGRATION_TESTS_ALLOWED,
    'DATABASE_INTEGRATION_TESTS_ALLOWED=true',
  );
  assertRejected((step) => {
    delete step.requiredEnv;
    delete step.env.TEST_DATABASE_URL;
    delete step.env.DATABASE_URL;
  }, 'safe literal URL or requiredEnv TEST_DATABASE_URL');
  assertRejected((step) => {
    delete step.requiredEnv;
    step.env.TEST_DATABASE_URL =
      'postgresql://module_runner:module_runner@database.example.com:5432/iot_platform';
  }, 'loopback host');
}

function validateBaseCompatibleGateOrderGuard(profiles) {
  const source = 'base-compatible-gate-order-regression';
  const candidate = structuredClone(profiles);
  const entry = Object.entries(candidate.profiles).find(([, steps]) =>
    steps.some(
      (step) =>
        step.command === 'npm' &&
        JSON.stringify(step.args) ===
          JSON.stringify(['test', '--', '--runInBand']),
    ),
  );
  if (!entry) {
    throw new Error('No broad validation profile is registered.');
  }
  const [, steps] = entry;
  const selfTestIndex = steps.findIndex(
    (step) =>
      step.command === 'node' &&
      JSON.stringify(step.args) ===
        JSON.stringify(['tools/module-runner/self-test.mjs']),
  );
  const sourceIndex = steps.findIndex(
    (step) =>
      step.command === 'npm' &&
      JSON.stringify(step.args) ===
        JSON.stringify(['run', 'module:runner:check']),
  );
  if (selfTestIndex < 0 || sourceIndex < 0) {
    throw new Error('Broad profile is missing self-test or source-check gate.');
  }

  const [sourceStep] = steps.splice(sourceIndex, 1);
  const currentSelfTestIndex = steps.findIndex(
    (step) =>
      step.command === 'node' &&
      JSON.stringify(step.args) ===
        JSON.stringify(['tools/module-runner/self-test.mjs']),
  );
  steps.splice(currentSelfTestIndex, 0, sourceStep);

  try {
    validateValidationProfiles(candidate, source);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('must order self-test before source check')
    ) {
      return;
    }
    throw error;
  }
  throw new Error(
    'Validation profile guard did not reject source check before self-test.',
  );
}

async function validateHandoffProtocolConsistency(repositoryRoot) {
  const handoffPath = resolve(
    repositoryRoot,
    'tools/module-runner/lib/handoff-core.mjs',
  );
  const contractPath = resolve(
    repositoryRoot,
    'test/module-execution-framework.contract.spec.ts',
  );
  const architecturePath = resolve(repositoryRoot, 'docs/architecture.md');
  const projectStatePath = resolve(repositoryRoot, 'docs/project-state.md');

  const [handoff, contract, architecture, projectState] = await Promise.all([
    readFile(handoffPath, 'utf8'),
    readFile(contractPath, 'utf8'),
    readFile(architecturePath, 'utf8'),
    readFile(projectStatePath, 'utf8'),
  ]);

  const protocolMatch = handoff.match(
    /const HANDOFF_PROTOCOL_VERSION = (\d+);/,
  );
  if (!protocolMatch) {
    throw new Error('Handoff protocol version constant is missing.');
  }

  const protocolVersion = Number(protocolMatch[1]);
  if (!Number.isSafeInteger(protocolVersion) || protocolVersion < 1) {
    throw new Error(`Invalid handoff protocol version: ${protocolMatch[1]}`);
  }

  const derivedSchema =
    'const HANDOFF_SCHEMA = `iot-platform-portable-handoff-v${HANDOFF_PROTOCOL_VERSION}`;';
  if (!handoff.includes(derivedSchema)) {
    throw new Error(
      'Handoff schema must be derived from HANDOFF_PROTOCOL_VERSION.',
    );
  }

  const pinnedAssertion = contract.match(
    /toContain\(['"]iot-platform-portable-handoff-v\d+['"]\)/,
  );
  if (pinnedAssertion) {
    throw new Error(
      `Pinned handoff protocol assertion is forbidden: ${pinnedAssertion[0]}`,
    );
  }

  const currentMarker = `MODULE-EXECUTION-HANDOFF-PROTOCOL-V${protocolVersion}`;
  for (const [path, content] of [
    ['docs/architecture.md', architecture],
    ['docs/project-state.md', projectState],
  ]) {
    if (!content.includes(currentMarker)) {
      throw new Error(
        `${path} is missing current handoff protocol marker ${currentMarker}.`,
      );
    }
  }
}

async function validateValidationProfileContractFlexibility(repositoryRoot) {
  const testRoot = resolve(repositoryRoot, 'test');
  const contractPaths = (await collectFiles(testRoot)).filter((path) =>
    path.endsWith('.contract.spec.ts'),
  );

  for (const contractPath of contractPaths) {
    const contract = await readFile(contractPath, 'utf8');
    if (
      /profile\.map\([\s\S]{0,160}?\.toEqual\(\s*\[/.test(contract) ||
      /expect\(labels\)\.toEqual\(\s*\[/.test(contract)
    ) {
      throw new Error(
        `${contractPath}: validation-profile contracts must assert required labels and safety partial order, not freeze the entire profile array.`,
      );
    }

    for (const match of contract.matchAll(
      /expectLabelsInOrder\([\s\S]*?,\s*\[([\s\S]*?)\]\s*,?\s*\);/g,
    )) {
      const labels = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map(
        (labelMatch) => labelMatch[1],
      );
      const lifecycleIndex = labels.indexOf('Current lifecycle validation');
      const simulationIndex = labels.indexOf(
        'Lifecycle simulation through Module 30',
      );
      const focusedIndex = labels.findIndex((label) =>
        label.startsWith('Focused '),
      );
      if (
        focusedIndex >= 0 &&
        lifecycleIndex >= 0 &&
        simulationIndex >= 0 &&
        !(lifecycleIndex < simulationIndex && simulationIndex < focusedIndex)
      ) {
        throw new Error(
          `${contractPath}: stale validation-profile contract order; lifecycle validation and simulation must precede focused Jest.`,
        );
      }
    }
  }
}

async function validateValidationStepContractShapes(repositoryRoot) {
  const testRoot = resolve(repositoryRoot, 'test');
  const contractPaths = (await collectFiles(testRoot)).filter((path) =>
    path.endsWith('.contract.spec.ts'),
  );

  for (const contractPath of contractPaths) {
    const contract = await readFile(contractPath, 'utf8');
    const typeMatch = contract.match(
      /type\s+ValidationStep\s*=\s*\{([\s\S]*?)\};/,
    );
    if (!typeMatch) continue;

    const declaredFields = new Set(
      [...typeMatch[1].matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map(
        (match) => match[1],
      ),
    );
    const accessedFields = new Set([
      ...[...contract.matchAll(/\bstep\.([A-Za-z_$][\w$]*)/g)].map(
        (match) => match[1],
      ),
      ...[
        ...contract.matchAll(/\bprofile\[[^\]]+\]\?\.([A-Za-z_$][\w$]*)/g),
      ].map((match) => match[1]),
    ]);

    for (const field of accessedFields) {
      if (!declaredFields.has(field)) {
        throw new Error(
          `${contractPath}: ValidationStep accesses .${field} but the local type does not declare ${field}.`,
        );
      }
    }

    if (accessedFields.has('env')) {
      const envDeclaration = typeMatch[1].match(
        /\benv\??\s*:\s*Record<string,\s*string>/,
      );
      if (!envDeclaration) {
        throw new Error(
          `${contractPath}: ValidationStep.env must be declared as Record<string, string> when profile environment is asserted.`,
        );
      }
    }
  }
}

function extractNamedObjectTypeBlock(source, propertyName) {
  const marker = new RegExp(`\\b${propertyName}\\s*:\\s*\\{`, 'g');
  const match = marker.exec(source);
  if (!match) return null;
  const openIndex = source.indexOf('{', match.index);
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, index);
    }
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function projectConfigDevelopmentTypeFindings(contractPath, contract) {
  if (!contract.includes('project-config.json')) return [];
  const configStart = contract.indexOf('const config = JSON.parse');
  if (configStart < 0) return [];
  const typeStart = contract.indexOf('as {', configStart);
  if (typeStart < 0) return [];
  const contractType = contract.slice(typeStart + 3);
  const developmentBlock = extractNamedObjectTypeBlock(
    contractType,
    'development',
  );
  if (!developmentBlock) return [];

  const declaredFields = new Set(
    [...developmentBlock.matchAll(/\b([A-Za-z_$][\w$]*)\??\s*:/g)].map(
      (match) => match[1],
    ),
  );
  const accessedFields = new Set(
    [...contract.matchAll(/\bconfig\.development\.([A-Za-z_$][\w$]*)/g)].map(
      (match) => match[1],
    ),
  );
  for (const aliasMatch of contract.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*config\.development\s*;/g,
  )) {
    const alias = escapeRegExp(aliasMatch[1]);
    for (const access of contract.matchAll(
      new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, 'g'),
    )) {
      accessedFields.add(access[1]);
    }
  }

  return [...accessedFields]
    .filter((field) => !declaredFields.has(field))
    .map(
      (field) =>
        `${contractPath}: project-config development accesses .${field} but the local type does not declare ${field}.`,
    );
}

async function validateProjectConfigContractTypeShapes(repositoryRoot) {
  const testRoot = resolve(repositoryRoot, 'test');
  const contractPaths = (await collectFiles(testRoot)).filter((path) =>
    path.endsWith('.contract.spec.ts'),
  );

  for (const contractPath of contractPaths) {
    const contract = await readFile(contractPath, 'utf8');
    const findings = projectConfigDevelopmentTypeFindings(
      contractPath,
      contract,
    );
    if (findings.length > 0) throw new Error(findings.join('\n'));
  }

  const lifecyclePath = resolve(
    repositoryRoot,
    'test/module-lifecycle.contract.spec.ts',
  );
  const lifecycle = await readFile(lifecyclePath, 'utf8');
  const mutated = lifecycle.replace(/\n\s*milestone\s*:\s*string;\s*/, '\n');
  if (mutated === lifecycle) {
    throw new Error(
      'Project-config type-shape guard fixture is missing milestone: string.',
    );
  }
  const mutationFindings = projectConfigDevelopmentTypeFindings(
    lifecyclePath,
    mutated,
  );
  if (!mutationFindings.some((finding) => finding.includes('.milestone'))) {
    throw new Error(
      'Project-config type-shape guard did not reject undeclared milestone access.',
    );
  }
}

async function validateStructuredLoggingLiteralEvents(repositoryRoot) {
  const sourceRoot = resolve(repositoryRoot, 'src');
  const sourceFiles = (await collectFiles(sourceRoot)).filter(
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
  );
  const loggerCallPattern =
    /\b(?:this\.)?logger\.(?:log|warn|error|debug|verbose|fatal)\(\s*\{([\s\S]*?)\}\s*\);/g;
  const eventNamePattern = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;
  const violations = [];

  for (const sourcePath of sourceFiles) {
    const source = await readFile(sourcePath, 'utf8');
    const calls = [...source.matchAll(loggerCallPattern)];
    for (const [index, call] of calls.entries()) {
      const eventMatch = call[1].match(/\bevent\s*:\s*'([^']+)'/);
      const eventName = eventMatch?.[1];
      if (!eventName || !eventNamePattern.test(eventName)) {
        violations.push(`${sourcePath}#logger-call-${index + 1}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `Structured logger events must use valid literal event names: ${violations.join(', ')}`,
    );
  }
}

async function validateAutomationReservationTimestampInvariant(repositoryRoot) {
  const repositoryPath = resolve(
    repositoryRoot,
    'src/automation/automation-execution.repository.ts',
  );
  const repositorySpecPath = resolve(
    repositoryRoot,
    'src/automation/automation-execution.repository.spec.ts',
  );
  const repository = await readFile(repositoryPath, 'utf8');
  const repositorySpec = await readFile(repositorySpecPath, 'utf8');
  const start = repository.indexOf(
    'await transaction.automationExecutionAction.createMany({',
  );
  const end = repository.indexOf('\n        });', start);
  if (start < 0 || end < 0) {
    throw new Error(
      'Automation reservation action createMany block could not be located.',
    );
  }
  const createManyBlock = repository.slice(start, end);
  const createdAtIndex = createManyBlock.indexOf('createdAt: databaseNow,');
  const completedAtIndex = createManyBlock.indexOf(
    'completedAt: suppressed ? databaseNow : null,',
  );
  if (createdAtIndex < 0 || completedAtIndex < 0) {
    throw new Error(
      'Automation reservation actions must bind createdAt and terminal completedAt to databaseNow.',
    );
  }
  if (createdAtIndex >= completedAtIndex) {
    throw new Error(
      'Automation reservation action createdAt must be explicitly bound before completedAt.',
    );
  }
  const pendingTimestampAssertion =
    /status: AutomationExecutionActionStatus\.PENDING,[\s\S]{0,160}?createdAt: databaseNow,[\s\S]{0,80}?completedAt: null,/;
  const suppressedTimestampAssertion =
    /errorCode: 'EXECUTION_SUPPRESSED_(?:COOLDOWN|LOOP)',[\s\S]{0,120}?createdAt: databaseNow,[\s\S]{0,80}?completedAt: databaseNow,/;
  if (
    !pendingTimestampAssertion.test(repositorySpec) ||
    !suppressedTimestampAssertion.test(repositorySpec)
  ) {
    throw new Error(
      'Automation reservation timestamp regression assertions are missing.',
    );
  }
}

async function validateClosureInvariantBindings(repositoryRoot) {
  const docsRoot = resolve(repositoryRoot, 'docs');
  const testRoot = resolve(repositoryRoot, 'test');
  const legacyProseClosures = new Set([
    'module-11-automation-evaluation-foundation-closure.md',
    'module-11-automation-execution-reservation-foundation-closure.md',
    'module-11-automation-runtime-safety-contract-closure.md',
  ]);
  const closurePaths = (await collectFiles(docsRoot)).filter((path) =>
    path.endsWith('-closure.md'),
  );
  const contractPaths = (await collectFiles(testRoot)).filter((path) =>
    path.endsWith('.contract.spec.ts'),
  );
  const markerPattern = /CLOSURE_INVARIANT_[A-Z0-9_]+=[A-Za-z0-9._-]+/g;
  const documentMarkers = new Map();

  for (const closurePath of closurePaths) {
    const filename = basename(closurePath);
    const closure = await readFile(closurePath, 'utf8');
    const markers = [...closure.matchAll(markerPattern)].map(
      (match) => match[0],
    );
    if (legacyProseClosures.has(filename)) {
      continue;
    }
    const schemaMarkers = markers.filter((marker) =>
      marker.endsWith('_SCHEMA=1'),
    );
    if (schemaMarkers.length !== 1) {
      throw new Error(
        `${closurePath}: every new closure document must define exactly one namespaced CLOSURE_INVARIANT_*_SCHEMA=1 marker.`,
      );
    }
    if (markers.length < 2) {
      throw new Error(
        `${closurePath}: closure documents must expose machine-readable safety invariants, not only narrative prose.`,
      );
    }
    for (const marker of markers) {
      if (documentMarkers.has(marker)) {
        throw new Error(
          `${closurePath}: duplicate closure invariant marker ${marker}; markers must be globally namespaced and unique.`,
        );
      }
      documentMarkers.set(marker, closurePath);
    }
  }

  const assertedMarkers = new Map();
  for (const contractPath of contractPaths) {
    const contract = await readFile(contractPath, 'utf8');
    const markerAssertions = [
      ...contract.matchAll(
        /expect\(closure\)\.toContain\(\s*['"`](CLOSURE_INVARIANT_[A-Z0-9_]+=[A-Za-z0-9._-]+)['"`]\s*,?\s*\)/g,
      ),
    ].map((match) => match[1]);

    if (markerAssertions.length > 0) {
      for (const match of contract.matchAll(
        /expect\(closure\)\.toContain\(\s*(['"`])([\s\S]*?)\1\s*,?\s*\)/g,
      )) {
        const literal = match[2];
        if (
          !literal.startsWith('CLOSURE_INVARIANT_') &&
          /(enabled=false|cooldownSeconds=0|activated by this closure|deployment remains|deployment.*approved)/i.test(
            literal,
          )
        ) {
          throw new Error(
            `${contractPath}: closure safety state must bind a namespaced machine-readable CLOSURE_INVARIANT marker instead of fragile prose: ${literal}`,
          );
        }
      }
    }

    for (const marker of markerAssertions) {
      if (assertedMarkers.has(marker)) {
        throw new Error(
          `${contractPath}: duplicate closure invariant assertion ${marker}.`,
        );
      }
      assertedMarkers.set(marker, contractPath);
    }
  }

  for (const [marker, closurePath] of documentMarkers) {
    if (!assertedMarkers.has(marker)) {
      throw new Error(
        `${closurePath}: closure invariant ${marker} is not bound by a stable contract assertion.`,
      );
    }
  }
  for (const [marker, contractPath] of assertedMarkers) {
    if (!documentMarkers.has(marker)) {
      throw new Error(
        `${contractPath}: asserted closure invariant ${marker} is missing from the closure document.`,
      );
    }
  }
}

function stableContractReadsMutableSurface(source, mutableSurface) {
  const escapedSurface = mutableSurface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathLiteral = `[\'"\`][^\'"\`\r\n]*${escapedSurface}[\'"\`]`;
  const directModuleRead = new RegExp(
    `(?:\\bfrom\\s+|\\bimport\\s*\\(|\\brequire\\s*\\()\\s*${pathLiteral}`,
  );
  if (directModuleRead.test(source)) return true;

  const literalPattern = new RegExp(pathLiteral, 'g');
  for (const match of source.matchAll(literalPattern)) {
    const index = match.index ?? 0;
    const prefix = source.slice(Math.max(0, index - 2_000), index);
    if (
      /\b(?:read|readJson|readFile|readFileSync)(?:<[\s\S]{0,1_800}?>)?\s*\(\s*$/.test(
        prefix,
      )
    ) {
      return true;
    }
  }
  return false;
}

function findStableContractMutableSurfaceReferences(policy, sourceByPath) {
  const findings = [];
  const mutableSurfaces = policy.mutableCurrentStateDocuments ?? [];
  for (const [contractPath, contractClass] of Object.entries(
    policy.contractClasses ?? {},
  )) {
    if (contractClass !== 'stable-contract') continue;
    const source = sourceByPath.get(contractPath);
    if (source === undefined) continue;
    for (const mutableSurface of mutableSurfaces) {
      if (stableContractReadsMutableSurface(source, mutableSurface)) {
        findings.push({ contractPath, mutableSurface });
      }
    }
  }
  return findings;
}

const expectedHistoricalRemediationBoundary = Object.freeze({
  baseSha: '850c3de5171dea4cd07a135de46078ff521d3ef9',
  invalidArtifacts: Object.freeze([
    'module-10-completion-review-v1.0.0',
    'module-10-completion-review-v1.0.1',
    'repository-historical-contract-architecture-remediation-v1.0.0',
    'repository-historical-contract-architecture-remediation-v1.0.1',
  ]),
  prohibitedOwnerGates: Object.freeze([
    'module-10-completion',
    'module-11-activation',
    'push',
    'deployment',
  ]),
});

function assertHistoricalRemediationBoundary(actual, label) {
  if (!actual || typeof actual !== 'object') {
    throw new Error(`${label} remediation boundary is missing.`);
  }
  if (
    actual.baseSha !== expectedHistoricalRemediationBoundary.baseSha ||
    JSON.stringify(actual.invalidArtifacts) !==
      JSON.stringify(expectedHistoricalRemediationBoundary.invalidArtifacts) ||
    JSON.stringify(actual.prohibitedOwnerGates) !==
      JSON.stringify(expectedHistoricalRemediationBoundary.prohibitedOwnerGates)
  ) {
    throw new Error(
      `${label} must preserve the exact immutable historical remediation boundary.`,
    );
  }
}

async function validateHistoricalRemediationBoundaryInvariant(repositoryRoot) {
  const policy = JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  );
  assertHistoricalRemediationBoundary(
    policy.remediationBoundary,
    'test/contract-surface-policy.json',
  );

  const mutation = structuredClone(policy.remediationBoundary);
  mutation.invalidArtifacts[3] =
    'repository-historical-contract-architecture-remediation-v1.0.3';
  let rejected = false;
  try {
    assertHistoricalRemediationBoundary(
      mutation,
      'negative package-version mutation',
    );
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error(
      'Historical remediation boundary guard did not reject package-version churn.',
    );
  }
}

async function validateStableContractMutableSurfaceIsolation(repositoryRoot) {
  const policy = JSON.parse(
    await readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  );
  const sourceByPath = new Map();
  for (const [contractPath, contractClass] of Object.entries(
    policy.contractClasses ?? {},
  )) {
    if (contractClass !== 'stable-contract') continue;
    sourceByPath.set(
      contractPath,
      await readFile(resolve(repositoryRoot, contractPath), 'utf8'),
    );
  }

  const findings = findStableContractMutableSurfaceReferences(
    policy,
    sourceByPath,
  );
  if (findings.length > 0) {
    throw new Error(
      `Stable contracts must not reference mutable current-state documents: ${findings
        .map(
          ({ contractPath, mutableSurface }) =>
            `${contractPath} -> ${mutableSurface}`,
        )
        .join(', ')}`,
    );
  }

  const mutationFindings = findStableContractMutableSurfaceReferences(
    {
      mutableCurrentStateDocuments: ['project-config.json'],
      contractClasses: {
        'test/synthetic-stable.contract.spec.ts': 'stable-contract',
      },
    },
    new Map([
      [
        'test/synthetic-stable.contract.spec.ts',
        "const state = readJson('project-config.json');\n",
      ],
    ]),
  );
  if (mutationFindings.length !== 1) {
    throw new Error(
      'Stable-contract mutable-current-state guard did not reject the synthetic mutation.',
    );
  }
}

function assertIosReleasePolicy(policy, source) {
  const expected = {
    schemaVersion: 1,
    iosNativeProofMode: 'deferred-until-final-release',
    iosProofBlocksModuleLifecycle: false,
    iosSharedCodeCompatibilityRequired: true,
    iosFinalReleaseGateAfterModule: 30,
    iosCloudBuildAllowed: true,
    iosPreferredBuildProvider: 'Expo EAS',
    iosAppleSigningRequiredAtFinalRelease: true,
    iosTestFlightRequiredAtFinalRelease: true,
    iosPhysicalDeviceProofRequiredAtFinalRelease: true,
    iosAppStoreApprovalSeparate: true,
  };
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error(`${source}: releasePolicy must be an object.`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (policy[key] !== value) {
      throw new Error(
        `${source}: releasePolicy.${key} must equal ${JSON.stringify(value)}.`,
      );
    }
  }
}

async function validateIosFinalReleasePolicy(repositoryRoot) {
  const [
    configText,
    documentation,
    mobilePackageText,
    mobileConfig,
    profilesText,
    policyText,
    handoff,
    lifecycle,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, 'project-config.json'), 'utf8'),
    readFile(
      resolve(repositoryRoot, 'docs/ios-final-release-proof-policy.md'),
      'utf8',
    ),
    readFile(resolve(repositoryRoot, 'apps/user-mobile/package.json'), 'utf8'),
    readFile(resolve(repositoryRoot, 'apps/user-mobile/app.config.ts'), 'utf8'),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'tools/module-runner/lib/handoff-core.mjs'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'scripts/manage-module-state.mjs'),
      'utf8',
    ),
  ]);
  const config = JSON.parse(configText);
  const mobilePackage = JSON.parse(mobilePackageText);
  const profiles = JSON.parse(profilesText);
  const policy = JSON.parse(policyText);

  assertIosReleasePolicy(config.releasePolicy, 'project-config.json');
  if (
    !Number.isInteger(config.development?.lastCompletedModule) ||
    config.development.lastCompletedModule >=
      config.releasePolicy.iosFinalReleaseGateAfterModule
  ) {
    throw new Error(
      'iOS final release proof must remain after the currently completed module lifecycle.',
    );
  }

  const markers = [
    'IOS_RELEASE_POLICY_SCHEMA=1',
    'IOS_NATIVE_PROOF_MODE=deferred-until-final-release',
    'IOS_PROOF_BLOCKS_MODULE_LIFECYCLE=false',
    'IOS_SHARED_CODE_COMPATIBILITY_REQUIRED=true',
    'IOS_FINAL_RELEASE_GATE_AFTER_MODULE=30',
    'IOS_CLOUD_BUILD_ALLOWED=true',
    'IOS_PREFERRED_BUILD_PROVIDER=Expo_EAS',
    'IOS_APPLE_SIGNING_REQUIRED_AT_FINAL_RELEASE=true',
    'IOS_TESTFLIGHT_REQUIRED_AT_FINAL_RELEASE=true',
    'IOS_PHYSICAL_DEVICE_PROOF_REQUIRED_AT_FINAL_RELEASE=true',
    'IOS_APP_STORE_APPROVAL_SEPARATE=true',
  ];
  for (const marker of markers) {
    if (!documentation.includes(marker)) {
      throw new Error(
        `docs/ios-final-release-proof-policy.md is missing ${marker}.`,
      );
    }
  }

  if (mobilePackage.scripts?.ios !== 'expo run:ios') {
    throw new Error('Shared mobile package must retain the Expo iOS command.');
  }
  if (
    mobilePackage.scripts?.['config:validate'] !==
      'expo config --type public' ||
    !mobilePackage.scripts?.typecheck?.includes('tsc --noEmit') ||
    !mobileConfig.includes('ios: {')
  ) {
    throw new Error(
      'Shared mobile Expo configuration and TypeScript compatibility gates are incomplete.',
    );
  }

  for (const profileName of [
    'module-11-automation-command-dispatch-foundation-selection',
    'module-11-automation-command-dispatch-foundation',
  ]) {
    const profile = profiles.profiles?.[profileName];
    if (!Array.isArray(profile)) {
      throw new Error(
        `${profileName} is missing for iOS compatibility policy proof.`,
      );
    }
    if (
      !profile.some(
        (step) =>
          step.command === 'npm' &&
          JSON.stringify(step.args) ===
            JSON.stringify(['run', 'mobile:validate']),
      )
    ) {
      throw new Error(
        `${profileName} must retain the shared mobile compatibility gate.`,
      );
    }
    const nativeCommandText = profile
      .map((step) => `${step.command} ${(step.args ?? []).join(' ')}`)
      .join('\n');
    if (
      /expo run:ios|eas build|xcodebuild|pod install|testflight|\.ipa\b/i.test(
        nativeCommandText,
      )
    ) {
      throw new Error(
        `${profileName} must not require native iOS build, signing, or device proof.`,
      );
    }
  }

  const contractPath = 'test/ios-final-release-proof-policy.contract.spec.ts';
  if (policy.contractClasses?.[contractPath] !== 'stable-contract') {
    throw new Error(`${contractPath} must be registered as stable-contract.`);
  }
  if (
    !policy.transitionProof?.immutableEvidenceDocuments?.includes(
      'docs/ios-final-release-proof-policy.md',
    )
  ) {
    throw new Error(
      'iOS release policy document must be registered as immutable transition evidence.',
    );
  }
  for (const snippet of [
    'docs/ios-final-release-proof-policy.md',
    'iosNativeProofMode',
    'iosProofBlocksModuleLifecycle',
    'iosNativeProofDeferredUntilFinalReleaseRequired',
    'sharedIosCompatibilityRequiredDuringModules',
  ]) {
    if (!handoff.includes(snippet)) {
      throw new Error(`Portable handoff policy is missing ${snippet}.`);
    }
  }
  if (!lifecycle.includes('validateReleasePolicy')) {
    throw new Error('Lifecycle validation must enforce releasePolicy.');
  }

  const mutations = [
    ['iosProofBlocksModuleLifecycle', true],
    ['iosSharedCodeCompatibilityRequired', false],
    ['iosFinalReleaseGateAfterModule', 29],
  ];
  for (const [key, value] of mutations) {
    const candidate = structuredClone(config.releasePolicy);
    candidate[key] = value;
    try {
      assertIosReleasePolicy(candidate, 'negative iOS policy mutation');
    } catch {
      continue;
    }
    throw new Error(`iOS release policy guard did not reject mutation ${key}.`);
  }
}

function assertSlice118SelectionDocumentation(documentation, source) {
  const markers = [
    'SELECTION_INVARIANT_SLICE118_SCHEMA=1',
    'SELECTION_INVARIANT_SLICE118_IMPLEMENTED=false',
    'SELECTION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE118_RETRY_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false',
    'SELECTION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false',
    'SELECTION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ];
  for (const marker of markers) {
    if (!documentation.includes(marker)) {
      throw new Error(`${source}: missing ${marker}.`);
    }
  }
}

async function validateAutomationCommandDispatchSelection(repositoryRoot) {
  const [
    documentation,
    profilesText,
    policyText,
    transitionRepository,
    commandService,
  ] = await Promise.all([
    readFile(
      resolve(
        repositoryRoot,
        'docs/module-11-automation-command-dispatch-foundation.md',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-execution-transition.repository.ts',
      ),
      'utf8',
    ),
    readFile(resolve(repositoryRoot, 'src/device/command.service.ts'), 'utf8'),
  ]);
  const profiles = JSON.parse(profilesText);
  const policy = JSON.parse(policyText);

  assertSlice118SelectionDocumentation(
    documentation,
    'docs/module-11-automation-command-dispatch-foundation.md',
  );
  for (const boundary of [
    '`CommandService.publish`',
    '`automation:<executionId>:<actionId>`',
    '`{ [capabilityKey]: value }`',
    'Direct MQTT publication is forbidden',
  ]) {
    if (!documentation.includes(boundary)) {
      throw new Error(`Slice 11.8 selection is missing boundary ${boundary}.`);
    }
  }
  if (
    !transitionRepository.includes('claimNextPendingAction') ||
    !transitionRepository.includes('automationActionCommandIdempotencyKey') ||
    !commandService.includes('async publish(')
  ) {
    throw new Error(
      'Slice 11.8 selection does not bind to the existing transition and CommandService boundaries.',
    );
  }

  const profileName =
    'module-11-automation-command-dispatch-foundation-selection';
  const profile = profiles.profiles?.[profileName];
  if (!Array.isArray(profile)) {
    throw new Error(`Validation profile ${profileName} is missing.`);
  }
  const labels = profile.map((step) => step.label);
  const requiredOrder = [
    'Module Execution Kit source checks',
    'Shared mobile compatibility gate with iOS native proof deferred',
    'Focused Slice 11.8 selection, iOS release policy, and transition-safety tests',
    'PostgreSQL automation regression integration',
    'Full Jest suite once for the exact candidate',
  ];
  let prior = -1;
  for (const label of requiredOrder) {
    const index = labels.indexOf(label);
    if (index <= prior) {
      throw new Error(
        `Slice 11.8 validation profile must order ${label} after the prior required gate.`,
      );
    }
    prior = index;
  }

  const contractPath =
    'test/module-11-automation-command-dispatch-foundation.contract.spec.ts';
  if (policy.contractClasses?.[contractPath] !== 'stable-contract') {
    throw new Error(`${contractPath} must be registered as stable-contract.`);
  }
  if (
    !policy.transitionProof?.immutableEvidenceDocuments?.includes(
      'docs/module-11-automation-command-dispatch-foundation.md',
    )
  ) {
    throw new Error(
      'Slice 11.8 selection document must be registered as immutable transition evidence.',
    );
  }

  const mutation = documentation.replace(
    'SELECTION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE118_RUNTIME_ACTIVE=true',
  );
  try {
    assertSlice118SelectionDocumentation(
      mutation,
      'negative Slice 11.8 mutation',
    );
  } catch {
    return;
  }
  throw new Error(
    'Slice 11.8 selection guard did not reject premature runtime activation.',
  );
}

function assertSlice118ImplementationDocumentation(documentation, source) {
  const markers = [
    'IMPLEMENTATION_INVARIANT_SLICE118_SCHEMA=1',
    'IMPLEMENTATION_INVARIANT_SLICE118_IMPLEMENTED=true',
    'IMPLEMENTATION_INVARIANT_SLICE118_RUNTIME_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_DIRECT_MQTT_PUBLISH=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_RETRY_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_TELEMETRY_COORDINATOR_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_PUBLIC_ENDPOINT_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_AUTOMATION_ENABLED=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_MODULE12_ACTIVATED=false',
    'IMPLEMENTATION_INVARIANT_SLICE118_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ];
  for (const marker of markers) {
    if (!documentation.includes(marker)) {
      throw new Error(`${source}: missing ${marker}.`);
    }
  }
}

function assertSlice118DispatcherSource({
  dispatcher,
  commandService,
  transitionRepository,
  automationModule,
  dispatcherTests,
  integrationTests,
}) {
  for (const snippet of [
    'AutomationExecutionTransitionRepository',
    'claimNextPendingAction',
    'recordActionSucceeded',
    'recordActionFailed',
    'automationActionCommandIdempotencyKey',
    'CommandService',
    'this.commands.publish(',
    'findTenantDeviceCommandByIdempotencyKey',
    'AUTOMATION_DOMAIN_LIMITS.maxActions',
    "event: 'automation.command_dispatch.action_succeeded'",
    "event: 'automation.command_dispatch.action_failed'",
    "event: 'automation.command_dispatch.completed'",
  ]) {
    if (!dispatcher.includes(snippet)) {
      throw new Error(`Slice 11.8 dispatcher source is missing ${snippet}.`);
    }
  }
  for (const forbidden of [
    'MqttService',
    '@Controller',
    '@Cron',
    '@Interval',
    '@OnEvent',
  ]) {
    if (dispatcher.includes(forbidden)) {
      throw new Error(
        `Slice 11.8 dispatcher must not contain runtime boundary ${forbidden}.`,
      );
    }
  }
  if (/from ['"][^'"]*mqtt/i.test(dispatcher)) {
    throw new Error('Slice 11.8 dispatcher must not import MQTT modules.');
  }
  if (
    !commandService.includes('async findTenantDeviceCommandByIdempotencyKey(')
  ) {
    throw new Error(
      'CommandService is missing tenant-bound idempotency recovery.',
    );
  }
  if (
    !transitionRepository.includes('CommandStatus.FAILED') ||
    !transitionRepository.includes('CommandStatus.TIMED_OUT')
  ) {
    throw new Error(
      'Transition repository must accept failed and timed-out terminal command evidence.',
    );
  }
  for (const snippet of ['AutomationCommandDispatcher', 'DeviceModule']) {
    if (!automationModule.includes(snippet)) {
      throw new Error(`AutomationModule is missing ${snippet}.`);
    }
  }
  for (const proof of [
    'recovers a failed command identity after CommandService publish failure',
    'normalizes unexpected failures and stops after the first failed action',
    'continues in persisted order and stops on a later failure',
    'fails closed when CommandService returns a non-terminal command',
    'binds timed-out terminal commands to the failed action',
  ]) {
    if (!dispatcherTests.includes(proof)) {
      throw new Error(`Slice 11.8 unit proof is missing ${proof}.`);
    }
  }
  for (const proof of [
    'binds exact command identities',
    'recovers a failed command identity and stops after the first failed action',
  ]) {
    if (!integrationTests.includes(proof)) {
      throw new Error(`Slice 11.8 integration proof is missing ${proof}.`);
    }
  }
}

async function validateAutomationCommandDispatchImplementation(repositoryRoot) {
  const paths = {
    documentation:
      'docs/module-11-automation-command-dispatch-foundation-implementation.md',
    dispatcher: 'src/automation/automation-command-dispatcher.ts',
    dispatcherTests: 'src/automation/automation-command-dispatcher.spec.ts',
    integrationTests:
      'test/integration/automation-command-dispatch.integration-spec.ts',
    commandService: 'src/device/command.service.ts',
    transitionRepository:
      'src/automation/automation-execution-transition.repository.ts',
    automationModule: 'src/automation/automation.module.ts',
  };
  const [
    documentation,
    dispatcher,
    dispatcherTests,
    integrationTests,
    commandService,
    transitionRepository,
    automationModule,
    profilesText,
    policyText,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, paths.documentation), 'utf8'),
    readFile(resolve(repositoryRoot, paths.dispatcher), 'utf8'),
    readFile(resolve(repositoryRoot, paths.dispatcherTests), 'utf8'),
    readFile(resolve(repositoryRoot, paths.integrationTests), 'utf8'),
    readFile(resolve(repositoryRoot, paths.commandService), 'utf8'),
    readFile(resolve(repositoryRoot, paths.transitionRepository), 'utf8'),
    readFile(resolve(repositoryRoot, paths.automationModule), 'utf8'),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  ]);

  assertSlice118ImplementationDocumentation(documentation, paths.documentation);
  assertSlice118DispatcherSource({
    dispatcher,
    commandService,
    transitionRepository,
    automationModule,
    dispatcherTests,
    integrationTests,
  });

  const sourceFiles = await collectFiles(resolve(repositoryRoot, 'src'));
  const allowedDispatcherReferences = new Set([
    resolve(repositoryRoot, paths.dispatcher),
    resolve(repositoryRoot, paths.dispatcherTests),
    resolve(repositoryRoot, paths.automationModule),
    resolve(
      repositoryRoot,
      'src/automation/automation-telemetry-coordinator.ts',
    ),
    resolve(
      repositoryRoot,
      'src/automation/automation-telemetry-coordinator.spec.ts',
    ),
  ]);
  for (const sourcePath of sourceFiles) {
    if (
      extname(sourcePath) !== '.ts' ||
      allowedDispatcherReferences.has(sourcePath)
    ) {
      continue;
    }
    const source = await readFile(sourcePath, 'utf8');
    if (
      source.includes('AutomationCommandDispatcher') ||
      source.includes('.dispatchExecution(')
    ) {
      throw new Error(
        `Slice 11.8 dispatcher is runtime-reachable from ${sourcePath}.`,
      );
    }
  }

  const profiles = JSON.parse(profilesText);
  const profileName = 'module-11-automation-command-dispatch-foundation';
  const profile = profiles.profiles?.[profileName];
  if (!Array.isArray(profile)) {
    throw new Error(`Validation profile ${profileName} is missing.`);
  }
  const labels = profile.map((step) => step.label);
  const requiredOrder = [
    'Module Execution Kit source checks',
    'Focused Slice 11.8 dispatcher, policy, logging, and transition tests',
    'Shared mobile compatibility gate with iOS native proof deferred',
    'PostgreSQL automation command dispatch integration',
    'Full Jest suite once for the exact candidate',
    'Checkpoint-aware lifecycle and state-sensitive contract matrix',
  ];
  let prior = -1;
  for (const label of requiredOrder) {
    const index = labels.indexOf(label);
    if (index <= prior) {
      throw new Error(
        `Slice 11.8 implementation profile must order ${label} after the prior required gate.`,
      );
    }
    prior = index;
  }

  const policy = JSON.parse(policyText);
  const contractPath =
    'test/module-11-automation-command-dispatch-foundation-implementation.contract.spec.ts';
  if (policy.contractClasses?.[contractPath] !== 'stable-contract') {
    throw new Error(`${contractPath} must be registered as stable-contract.`);
  }
  if (
    !policy.transitionProof?.immutableEvidenceDocuments?.includes(
      paths.documentation,
    )
  ) {
    throw new Error(
      'Slice 11.8 implementation document must be immutable transition evidence.',
    );
  }

  const directMqttMutation = dispatcher.replace(
    "import { ERROR_CODES } from '../common/errors/error-code';",
    "import { MqttService } from '../mqtt/mqtt.service';\nimport { ERROR_CODES } from '../common/errors/error-code';",
  );
  try {
    assertSlice118DispatcherSource({
      dispatcher: directMqttMutation,
      commandService,
      transitionRepository,
      automationModule,
      dispatcherTests,
      integrationTests,
    });
  } catch {
    return;
  }
  throw new Error(
    'Slice 11.8 source guard did not reject direct MQTT dependency.',
  );
}

function assertSlice119SelectionDocumentation(documentation, source) {
  const markers = [
    'SELECTION_INVARIANT_SLICE119_SCHEMA=1',
    'SELECTION_INVARIANT_SLICE119_IMPLEMENTED=false',
    'SELECTION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE119_AUTOMATION_ENABLED=false',
    'SELECTION_INVARIANT_SLICE119_DISPATCH_RUNTIME_REACHABLE=false',
    'SELECTION_INVARIANT_SLICE119_RETRY_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false',
    'SELECTION_INVARIANT_SLICE119_PUBLIC_ENDPOINT_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false',
    'SELECTION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ];
  for (const marker of markers) {
    if (!documentation.includes(marker)) {
      throw new Error(`${source}: missing ${marker}.`);
    }
  }
}

async function validateAutomationTelemetryCoordinationSelection(
  repositoryRoot,
) {
  const paths = {
    documentation:
      'docs/module-11-automation-telemetry-coordination-foundation.md',
    contract:
      'test/module-11-automation-telemetry-coordination-foundation.contract.spec.ts',
  };
  const [
    documentation,
    contract,
    telemetryService,
    evaluator,
    executionRepository,
    dispatcher,
    profilesText,
    policyText,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, paths.documentation), 'utf8'),
    readFile(resolve(repositoryRoot, paths.contract), 'utf8'),
    readFile(
      resolve(repositoryRoot, 'src/telemetry/telemetry.service.ts'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/automation/automation-evaluator.ts'),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-execution.repository.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-command-dispatcher.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  ]);

  assertSlice119SelectionDocumentation(documentation, paths.documentation);
  for (const evidence of [
    '89c75d62c25290b20c635490d9e5faf617d429ac',
    '30968372456',
  ]) {
    if (!documentation.includes(evidence)) {
      throw new Error(
        `Slice 11.9 selection is missing remote evidence ${evidence}.`,
      );
    }
  }
  for (const boundary of [
    '`TelemetryService.ingest`',
    '`AutomationEvaluator.evaluate`',
    '`AutomationExecutionRepository.reserveMatchedExecution`',
    '`AutomationCommandDispatcher.dispatchExecution`',
  ]) {
    if (!documentation.includes(boundary)) {
      throw new Error(`Slice 11.9 selection is missing boundary ${boundary}.`);
    }
  }
  if (
    !telemetryService.includes('async ingest(') ||
    !evaluator.includes('evaluate(input: unknown)') ||
    !executionRepository.includes('async reserveMatchedExecution(') ||
    !dispatcher.includes('async dispatchExecution(')
  ) {
    throw new Error(
      'Slice 11.9 selection does not bind to existing trusted service boundaries.',
    );
  }

  const profiles = JSON.parse(profilesText);
  const profileName =
    'module-11-automation-telemetry-coordination-foundation-selection';
  const profile = profiles.profiles?.[profileName];
  if (!Array.isArray(profile)) {
    throw new Error(`Validation profile ${profileName} is missing.`);
  }
  const labels = profile.map((step) => step.label);
  const requiredOrder = [
    'Module Execution Kit source checks',
    'Focused Slice 11.9 selection, telemetry, automation, policy, and transition-safety tests',
    'Shared mobile compatibility gate with iOS native proof deferred',
    'PostgreSQL telemetry and automation regression integration',
    'Full Jest suite once for the exact candidate',
    'Checkpoint-aware lifecycle and state-sensitive contract matrix',
  ];
  let prior = -1;
  for (const label of requiredOrder) {
    const index = labels.indexOf(label);
    if (index <= prior) {
      throw new Error(
        `Slice 11.9 validation profile must order ${label} after the prior required gate.`,
      );
    }
    prior = index;
  }

  const policy = JSON.parse(policyText);
  if (policy.contractClasses?.[paths.contract] !== 'stable-contract') {
    throw new Error(`${paths.contract} must be registered as stable-contract.`);
  }
  if (
    !policy.transitionProof?.immutableEvidenceDocuments?.includes(
      paths.documentation,
    )
  ) {
    throw new Error(
      'Slice 11.9 selection document must be immutable transition evidence.',
    );
  }

  if (
    !contract.includes('type ValidationStep = {') ||
    !contract.includes('requiredEnv?: string[];')
  ) {
    throw new Error(
      'Slice 11.9 contract must declare the validation-step shape it reads.',
    );
  }

  const mutation = documentation.replace(
    'SELECTION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=true',
  );
  try {
    assertSlice119SelectionDocumentation(
      mutation,
      'negative Slice 11.9 mutation',
    );
  } catch {
    return;
  }
  throw new Error(
    'Slice 11.9 selection guard did not reject premature coordinator activation.',
  );
}

function assertSlice119ImplementationDocumentation(documentation, source) {
  const markers = [
    'IMPLEMENTATION_INVARIANT_SLICE119_SCHEMA=1',
    'IMPLEMENTATION_INVARIANT_SLICE119_IMPLEMENTED=true',
    'IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_AUTOMATION_DEFAULT_ENABLED=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_RUNTIME_REACHABLE=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_TELEMETRY_SERVICE_WIRED=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_DIRECT_MQTT_SUBSCRIBER=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_DIRECT_COMMAND_PUBLICATION=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_PROCESS_LOCAL_AUTHORITY=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_RETRY_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_PUBLIC_ENDPOINT_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_MODULE12_ACTIVATED=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ];
  for (const marker of markers) {
    if (!documentation.includes(marker)) {
      throw new Error(`${source}: missing ${marker}.`);
    }
  }
}

function assertSlice119ImplementationSource({
  coordinator,
  coordinatorTypes,
  runtimeReads,
  evaluator,
  evaluationTypes,
  automationModule,
  telemetryService,
  unitTests,
  integrationTests,
}) {
  for (const snippet of [
    'async coordinate(',
    'validateEnvelope(input)',
    'sortReports(envelope.reports)',
    'this.runtimeReads.assertAcceptedTelemetry(envelope)',
    'this.runtimeReads.findEnabledCandidatesForReport({',
    'this.evaluator.evaluate(',
    "'APPROVED_RUNTIME'",
    'this.executions.reserveMatchedExecution({',
    'this.dispatcher.dispatchExecution({',
    'AutomationExecutionStatus.RESERVED',
    'AutomationExecutionStatus.DISPATCHING',
    "event: 'automation.telemetry_coordination.candidate_failed'",
    "event: 'automation.telemetry_coordination.completed'",
  ]) {
    if (!sourceIncludes(coordinator, snippet)) {
      throw new Error(`Slice 11.9 coordinator is missing ${snippet}.`);
    }
  }

  const evaluationStart = coordinator.indexOf('const evaluation =');
  const evaluationEnd = coordinator.indexOf('report: {', evaluationStart);
  const evaluationCandidateProjection =
    evaluationStart >= 0 && evaluationEnd >= 0
      ? coordinator.slice(evaluationStart, evaluationEnd)
      : '';
  for (const field of [
    'automationId: candidate.automationId',
    'tenantId: candidate.tenantId',
    'enabled: candidate.enabled',
    'revision: candidate.revision',
    'definition: candidate.definition',
  ]) {
    if (!sourceIncludes(evaluationCandidateProjection, field)) {
      throw new Error(
        `Slice 11.9 evaluator candidate projection is missing ${field}.`,
      );
    }
  }
  if (evaluationCandidateProjection.includes('triggerCapabilityId')) {
    throw new Error(
      'Slice 11.9 evaluator candidate projection must not include runtime-only fields.',
    );
  }
  if (
    !sourceIncludes(unitTests, 'not.toHaveProperty(') ||
    !unitTests.includes("'triggerCapabilityId'")
  ) {
    throw new Error(
      'Slice 11.9 unit proof must reject runtime-only fields in the evaluator envelope.',
    );
  }

  for (const snippet of [
    'maxReports: 32',
    'maxCandidatesPerReport: 64',
    "'EXTERNAL_ACCEPTED'",
    "'AUTOMATION_DERIVED'",
    'AutomationTelemetryCoordinationEnvelope',
  ]) {
    if (!sourceIncludes(coordinatorTypes, snippet)) {
      throw new Error(`Slice 11.9 coordination types are missing ${snippet}.`);
    }
  }

  for (const snippet of [
    'async assertAcceptedTelemetry(',
    'async findEnabledCandidatesForReport(',
    'async loadLatestValues(',
    'collectLatestValueTargets(',
    'enabled: true',
    'jsonb_typeof(payload ->',
    'ORDER BY "createdAt" DESC, id DESC',
  ]) {
    if (!sourceIncludes(runtimeReads, snippet)) {
      throw new Error(`Slice 11.9 runtime reads are missing ${snippet}.`);
    }
  }

  for (const forbidden of [
    'MqttService',
    'TelemetryService',
    'RedisService',
    '@Controller',
    'setInterval(',
    'setTimeout(',
    '.publish(',
  ]) {
    if (coordinator.includes(forbidden) || runtimeReads.includes(forbidden)) {
      throw new Error(
        `Slice 11.9 internal implementation contains forbidden runtime dependency ${forbidden}.`,
      );
    }
  }

  for (const snippet of [
    "'DISABLED_DEFINITION_PREVIEW'",
    "'APPROVED_RUNTIME'",
    'AutomationEvaluationMode',
  ]) {
    if (
      !sourceIncludes(evaluationTypes, snippet) &&
      !sourceIncludes(evaluator, snippet)
    ) {
      throw new Error(`Slice 11.9 evaluator transition is missing ${snippet}.`);
    }
  }
  if (
    !evaluator.includes(
      "mode === 'DISABLED_DEFINITION_PREVIEW' && candidate.enabled",
    ) ||
    !evaluator.includes("mode === 'APPROVED_RUNTIME' && !candidate.enabled")
  ) {
    throw new Error(
      'Slice 11.9 evaluator must preserve preview safety and require enabled approved-runtime candidates.',
    );
  }

  for (const provider of [
    'AutomationRuntimeReadRepository',
    'AutomationTelemetryCoordinator',
  ]) {
    if (!automationModule.includes(provider)) {
      throw new Error(
        `AutomationModule is missing internal provider ${provider}.`,
      );
    }
  }
  const exportsStart = automationModule.indexOf('exports: [');
  const exportsEnd = automationModule.indexOf('],', exportsStart);
  const exportsBlock = automationModule.slice(exportsStart, exportsEnd);
  if (
    exportsStart < 0 ||
    exportsBlock.includes('AutomationRuntimeReadRepository') ||
    exportsBlock.includes('AutomationTelemetryCoordinator')
  ) {
    throw new Error(
      'Slice 11.9 coordinator and runtime read repository must remain non-exported internal providers.',
    );
  }
  if (telemetryService.includes('AutomationTelemetryCoordinator')) {
    throw new Error(
      'Slice 11.9 coordinator must not be wired into TelemetryService before activation approval.',
    );
  }

  for (const proof of [
    'processes reports in deterministic capability order',
    'isolates a candidate failure and continues with the next candidate',
    'rejects automation-derived telemetry without ancestry before reads',
  ]) {
    if (!unitTests.includes(proof)) {
      throw new Error(`Slice 11.9 unit proof is missing ${proof}.`);
    }
  }
  for (const proof of [
    'coordinates exact tenant telemetry, latest values, dispatch, and replay',
    'uses only the latest required value and skips a non-match without reservation',
    'persists cooldown and ancestry suppression without command dispatch',
    'rejects a cross-tenant envelope before candidate lookup or execution',
  ]) {
    if (!integrationTests.includes(proof)) {
      throw new Error(`Slice 11.9 integration proof is missing ${proof}.`);
    }
  }
}

async function validateAutomationTelemetryCoordinationImplementation(
  repositoryRoot,
) {
  const paths = {
    documentation:
      'docs/module-11-automation-telemetry-coordination-foundation-implementation.md',
    contract:
      'test/module-11-automation-telemetry-coordination-foundation-implementation.contract.spec.ts',
  };
  const [
    documentation,
    contract,
    coordinator,
    coordinatorTypes,
    runtimeReads,
    evaluator,
    evaluationTypes,
    automationModule,
    telemetryService,
    unitTests,
    integrationTests,
    profilesText,
    policyText,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, paths.documentation), 'utf8'),
    readFile(resolve(repositoryRoot, paths.contract), 'utf8'),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-telemetry-coordinator.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-telemetry-coordination.types.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-runtime-read.repository.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/automation/automation-evaluator.ts'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/automation/automation-evaluation.types.ts'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/automation/automation.module.ts'),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/telemetry/telemetry.service.ts'),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-telemetry-coordinator.spec.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'test/integration/automation-telemetry-coordination.integration-spec.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  ]);

  assertSlice119ImplementationDocumentation(documentation, paths.documentation);
  for (const evidence of [
    '5781c65014c24fb5498b02fb611eaf885eea2c85',
    '30971468421',
  ]) {
    if (!documentation.includes(evidence)) {
      throw new Error(
        `Slice 11.9 implementation is missing remote selection evidence ${evidence}.`,
      );
    }
  }
  assertSlice119ImplementationSource({
    coordinator,
    coordinatorTypes,
    runtimeReads,
    evaluator,
    evaluationTypes,
    automationModule,
    telemetryService,
    unitTests,
    integrationTests,
  });

  const profiles = JSON.parse(profilesText);
  const profileName = 'module-11-automation-telemetry-coordination-foundation';
  const profile = profiles.profiles?.[profileName];
  if (!Array.isArray(profile)) {
    throw new Error(`Validation profile ${profileName} is missing.`);
  }
  const labels = profile.map((step) => step.label);
  const requiredOrder = [
    'Module Execution Kit source checks',
    'Structured logging contract regression gate',
    'Focused Slice 11.9 coordinator, runtime-read, evaluator, reservation, dispatch, and policy tests',
    'Shared mobile compatibility gate with iOS native proof deferred',
    'Nest application build',
    'PostgreSQL automation telemetry coordination integration',
    'Full Jest suite once for the exact candidate',
    'Checkpoint-aware lifecycle and state-sensitive contract matrix',
  ];
  let prior = -1;
  for (const label of requiredOrder) {
    const index = labels.indexOf(label);
    if (index <= prior) {
      throw new Error(
        `Slice 11.9 implementation profile must order ${label} after the prior required gate.`,
      );
    }
    prior = index;
  }

  const policy = JSON.parse(policyText);
  if (policy.contractClasses?.[paths.contract] !== 'stable-contract') {
    throw new Error(`${paths.contract} must be registered as stable-contract.`);
  }
  if (
    !policy.transitionProof?.immutableEvidenceDocuments?.includes(
      paths.documentation,
    )
  ) {
    throw new Error(
      'Slice 11.9 implementation document must be immutable transition evidence.',
    );
  }
  if (
    !contract.includes('type ValidationStep = {') ||
    !contract.includes('requiredEnv?: string[];')
  ) {
    throw new Error(
      'Slice 11.9 implementation contract must declare the validation-step shape it reads.',
    );
  }

  const activeMutation = documentation.replace(
    'IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
    'IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=true',
  );
  if (
    activeMutation.includes(
      'IMPLEMENTATION_INVARIANT_SLICE119_COORDINATOR_ACTIVE=false',
    )
  ) {
    throw new Error('Slice 11.9 activation mutation fixture was not applied.');
  }
  let mutationRejected = false;
  try {
    assertSlice119ImplementationDocumentation(
      activeMutation,
      'negative Slice 11.9 activation mutation',
    );
  } catch {
    mutationRejected = true;
  }
  if (!mutationRejected) {
    throw new Error(
      'Slice 11.9 implementation guard did not reject coordinator activation.',
    );
  }

  const runtimeMutation = coordinator.replace(
    "import { Injectable, Logger } from '@nestjs/common';",
    "import { Injectable, Logger } from '@nestjs/common';\nimport { TelemetryService } from '../telemetry/telemetry.service';",
  );
  mutationRejected = false;
  try {
    assertSlice119ImplementationSource({
      coordinator: runtimeMutation,
      coordinatorTypes,
      runtimeReads,
      evaluator,
      evaluationTypes,
      automationModule,
      telemetryService,
      unitTests,
      integrationTests,
    });
  } catch {
    mutationRejected = true;
  }
  if (!mutationRejected) {
    throw new Error(
      'Slice 11.9 source guard did not reject telemetry runtime wiring.',
    );
  }
}

function assertSlice1110RetrySelectionDocumentation(selection, source) {
  const markers = [
    'SELECTION_INVARIANT_SLICE1110_SCHEMA=1',
    'SELECTION_INVARIANT_SLICE1110_IMPLEMENTED=false',
    'SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_AUTOMATION_ENABLED=false',
    'SELECTION_INVARIANT_SLICE1110_COORDINATOR_RUNTIME_REACHABLE=false',
    'SELECTION_INVARIANT_SLICE1110_WORKER_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_SCHEDULER_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_QUEUE_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false',
    'SELECTION_INVARIANT_SLICE1110_IDEMPOTENCY_KEY_REUSED=true',
    'SELECTION_INVARIANT_SLICE1110_MAX_DISPATCH_ATTEMPTS=3',
    'SELECTION_INVARIANT_SLICE1110_UNKNOWN_ERRORS_RETRYABLE=false',
    'SELECTION_INVARIANT_SLICE1110_MODULE12_ACTIVATED=false',
    'SELECTION_INVARIANT_SLICE1110_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ];
  for (const marker of markers) {
    if (!selection.includes(marker))
      throw new Error(`${source}: missing ${marker}.`);
  }
}

async function validateAutomationTelemetryClosureRetrySelection(
  repositoryRoot,
) {
  const paths = {
    closure:
      'docs/module-11-automation-telemetry-coordination-foundation-closure.md',
    selection: 'docs/module-11-automation-retry-safety-foundation.md',
    contract:
      'test/module-11-automation-retry-safety-foundation.contract.spec.ts',
  };
  const [
    closure,
    selection,
    contract,
    configText,
    dispatcher,
    transitions,
    automationModule,
    profilesText,
    policyText,
  ] = await Promise.all([
    readFile(resolve(repositoryRoot, paths.closure), 'utf8'),
    readFile(resolve(repositoryRoot, paths.selection), 'utf8'),
    readFile(resolve(repositoryRoot, paths.contract), 'utf8'),
    readFile(resolve(repositoryRoot, 'project-config.json'), 'utf8'),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-command-dispatcher.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'src/automation/automation-execution-transition.repository.ts',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'src/automation/automation.module.ts'),
      'utf8',
    ),
    readFile(
      resolve(
        repositoryRoot,
        'tools/module-runner/profiles/validation-profiles.json',
      ),
      'utf8',
    ),
    readFile(
      resolve(repositoryRoot, 'test/contract-surface-policy.json'),
      'utf8',
    ),
  ]);
  for (const evidence of [
    '7de76596c6c1d52bd725406f3fad381cc62aedaf',
    '30983551478',
    '8921209639',
    '8ba808d3c9d0e9ece3fbcc81c40fc298406c9b0c242d4b29a5fc69875e3ce9b9',
  ]) {
    if (!closure.includes(evidence))
      throw new Error(`Slice 11.9 closure missing ${evidence}.`);
  }
  for (const marker of [
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_SCHEMA=1',
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_TELEMETRY_COORDINATION_FOUNDATION_CLOSED=true',
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_COORDINATOR_RUNTIME_REACHABLE=false',
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_RETRY_ACTIVATED=false',
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_MODULE_12_ACTIVATED=false',
    'CLOSURE_INVARIANT_MODULE_11_SLICE_11_9_PRODUCTION_DEPLOYMENT_APPROVED=false',
  ]) {
    if (!closure.includes(marker))
      throw new Error(`${paths.closure}: missing ${marker}.`);
    if (!contract.includes(marker))
      throw new Error(`${paths.contract}: missing assertion ${marker}.`);
  }
  assertSlice1110RetrySelectionDocumentation(selection, paths.selection);
  for (const marker of [
    'SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_WORKER_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_DIRECT_MQTT_PUBLISH=false',
  ]) {
    if (!contract.includes(marker))
      throw new Error(`${paths.contract}: missing assertion ${marker}.`);
  }
  const config = JSON.parse(configText);
  if (
    config.development?.activeSlice !==
    'Module 11 Slice 11.10 - Automation Retry Safety Foundation Selection'
  ) {
    throw new Error(
      'Slice 11.10 retry selection is not the active lifecycle slice.',
    );
  }
  if (
    !String(config.development?.moduleLifecycleEvidence ?? '').includes(
      'retry remains unimplemented and inactive',
    )
  ) {
    throw new Error(
      'Slice 11.10 lifecycle evidence does not preserve inactive retry.',
    );
  }
  if (
    !transitions.includes('return `automation:${executionId}:${actionId}`;') ||
    !dispatcher.includes('automationActionCommandIdempotencyKey(')
  ) {
    throw new Error(
      'Slice 11.10 selection lost the existing idempotency boundary.',
    );
  }
  if (automationModule.includes('AutomationRetry'))
    throw new Error(
      'Retry implementation or provider was activated during selection.',
    );
  const profiles = JSON.parse(profilesText);
  const profileName = 'module-11-automation-telemetry-closure-retry-selection';
  const profile = profiles.profiles?.[profileName];
  if (!Array.isArray(profile))
    throw new Error(`Validation profile ${profileName} is missing.`);
  const labels = profile.map((step) => step.label);
  const order = [
    'Pre-dependency Module Execution Kit self-test',
    'Module Execution Kit source checks',
    'Clean dependency bootstrap',
    'Changed TypeScript formatting check',
    'Repository non-mutating lint',
    'Current lifecycle validation',
    'Lifecycle simulation through Module 30',
    'Focused Slice 11.9 closure and Slice 11.10 retry selection contracts',
    'Checkpoint-aware lifecycle and state-sensitive contract matrix',
  ];
  let prior = -1;
  for (const label of order) {
    const index = labels.indexOf(label);
    if (index <= prior)
      throw new Error(
        `Risk Profile A must order ${label} after the prior gate.`,
      );
    prior = index;
  }
  if (
    labels.includes('Full Jest suite once for the exact candidate') ||
    profile.some((step) => step.args?.includes('test:integration:db'))
  ) {
    throw new Error(
      'Risk Profile A contains an irrelevant broad or database gate.',
    );
  }
  const policy = JSON.parse(policyText);
  if (policy.contractClasses?.[paths.contract] !== 'stable-contract')
    throw new Error(`${paths.contract} must be stable-contract.`);
  for (const document of [paths.closure, paths.selection]) {
    if (!policy.transitionProof?.immutableEvidenceDocuments?.includes(document))
      throw new Error(`${document} must be immutable transition evidence.`);
  }
  const mutation = selection.replace(
    'SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=false',
    'SELECTION_INVARIANT_SLICE1110_RETRY_ACTIVE=true',
  );
  let rejected = false;
  try {
    assertSlice1110RetrySelectionDocumentation(
      mutation,
      'negative Slice 11.10 retry mutation',
    );
  } catch {
    rejected = true;
  }
  if (!rejected)
    throw new Error(
      'Slice 11.10 guard did not reject premature retry activation.',
    );
}

async function validateBootstrapFailFastPreamble(repositoryRoot) {
  const selfTestPath = resolve(
    repositoryRoot,
    'tools/module-runner/self-test.mjs',
  );
  const selfTest = await readFile(selfTestPath, 'utf8');

  const preambleCall = 'await verifyFailFastRepositoryState();';
  const firstLongProbe = 'await verifyNativeStreams();';
  const preambleIndex = selfTest.indexOf(preambleCall);
  const probeIndex = selfTest.indexOf(firstLongProbe);
  if (preambleIndex < 0 || probeIndex < 0 || preambleIndex >= probeIndex) {
    throw new Error(
      'Module runner self-test must execute the repository fail-fast preamble before longer probes.',
    );
  }

  for (const requiredSnippet of [
    "['tools/module-runner/check-sources.mjs']",
    "['run', 'module:validate']",
    "['run', 'module:simulate']",
    'stream: true',
  ]) {
    if (!selfTest.includes(requiredSnippet)) {
      throw new Error(
        `Module runner self-test fail-fast preamble is missing ${requiredSnippet}.`,
      );
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.result?.stdout) console.error(error.result.stdout);
    if (error.result?.stderr) console.error(error.result.stderr);
    process.exitCode = 1;
  });
}
