#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const configPath = resolve(root, 'project-config.json');
const registryPath = resolve(
  root,
  'AI-Development-Kit/modules/module-registry.json',
);
const lifecycleDocumentPath = resolve(root, 'docs/module-lifecycle.md');
const managedDocuments = [
  'docs/project-state.md',
  'docs/roadmap.md',
  'docs/architecture.md',
  'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
  'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
  'AI-Development-Kit/architecture/SYSTEM.md',
];
const markerStart = '<!-- MODULE-LIFECYCLE:START -->';
const markerEnd = '<!-- MODULE-LIFECYCLE:END -->';

function readText(path) {
  return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
}

function writeText(path, content) {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const endOfLine = existing.includes('\r\n') ? '\r\n' : '\n';
  const normalized = content.replace(/\r\n?/g, '\n').trimEnd();
  writeFileSync(
    path,
    `${normalized.split('\n').join(endOfLine)}${endOfLine}`,
    'utf8',
  );
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function parseArguments(argv) {
  const [command = 'status', moduleToken, ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const name = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      options.set(name, true);
      continue;
    }
    options.set(name, value);
    index += 1;
  }
  return {
    command,
    moduleNumber: moduleToken === undefined ? null : Number(moduleToken),
    options,
  };
}

function moduleLabel(module) {
  return `Module ${String(module.module).padStart(2, '0')} - ${module.title}`;
}

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateRegistry(registry) {
  if (registry.version !== 1 || !Array.isArray(registry.modules)) {
    throw new Error('Module registry version or module list is invalid.');
  }
  if (registry.modules.length !== 30) {
    throw new Error(`Expected 30 modules, found ${registry.modules.length}.`);
  }
  registry.modules.forEach((module, index) => {
    const expected = index + 1;
    if (module.module !== expected) {
      throw new Error(`Module registry is not contiguous at ${expected}.`);
    }
    const prompt = readText(resolve(root, module.prompt));
    const heading = `# MODULE ${String(expected).padStart(2, '0')} --- ${module.title}`;
    if (!prompt.includes(heading)) {
      throw new Error(
        `Prompt heading does not match registry: ${module.prompt}`,
      );
    }
    if (!prompt.replace(/\s+/g, ' ').includes(module.scope)) {
      throw new Error(`Prompt scope does not match registry: ${module.prompt}`);
    }
  });
}

function getModule(registry, moduleNumber) {
  const module = registry.modules.find(
    (entry) => entry.module === moduleNumber,
  );
  if (!module) {
    throw new Error(`Module ${moduleNumber} is not present in the registry.`);
  }
  return module;
}

function renderLifecycleBlock(config, registry) {
  const development = config.development;
  const active =
    development.currentModule === null
      ? null
      : getModule(registry, development.currentModule);
  const next =
    development.nextModule === null
      ? null
      : getModule(registry, development.nextModule);
  const lines = [
    markerStart,
    '## Current Module Lifecycle',
    '',
    `- Lifecycle state: ${development.moduleLifecycleState}`,
    `- Active module: ${active ? moduleLabel(active) : 'None'}`,
    `- Last completed module: Module ${String(development.lastCompletedModule).padStart(2, '0')}`,
    `- Next module: ${next ? moduleLabel(next) : 'None'}`,
    `- Active slice: ${development.activeSlice}`,
    `- Evidence: ${development.moduleLifecycleEvidence}`,
    `- Updated on: ${development.moduleLifecycleUpdatedOn}`,
    '- Production deployment: NOT APPROVED; environment-specific approval remains separate.',
    '',
    'Historical status statements elsewhere in this document record earlier checkpoints and do not override this managed block.',
    markerEnd,
  ];
  return lines.join('\n');
}

