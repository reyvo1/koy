import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { runChecked } from '../../tools/module-runner/lib/process.mjs';

const repositoryRoot = process.cwd();
const matrixRoot = mkdtempSync(
  resolve(tmpdir(), 'iot-platform-historical-contract-matrix-'),
);
const policy = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, 'test/contract-surface-policy.json'),
    'utf8',
  ),
);
const {
  mutableSummaryDocuments,
  immutableEvidenceDocuments,
  states: stateDefinitions,
  validationCommands,
} = policy.transitionProof;

const commandTimeoutMs = (args) =>
  args[0] === 'test' && args.includes('--runInBand') ? 900_000 : 600_000;

const run = async (cwd, args) => {
  console.log(`> npm ${args.join(' ')}`);
  await runChecked('npm', args, {
    cwd,
    env: { CI: '1' },
    timeoutMs: commandTimeoutMs(args),
    heartbeatMs: 30_000,
    stream: true,
  });
};

const trackedFiles = async () => {
  const result = await runChecked('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    timeoutMs: 180_000,
    heartbeatMs: 30_000,
  });
  return result.stdout.split('\0').filter((path) => path.length > 0);
};

const copyTrackedRepository = async (destination) => {
  for (const relativePath of await trackedFiles()) {
    const sourcePath = resolve(repositoryRoot, relativePath);
    const targetPath = resolve(destination, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true });
    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) {
      symlinkSync(readlinkSync(sourcePath), targetPath, 'file');
    } else {
      copyFileSync(sourcePath, targetPath);
    }
  }

  symlinkSync(
    resolve(repositoryRoot, 'node_modules'),
    resolve(destination, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
};

const churnMutableSummaries = (projection, label) => {
  for (const relativePath of mutableSummaryDocuments) {
    const absolutePath = resolve(projection, relativePath);
    const content = readFileSync(absolutePath, 'utf8').replace(/\r\n?/g, '\n');
    const markerStart = '<!-- MODULE-LIFECYCLE:START -->';
    const markerEnd = '<!-- MODULE-LIFECYCLE:END -->';
    const start = content.indexOf(markerStart);
    const end = content.indexOf(markerEnd);
    if (start === -1 || end === -1 || end < start) {
      throw new Error(`Managed lifecycle block missing from ${relativePath}`);
    }
    const heading = content.split('\n', 1)[0];
    const lifecycleBlock = content.slice(start, end + markerEnd.length);
    writeFileSync(
      absolutePath,
      [
        heading,
        '',
        lifecycleBlock,
        '',
        '## Projected Current Summary',
        '',
        `State: ${label}`,
        '',
        'This projected summary intentionally contains no copied historical commit, CI run, artifact, checksum, test-total, milestone, sentence, or historical link fan-out.',
        '',
      ].join('\n'),
      'utf8',
    );
  }
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const immutableEvidenceHashes = new Map(
  immutableEvidenceDocuments.map((relativePath) => [
    relativePath,
    sha256(readFileSync(resolve(repositoryRoot, relativePath))),
  ]),
);

const resolveCheckpointTransitionCount = (development) => {
  if (development.currentModule === 10) {
    return 0;
  }

  if (
    development.currentModule === null &&
    development.lastCompletedModule === 10 &&
    development.nextModule === 11 &&
    development.moduleLifecycleState === 'awaiting-activation'
  ) {
    return 2;
  }

  if (development.currentModule === 11) {
    return development.activeSlice.startsWith('Module 11 Slice ') ? 4 : 3;
  }

  if (
    development.lastCompletedModule >= 11 ||
    (development.currentModule !== null && development.currentModule > 11)
  ) {
    return 4;
  }

  throw new Error(
    `Unsupported lifecycle checkpoint for historical transition matrix: ${JSON.stringify(
      {
        currentModule: development.currentModule,
        lastCompletedModule: development.lastCompletedModule,
        nextModule: development.nextModule,
        moduleLifecycleState: development.moduleLifecycleState,
        activeSlice: development.activeSlice,
      },
    )}`,
  );
};

const planProjectedState = (state, index, realizedTransitionCount) => {
  if (index === 0) {
    return { skipped: false, transitions: state.transitions };
  }

  if (state.transitions.length < realizedTransitionCount) {
    return { skipped: true, transitions: [] };
  }

  return {
    skipped: false,
    transitions: state.transitions.slice(realizedTransitionCount),
  };
};

const assertPlanning = (condition, message) => {
  if (!condition) {
    throw new Error(
      `Historical transition planning self-test failed: ${message}`,
    );
  }
};

const verifyTransitionPlanning = () => {
  assertPlanning(
    resolveCheckpointTransitionCount({
      currentModule: 10,
      lastCompletedModule: 9,
      nextModule: 11,
      moduleLifecycleState: 'active',
      activeSlice: 'Module 10 Slice 10.14 - Module 10 Completion Review',
    }) === 0,
    'active Module 10 checkpoint',
  );
  assertPlanning(
    resolveCheckpointTransitionCount({
      currentModule: null,
      lastCompletedModule: 10,
      nextModule: 11,
      moduleLifecycleState: 'awaiting-activation',
      activeSlice: 'Module 10 - Dynamic Dashboard Completion Review',
    }) === 2,
    'completed Module 10 checkpoint',
  );
  assertPlanning(
    resolveCheckpointTransitionCount({
      currentModule: 11,
      lastCompletedModule: 10,
      nextModule: 12,
      moduleLifecycleState: 'active',
      activeSlice: 'Module 11 - Automation Engine',
    }) === 3,
    'activated Module 11 checkpoint',
  );
  assertPlanning(
    resolveCheckpointTransitionCount({
      currentModule: 11,
      lastCompletedModule: 10,
      nextModule: 12,
      moduleLifecycleState: 'active',
      activeSlice: 'Module 11 Slice 11.1 - Automation Domain Contract',
    }) === 4,
    'Module 11 Slice 11.1 checkpoint',
  );

  const historical = planProjectedState({ transitions: [[]] }, 1, 2);
  assertPlanning(historical.skipped, 'historical state skip');
  const current = planProjectedState({ transitions: [[], []] }, 2, 2);
  assertPlanning(
    !current.skipped && current.transitions.length === 0,
    'current state validation without replay',
  );
  const future = planProjectedState(
    { transitions: [[], [], ['activate'], ['slice']] },
    4,
    2,
  );
  assertPlanning(
    !future.skipped &&
      JSON.stringify(future.transitions) ===
        JSON.stringify([['activate'], ['slice']]),
    'future transition suffix',
  );
};

const { development } = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'project-config.json'), 'utf8'),
);
const checkpointTransitionCount = resolveCheckpointTransitionCount(development);
verifyTransitionPlanning();

