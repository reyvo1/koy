#!/usr/bin/env node
import { access, readdir, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const launcherDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(launcherDirectory, '..', '..');
const sourceOfTruth = [
  'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md',
  'AI-Development-Kit/architecture/SYSTEM.md',
  'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
  'project-config.json',
  'docs/project-state.md',
  'docs/architecture.md',
  'docs/roadmap.md',
  'docs/module-lifecycle.md',
  'AI-Development-Kit/prompts/MODULE-10.md',
  'docs/module-10-barcode-cctv-ui-compatibility-contract.md',
  'package.json',
];

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : 'pipe',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${options.label ?? executable} failed with exit code ${result.status}.${
        details ? `\n${details}` : ''
      }`,
    );
  }
  return (result.stdout ?? '').trim();
}

function git(args, label) {
  return run('git', args, { label });
}

async function assertRepository() {
  for (const path of sourceOfTruth) {
    await access(resolve(repositoryRoot, path), constants.R_OK);
  }
  git(['rev-parse', '--is-inside-work-tree'], 'Git repository check');
}

function parseDivergence(value) {
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 2 || parts.some((item) => !Number.isInteger(item))) {
    throw new Error(`Unexpected ahead/behind output: ${value}`);
  }
  return { behind: parts[0], ahead: parts[1] };
}

async function readState() {
  await assertRepository();
  const status = git(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'Working-tree status',
  );
  const branch = git(['branch', '--show-current'], 'Current branch');
  const head = git(['rev-parse', 'HEAD'], 'HEAD');
  const parent = git(['rev-parse', 'HEAD^'], 'HEAD parent');
  const remoteHead = git(['rev-parse', 'origin/main'], 'origin/main');
  const divergence = parseDivergence(
    git(
      ['rev-list', '--left-right', '--count', 'origin/main...HEAD'],
      'Ahead/behind',
    ),
  );
  const trackedFiles = Number(
    git(['ls-files'], 'Tracked files').split(/\r?\n/).filter(Boolean).length,
  );
  const projectConfig = JSON.parse(
    await readFile(resolve(repositoryRoot, 'project-config.json'), 'utf8'),
  );

  return {
    status,
    branch,
    head,
    parent,
    remoteHead,
    trackedFiles,
    ...divergence,
    development: projectConfig.development,
  };
}

function printState(state) {
  console.log('IoT PLATFORM REPOSITORY CHECKPOINT');
  console.log('==================================');
  console.log(`Repository: ${repositoryRoot}`);
  console.log(`Branch: ${state.branch}`);
  console.log(`HEAD: ${state.head}`);
  console.log(`Parent: ${state.parent}`);
  console.log(`origin/main: ${state.remoteHead}`);
  console.log(`Ahead/behind: ${state.ahead}/${state.behind}`);
  console.log(`Working tree: ${state.status ? 'DIRTY' : 'clean'}`);
  console.log(`Tracked files: ${state.trackedFiles}`);
  console.log(`Lifecycle state: ${state.development.moduleLifecycleState}`);
  console.log(`Active module: ${state.development.activeWorkstream}`);
  console.log(`Active slice: ${state.development.activeSlice}`);
  console.log(`Next module: Module ${state.development.nextModule}`);
  console.log(`Next module status: ${state.development.nextModuleStatus}`);
  console.log(`Deployment: ${state.development.productionDeploymentStatus}`);
}

async function auditRepository() {
  const state = await readState();
  printState(state);

  if (state.status) {
    throw new Error('Working tree must be clean.');
  }
  if (state.branch !== 'main') {
    throw new Error(`Expected branch main, actual ${state.branch}.`);
  }
  if (state.behind !== 0) {
    throw new Error(`Repository is behind origin/main by ${state.behind} commit(s).`);
  }

  console.log('REPOSITORY AUDIT PASSED');
}

async function showCheckpoint() {
  printState(await readState());
}

async function openProjectContext() {
  await assertRepository();
  console.log('Mandatory project context:');
  for (const path of sourceOfTruth) {
    console.log(`- ${resolve(repositoryRoot, path)}`);
  }

  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [repositoryRoot], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    console.log('Repository folder opened in File Explorer.');
  } else {
    console.log('Automatic folder opening is only enabled on Windows.');
  }
}

function optionValue(args, name) {
  const direct = args.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : null;
}

async function doctorManifest(args) {
  await assertRepository();
  const manifest = optionValue(args, 'manifest');
  if (!manifest) {
    throw new Error('Manifest path is required through --manifest <path>.');
  }
  const absoluteManifest = resolve(manifest);
  await access(absoluteManifest, constants.R_OK);
  run(
    process.execPath,
    ['tools/module-runner/doctor.mjs', '--manifest', absoluteManifest],
    { inherit: true, label: 'Module doctor' },
  );
}

async function validateBaseline() {
  await assertRepository();
  const steps = [
    ['tools/module-runner/check-sources.mjs'],
    ['tools/module-runner/self-test.mjs'],
    ['scripts/manage-module-state.mjs', 'validate'],
    ['scripts/manage-module-state.mjs', 'simulate'],
  ];
  for (const args of steps) {
    run(process.execPath, args, {
      inherit: true,
      label: `Validation step ${args.join(' ')}`,
    });
  }
  console.log('BASELINE VALIDATION PASSED');
}

function downloadsDirectory() {
  return process.platform === 'win32'
    ? join(process.env.USERPROFILE ?? homedir(), 'Downloads')
    : join(homedir(), 'Downloads');
}

async function createSessionHandoff() {
  await auditRepository();
  const output = join(downloadsDirectory(), 'IoT-Platform-Handoffs');
  run(
    process.execPath,
    [
      'tools/module-runner/handoff.mjs',
      '--status',
      'local-unpushed',
      '--output',
      output,
    ],
    { inherit: true, label: 'Portable handoff creation' },
  );
  console.log('The package is deliberately marked local-unpushed.');
  console.log('Remote-green status still requires exact CI evidence.');
}

async function candidateHandoffs(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (
        entry.isFile() &&
        /^IoT-Platform-PORTABLE-HANDOFF-.*\.zip$/i.test(entry.name)
      ) {
        const path = join(directory, entry.name);
        candidates.push({ path, modified: (await stat(path)).mtimeMs });
      }
    }
    return candidates;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function openLatestHandoff() {
  const downloads = downloadsDirectory();
  const candidates = [
    ...(await candidateHandoffs(downloads)),
    ...(await candidateHandoffs(join(downloads, 'IoT-Platform-Handoffs'))),
  ].sort((left, right) => right.modified - left.modified);

  if (candidates.length === 0) {
    throw new Error(`No portable handoff ZIP found under ${downloads}.`);
  }

  const latest = candidates[0].path;
  console.log(`Latest handoff: ${latest}`);
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', ['/select,', latest], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  }
}

async function menu() {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      console.log('');
      console.log('IoT PLATFORM SAFE WORKFLOW LAUNCHER v1');
      console.log('======================================');
      console.log('[1] Audit repository');
      console.log('[2] Show current checkpoint');
      console.log('[3] Open project context');
      console.log('[4] Doctor an approved manifest');
      console.log('[5] Validate baseline');
      console.log('[6] Create session/account handoff');
      console.log('[7] Open latest handoff');
      console.log('[0] Exit');
      const choice = (await input.question('Select: ')).trim();

      if (choice === '0') return;
      if (choice === '1') await auditRepository();
      else if (choice === '2') await showCheckpoint();
      else if (choice === '3') await openProjectContext();
      else if (choice === '4') {
        const manifest = (await input.question('Manifest path: ')).trim();
        await doctorManifest(['--manifest', manifest]);
      } else if (choice === '5') await validateBaseline();
      else if (choice === '6') await createSessionHandoff();
      else if (choice === '7') await openLatestHandoff();
      else console.log('Unknown selection.');
    }
  } finally {
    input.close();
  }
}

async function main() {
  const [command = 'menu', ...args] = process.argv.slice(2);
  if (command === 'menu') return menu();
  if (command === 'audit') return auditRepository();
  if (command === 'checkpoint') return showCheckpoint();
  if (command === 'context') return openProjectContext();
  if (command === 'doctor') return doctorManifest(args);
  if (command === 'validate') return validateBaseline();
  if (command === 'handoff') return createSessionHandoff();
  if (command === 'open-handoff') return openLatestHandoff();
  throw new Error(`Unsupported operator command: ${command}`);
}

main().catch((error) => {
  console.error('STATUS: STOPPED');
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