function upsertManagedBlock(content, block) {
  const start = content.indexOf(markerStart);
  const end = content.indexOf(markerEnd);
  if ((start === -1) !== (end === -1)) {
    throw new Error('Found an incomplete MODULE-LIFECYCLE marker block.');
  }
  if (start !== -1) {
    const after = end + markerEnd.length;
    return `${content.slice(0, start)}${block}${content.slice(after)}`;
  }
  const headingEnd = content.indexOf('\n');
  if (headingEnd === -1) {
    return `${content}\n\n${block}`;
  }
  return `${content.slice(0, headingEnd + 1)}\n${block}\n${content.slice(headingEnd + 1)}`;
}

function renderLifecycleDocument(config, registry) {
  const development = config.development;
  const active =
    development.currentModule === null
      ? null
      : getModule(registry, development.currentModule);
  const next =
    development.nextModule === null
      ? null
      : getModule(registry, development.nextModule);
  return [
    '# Module Lifecycle',
    '',
    'This document is generated by `scripts/manage-module-state.mjs` and is the canonical mutable module-status checkpoint.',
    '',
    renderLifecycleBlock(config, registry),
    '',
    '## Commands',
    '',
    '```powershell',
    'npm run module:status',
    'npm run module:validate',
    'npm run module:slice -- 10 --slice "Module 10 Slice 10.7 - User Web Dynamic Dashboard" --focus "<bounded slice focus>" --evidence "<green CI and explicit approval evidence>"',
    'npm run module:activate -- 10 --approved --evidence "<green CI and explicit approval evidence>"',
    'npm run module:complete -- 9 --evidence "<completion review evidence>"',
    '```',
    '',
    '## Active Scope',
    '',
    active ? active.scope : 'No module is active.',
    '',
    '## Next Module',
    '',
    next ? `${moduleLabel(next)}: ${next.scope}` : 'No planned module remains.',
    '',
    '## Safety Boundary',
    '',
    'Module lifecycle transitions never approve production deployment, change application runtime behavior, modify Prisma schema, or push Git commits.',
  ].join('\n');
}

function validateReleasePolicy(config) {
  const policy = config.releasePolicy;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('project-config.json releasePolicy is required.');
  }
  if (policy.schemaVersion !== 1) {
    throw new Error('releasePolicy.schemaVersion must be 1.');
  }
  if (policy.iosNativeProofMode !== 'deferred-until-final-release') {
    throw new Error(
      'iOS native proof must remain deferred until the final release gate.',
    );
  }
  if (policy.iosProofBlocksModuleLifecycle !== false) {
    throw new Error(
      'iOS native proof must not block the Module 01-30 lifecycle.',
    );
  }
  if (policy.iosSharedCodeCompatibilityRequired !== true) {
    throw new Error('Shared iOS code compatibility must remain required.');
  }
  if (policy.iosFinalReleaseGateAfterModule !== 30) {
    throw new Error('The iOS final release gate must remain after Module 30.');
  }
  for (const key of [
    'iosCloudBuildAllowed',
    'iosAppleSigningRequiredAtFinalRelease',
    'iosTestFlightRequiredAtFinalRelease',
    'iosPhysicalDeviceProofRequiredAtFinalRelease',
    'iosAppStoreApprovalSeparate',
  ]) {
    if (policy[key] !== true) {
      throw new Error(`releasePolicy.${key} must be true.`);
    }
  }
  if (policy.iosPreferredBuildProvider !== 'Expo EAS') {
    throw new Error(
      'releasePolicy.iosPreferredBuildProvider must remain Expo EAS.',
    );
  }
}