const verifyImmutableEvidence = (projection) => {
  for (const relativePath of immutableEvidenceDocuments) {
    const content = readFileSync(resolve(projection, relativePath));
    if (content.toString('utf8').trim().length === 0) {
      throw new Error(`Immutable evidence became unreadable: ${relativePath}`);
    }
    const actualHash = sha256(content);
    const expectedHash = immutableEvidenceHashes.get(relativePath);
    if (actualHash !== expectedHash) {
      throw new Error(
        `Immutable evidence changed during projection: ${relativePath}`,
      );
    }
  }
};

try {
  for (const [index, state] of stateDefinitions.entries()) {
    const projection = resolve(matrixRoot, `state-${index + 1}`);
    mkdirSync(projection, { recursive: true });
    await copyTrackedRepository(projection);

    console.log(`\n=== PROJECTED STATE: ${state.label} ===`);
    const plan = planProjectedState(state, index, checkpointTransitionCount);
    if (plan.skipped) {
      console.log(
        `PROJECTED STATE SKIPPED: ${state.label} is already historical at this checkpoint`,
      );
      continue;
    }

    for (const transition of plan.transitions) {
      await run(projection, transition);
    }
    if (state.churnCurrentSummaries) {
      churnMutableSummaries(projection, state.label);
    }

    verifyImmutableEvidence(projection);
    for (const validationCommand of validationCommands) {
      await run(projection, validationCommand);
    }
    console.log(`PROJECTED STATE PASSED: ${state.label}`);
  }

  console.log('HISTORICAL CONTRACT TRANSITION MATRIX PASSED');
} finally {
  rmSync(matrixRoot, { recursive: true, force: true });
}