function validateConfig(config, registry) {
  validateReleasePolicy(config);
  const development = config.development;
  if (
    development.moduleRegistry !==
    'AI-Development-Kit/modules/module-registry.json'
  ) {
    throw new Error(
      'project-config.json does not reference the canonical module registry.',
    );
  }
  if (
    development.lastCompletedModule < 0 ||
    development.lastCompletedModule > 30
  ) {
    throw new Error(
      'lastCompletedModule is outside the supported module range.',
    );
  }
  if (development.currentModule !== null) {
    const active = getModule(registry, development.currentModule);
    if (development.currentModule !== development.lastCompletedModule + 1) {
      throw new Error(
        'Active module must immediately follow lastCompletedModule.',
      );
    }
    const expectedNextModule =
      development.currentModule < 30 ? development.currentModule + 1 : null;
    if (development.nextModule !== expectedNextModule) {
      throw new Error('nextModule must immediately follow the active module.');
    }
    if (development.moduleLifecycleState !== 'active') {
      throw new Error('An active module requires moduleLifecycleState=active.');
    }
    if (!development.activeWorkstream.includes(moduleLabel(active))) {
      throw new Error(
        'activeWorkstream does not match the active module registry entry.',
      );
    }
    if (
      !development.activeSlice.includes(
        `Module ${String(active.module).padStart(2, '0')}`,
      )
    ) {
      throw new Error('activeSlice does not identify the active module.');
    }
  } else if (development.lastCompletedModule < 30) {
    if (development.nextModule !== development.lastCompletedModule + 1) {
      throw new Error(
        'Awaiting-activation nextModule must follow lastCompletedModule.',
      );
    }
    if (development.moduleLifecycleState !== 'awaiting-activation') {
      throw new Error(
        'No active module requires awaiting-activation state before Module 30 completion.',
      );
    }
  } else {
    if (
      development.nextModule !== null ||
      development.moduleLifecycleState !== 'complete'
    ) {
      throw new Error(
        'Completed Module 30 requires nextModule=null and lifecycle state complete.',
      );
    }
  }
  if (!/not approved/i.test(development.productionDeploymentStatus)) {
    throw new Error(
      'Production deployment status must remain explicitly not approved.',
    );
  }
}

function normalizeManagedLifecycleBlock(content) {
  return content.replace(/\s+/g, ' ').trim();
}

function extractManagedLifecycleBlock(content, source) {
  const starts = content.split(markerStart).length - 1;
  const ends = content.split(markerEnd).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `Managed lifecycle block is missing or duplicated: ${source}`,
    );
  }

  const start = content.indexOf(markerStart);
  const end = content.indexOf(markerEnd) + markerEnd.length;
  return content.slice(start, end);
}

function validateManagedDocuments(config, registry) {
  const expectedBlock = normalizeManagedLifecycleBlock(
    renderLifecycleBlock(config, registry),
  );

  for (const relativePath of managedDocuments) {
    const content = readText(resolve(root, relativePath));
    const actualBlock = normalizeManagedLifecycleBlock(
      extractManagedLifecycleBlock(content, relativePath),
    );
    if (actualBlock !== expectedBlock) {
      throw new Error(`Managed lifecycle block is stale: ${relativePath}`);
    }
  }

  const lifecycleDocument = readText(lifecycleDocumentPath);
  const lifecycleBlock = normalizeManagedLifecycleBlock(
    extractManagedLifecycleBlock(lifecycleDocument, 'docs/module-lifecycle.md'),
  );
  if (lifecycleBlock !== expectedBlock) {
    throw new Error('docs/module-lifecycle.md is stale.');
  }
}

function persist(config, registry) {
  writeText(configPath, JSON.stringify(config, null, 2));
  const block = renderLifecycleBlock(config, registry);
  for (const relativePath of managedDocuments) {
    const path = resolve(root, relativePath);
    writeText(path, upsertManagedBlock(readText(path), block));
  }
  writeText(lifecycleDocumentPath, renderLifecycleDocument(config, registry));
}

function activate(config, registry, moduleNumber, options) {
  if (options.get('approved') !== true) {
    throw new Error('Activation requires the explicit --approved flag.');
  }
  const evidence = options.get('evidence');
  if (typeof evidence !== 'string' || evidence.trim().length < 8) {
    throw new Error('Activation requires non-empty --evidence text.');
  }
  const development = config.development;
  if (development.currentModule !== null) {
    throw new Error(`Module ${development.currentModule} is already active.`);
  }
  if (development.nextModule !== moduleNumber) {
    throw new Error(
      `Only nextModule ${development.nextModule} may be activated.`,
    );
  }
  if (development.lastCompletedModule !== moduleNumber - 1) {
    throw new Error('Activation would skip or reopen a module.');
  }
  const module = getModule(registry, moduleNumber);
  const following =
    moduleNumber < 30 ? getModule(registry, moduleNumber + 1) : null;
  development.currentModule = moduleNumber;
  development.nextModule = following?.module ?? null;
  development.nextModuleStatus = following
    ? `${moduleLabel(following)} is not active until ${moduleLabel(module)} is completed and explicitly approved`
    : 'No later planned module exists.';
  development.phase = moduleLabel(module);
  development.previousMilestone = development.milestone;
  development.milestone = `${moduleLabel(module)} activated: ${evidence.trim()}`;
  development.focus = [module.scope];
  development.activeWorkstream = moduleLabel(module);
  development.activeSlice = `Module ${String(moduleNumber).padStart(2, '0')} Activation Checkpoint`;
  development.moduleLifecycleState = 'active';
  development.moduleLifecycleEvidence = evidence.trim();
  development.moduleLifecycleUpdatedOn = options.get('date') || localDate();
}

function complete(config, registry, moduleNumber, options) {
  const evidence = options.get('evidence');
  if (typeof evidence !== 'string' || evidence.trim().length < 8) {
    throw new Error('Completion requires non-empty --evidence text.');
  }
  const development = config.development;
  if (development.currentModule !== moduleNumber) {
    throw new Error(`Module ${moduleNumber} is not the active module.`);
  }
  const module = getModule(registry, moduleNumber);
  const following =
    moduleNumber < 30 ? getModule(registry, moduleNumber + 1) : null;
  development.currentModule = null;
  development.lastCompletedModule = moduleNumber;
  development.nextModule = following?.module ?? null;
  development.nextModuleStatus = following
    ? `${moduleLabel(following)} is ready only after explicit activation approval`
    : 'All planned modules 01-30 are completed; future work requires a new approved roadmap.';
  development.phase = following
    ? 'Module Lifecycle - Awaiting Activation'
    : 'Planned Module Roadmap Complete';
  development.previousMilestone = development.milestone;
  development.milestone = `${moduleLabel(module)} completed: ${evidence.trim()}`;
  development.focus = following
    ? [`Await explicit activation of ${moduleLabel(following)}`]
    : ['Define the next approved roadmap'];
  development.activeWorkstream = 'Module Lifecycle';
  development.activeSlice = `${moduleLabel(module)} Completion Review`;
  development.moduleLifecycleState = following
    ? 'awaiting-activation'
    : 'complete';
  development.moduleLifecycleEvidence = evidence.trim();
  development.moduleLifecycleUpdatedOn = options.get('date') || localDate();
}

function selectSlice(config, registry, moduleNumber, options) {
  const development = config.development;
  if (development.currentModule !== moduleNumber) {
    throw new Error(`Module ${moduleNumber} is not the active module.`);
  }

  const module = getModule(registry, moduleNumber);
  const slice = options.get('slice');
  const focus = options.get('focus');
  const evidence = options.get('evidence');
  const expectedPrefix = `Module ${String(module.module).padStart(2, '0')} Slice `;

  if (typeof slice !== 'string' || !slice.startsWith(expectedPrefix)) {
    throw new Error(`Slice must start with ${expectedPrefix}.`);
  }
  if (typeof focus !== 'string' || focus.trim().length < 8) {
    throw new Error('Slice selection requires non-empty --focus text.');
  }
  if (typeof evidence !== 'string' || evidence.trim().length < 8) {
    throw new Error('Slice selection requires non-empty --evidence text.');
  }

  development.previousMilestone = development.milestone;
  development.milestone = `${slice.trim()}: ${evidence.trim()}`;
  development.focus = [focus.trim()];
  development.activeSlice = slice.trim();
  development.moduleLifecycleEvidence = evidence.trim();
  development.moduleLifecycleUpdatedOn = options.get('date') || localDate();
}

function simulateLifecycle(config, registry) {
  const simulated = JSON.parse(JSON.stringify(config));

  while (simulated.development.lastCompletedModule < 30) {
    if (simulated.development.currentModule !== null) {
      const activeModule = simulated.development.currentModule;
      complete(
        simulated,
        registry,
        activeModule,
        new Map([
          [
            'evidence',
            `Simulated Module ${activeModule} completion review passed`,
          ],
          ['date', '2099-01-01'],
        ]),
      );
    } else {
      const nextModule = simulated.development.nextModule;
      if (nextModule === null) {
        throw new Error('Simulation reached an unexpected lifecycle dead end.');
      }
      activate(
        simulated,
        registry,
        nextModule,
        new Map([
          ['approved', true],
          ['evidence', `Simulated approval for Module ${nextModule}`],
          ['date', '2099-01-01'],
        ]),
      );
    }
    validateConfig(simulated, registry);
  }

  if (
    simulated.development.currentModule !== null ||
    simulated.development.nextModule !== null ||
    simulated.development.moduleLifecycleState !== 'complete'
  ) {
    throw new Error(
      'Lifecycle simulation did not finish cleanly at Module 30.',
    );
  }

  if (!/not approved/i.test(simulated.development.productionDeploymentStatus)) {
    throw new Error(
      'Lifecycle simulation changed the deployment approval boundary.',
    );
  }

  validateReleasePolicy(simulated);
  if (simulated.releasePolicy.iosProofBlocksModuleLifecycle !== false) {
    throw new Error(
      'Lifecycle simulation made iOS native proof a module blocker.',
    );
  }
}

const { command, moduleNumber, options } = parseArguments(
  process.argv.slice(2),
);
const config = readJson(configPath);
const registry = readJson(registryPath);
validateRegistry(registry);

if (command === 'activate') {
  if (!Number.isInteger(moduleNumber))
    throw new Error('activate requires a module number.');
  activate(config, registry, moduleNumber, options);
  validateConfig(config, registry);
  persist(config, registry);
  validateManagedDocuments(config, registry);
  console.log(`Activated ${moduleLabel(getModule(registry, moduleNumber))}.`);
} else if (command === 'complete') {
  if (!Number.isInteger(moduleNumber))
    throw new Error('complete requires a module number.');
  complete(config, registry, moduleNumber, options);
  validateConfig(config, registry);
  persist(config, registry);
  validateManagedDocuments(config, registry);
  console.log(`Completed Module ${String(moduleNumber).padStart(2, '0')}.`);
} else if (command === 'slice') {
  if (!Number.isInteger(moduleNumber))
    throw new Error('slice requires a module number.');
  selectSlice(config, registry, moduleNumber, options);
  validateConfig(config, registry);
  persist(config, registry);
  validateManagedDocuments(config, registry);
  console.log(`Selected ${config.development.activeSlice}.`);
} else if (command === 'validate') {
  validateConfig(config, registry);
  validateManagedDocuments(config, registry);
  console.log('Module lifecycle validation passed.');
} else if (command === 'simulate') {
  validateConfig(config, registry);
  simulateLifecycle(config, registry);
  console.log('Module lifecycle simulation passed through Module 30.');
} else if (command === 'status') {
  validateConfig(config, registry);
  const active =
    config.development.currentModule === null
      ? 'None'
      : moduleLabel(getModule(registry, config.development.currentModule));
  console.log(`Lifecycle state: ${config.development.moduleLifecycleState}`);
  console.log(`Active module: ${active}`);
  console.log(
    `Last completed module: ${config.development.lastCompletedModule}`,
  );
  console.log(`Next module: ${config.development.nextModule ?? 'None'}`);
  console.log(
    `Production deployment: ${config.development.productionDeploymentStatus}`,
  );
} else {
  throw new Error(`Unknown command: ${command}`);
}
