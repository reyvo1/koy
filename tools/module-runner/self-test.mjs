#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  captureTextStyles,
  verifyChangedTextFiles,
} from './lib/file-policy.mjs';
import {
  assertClean,
  commitNameStatus,
  createCommit,
  createDetachedWorktree,
  git,
  headSha,
  removeWorktree,
  statusEntries,
} from './lib/git.mjs';
import { runChecked, runNative } from './lib/process.mjs';
import { createStoredZip, extractZip } from './lib/zip.mjs';
import { executePackage } from './package.mjs';
import { cleanupOwnedWorkspaces } from './cleanup.mjs';
import { sha256Buffer } from './lib/hash.mjs';
import { validateValidationProfiles } from './lib/manifest.mjs';
import { expandArguments } from './lib/validation.mjs';
import { selectChangedTypeScriptPaths } from './check-format.mjs';
import {
  cleanupWorkspace,
  createWorkspace,
  projectedWorktreePathLength,
  selectWorkspaceRoot,
  WINDOWS_SAFE_PATH_LIMIT,
} from './lib/workspace.mjs';

const WINDOWS_TEMP_FIXTURE = String.raw`C:\Users\Owner\AppData\Local\Temp`;

async function main() {
  await verifyFailFastRepositoryState();
  await verifyNativeStreams();
  await verifyTimeoutAndStreaming();
  await verifyBootstrapCompatibleValidationProfiles();
  await verifyWorkspacePolicy();
  await verifyOfficialCleanup();
  await verifyWorktreeAndLineEndings();
  await verifyEndToEndExecution();
  await verifyZipWriter();
  console.log('MODULE EXECUTION KIT SELF-TEST PASSED');
}

async function verifyFailFastRepositoryState() {
  // This preamble is intentionally first. It preserves compatibility with a
  // base runner that requires the self-test profile step first, while making
  // source and lifecycle drift fail in seconds before the longer self-test
  // probes or dependency bootstrap.
  await runChecked(
    process.execPath,
    ['tools/module-runner/check-sources.mjs'],
    {
      cwd: process.cwd(),
      timeoutMs: 120_000,
      stream: true,
    },
  );
  await runChecked('npm', ['run', 'module:validate'], {
    cwd: process.cwd(),
    timeoutMs: 120_000,
    stream: true,
  });
  await runChecked('npm', ['run', 'module:simulate'], {
    cwd: process.cwd(),
    timeoutMs: 120_000,
    stream: true,
  });
}

async function verifyNativeStreams() {
  const probe = await runNative(
    process.execPath,
    [
      '-e',
      "process.stdout.write('STDOUT_ONLY'); process.stderr.write('STDERR_ONLY')",
    ],
    { timeoutMs: 30_000 },
  );
  assert(probe.exitCode === 0, 'native stream probe failed');
  assert(probe.stdout === 'STDOUT_ONLY', 'stdout was contaminated');
  assert(probe.stderr === 'STDERR_ONLY', 'stderr was contaminated');

  const failure = await runNative(
    process.execPath,
    ['-e', "process.stderr.write('EXPECTED'); process.exit(7)"],
    { timeoutMs: 30_000 },
  );
  assert(failure.exitCode === 7, 'native exit code was not preserved');
  assert(failure.stderr === 'EXPECTED', 'failure stderr was not preserved');
}

async function verifyTimeoutAndStreaming() {
  let streamedStdout = '';
  let streamedStderr = '';
  const result = await runNative(
    process.execPath,
    [
      '-e',
      "process.stdout.write('STARTED'); setTimeout(() => process.exit(0), 5000);",
    ],
    {
      timeoutMs: 150,
      heartbeatMs: 50,
      stream: true,
      stdoutWriter: { write: (value) => (streamedStdout += value.toString()) },
      stderrWriter: { write: (value) => (streamedStderr += value.toString()) },
    },
  );
  assert(result.timedOut, 'timeout was not enforced');
  assert(streamedStdout.includes('STARTED'), 'stdout was not streamed');
  assert(
    streamedStderr.includes('[module-runner] still running'),
    'heartbeat was not streamed',
  );

  let quietStdout = '';
  let quietStderr = '';
  const quiet = await runNative(
    process.execPath,
    ['-e', 'setTimeout(() => process.exit(0), 120);'],
    {
      timeoutMs: 5_000,
      heartbeatMs: 50,
      stream: false,
      stdoutWriter: { write: (value) => (quietStdout += value.toString()) },
      stderrWriter: { write: (value) => (quietStderr += value.toString()) },
    },
  );
  assert(quiet.exitCode === 0, 'quiet heartbeat probe failed');
  assert(quietStdout === '', 'quiet command streamed stdout');
  assert(
    quietStderr.includes('[module-runner] still running'),
    'quiet command did not retain heartbeat visibility',
  );
}

async function verifyBootstrapCompatibleValidationProfiles() {
  const profilePath = resolve(
    process.cwd(),
    'tools',
    'module-runner',
    'profiles',
    'validation-profiles.json',
  );
  const profiles = JSON.parse(await readFile(profilePath, 'utf8'));
  validateValidationProfiles(profiles, profilePath);

  for (const steps of Object.values(profiles.profiles)) {
    for (const step of steps) {
      for (const argument of step.args) {
        if (/^\{[^{}]+\}$/.test(argument)) {
          assert(
            argument === '{changed}',
            `validation profile uses unsupported bootstrap placeholder ${argument}`,
          );
        }
      }
    }
  }

  const selected = selectChangedTypeScriptPaths([
    'test/example.spec.ts',
    'apps/example.tsx',
    'docs/example.md',
  ]);
  assert(
    JSON.stringify(selected) ===
      JSON.stringify(['test/example.spec.ts', 'apps/example.tsx']),
    'changed TypeScript path filtering is not deterministic',
  );

  const expanded = expandArguments(
    ['--check', '{changed}'],
    ['test/example.spec.ts', 'docs/example.md'],
  );
  assert(
    JSON.stringify(expanded) ===
      JSON.stringify(['--check', 'test/example.spec.ts', 'docs/example.md']),
    'stable changed-path placeholder was not expanded',
  );

  let unsupportedRejected = false;
  try {
    expandArguments(['{changed-typescript}'], ['test/example.spec.ts']);
  } catch (error) {
    unsupportedRejected = error.message.includes(
      'Unsupported validation argument placeholder',
    );
  }
  assert(
    unsupportedRejected,
    'unsupported validation placeholder was not rejected',
  );

  let registryRejected = false;
  try {
    validateValidationProfiles(
      {
        version: 1,
        profiles: {
          invalid: [
            {
              label: 'Invalid placeholder',
              command: 'node',
              args: ['{changed-typescript}'],
            },
          ],
        },
      },
      'self-test invalid profiles',
    );
  } catch (error) {
    registryRejected = error.message.includes(
      'uses unsupported argument placeholder',
    );
  }
  assert(
    registryRejected,
    'profile registry accepted an unsupported placeholder',
  );

  let prismaEnvironmentRejected = false;
  try {
    validateValidationProfiles(
      {
        version: 1,
        profiles: {
          invalid: [
            {
              label: 'Prisma schema validation',
              command: 'npx',
              args: ['prisma', 'validate'],
            },
          ],
        },
      },
      'self-test missing Prisma environment',
    );
  } catch (error) {
    prismaEnvironmentRejected = error.message.includes(
      'Prisma validate steps require DATABASE_URL',
    );
  }
  assert(
    prismaEnvironmentRejected,
    'profile registry accepted a Prisma schema step without DATABASE_URL',
  );
}

async function verifyWorkspacePolicy() {
  const root = await mkdtemp(resolve(tmpdir(), 'iot-workspace-policy-'));
  try {
    const fallback = await selectWorkspaceRoot({
      repositoryRoot: root,
      platform: 'win32',
      env: {},
    });
    assert(
      fallback.projectedPathLength <= fallback.safePathLimit,
      'Windows fallback path budget was not enforced',
    );

    verifyWindowsFixtureWorkRoot('w');

    const envRedirectIgnored = await selectWorkspaceRoot({
      repositoryRoot: root,
      platform: 'win32',
      env: { IOT_MODULE_WORK_ROOT: resolve(root, 'forbidden-env-root') },
    });
    assert(
      samePath(envRedirectIgnored.root, fallback.root, 'win32'),
      'implicit IOT_MODULE_WORK_ROOT redirected the workspace',
    );

    const selected = await selectWorkspaceRoot({
      repositoryRoot: root,
      requestedRoot: fallback.root,
      platform: 'win32',
      env: {},
    });
    assert(
      samePath(selected.root, fallback.root, 'win32'),
      'known-safe requested root was not selected',
    );

    const unsafeRequested = resolve(
      root,
      `unsafe-${'nested-path-'.repeat(12)}`,
    );
    assert(
      projectedWorktreePathLength(unsafeRequested, 'win32') >
        fallback.safePathLimit,
      'over-budget requested root was not rejected by the path-budget fixture',
    );
    let unsafeRootRejected = false;
    try {
      await selectWorkspaceRoot({
        repositoryRoot: root,
        requestedRoot: unsafeRequested,
        platform: 'win32',
        env: {},
      });
    } catch (error) {
      unsafeRootRejected =
        error.message.includes('No safe writable module-runner work root') &&
        error.message.includes('projected path length');
    }
    assert(
      unsafeRootRejected,
      'over-budget explicit work root was not rejected without fallback',
    );

    const workspace = await createWorkspace({
      repositoryRoot: root,
      requestedRoot: fallback.root,
      platform: 'win32',
      env: {},
    });
    assert(
      samePath(workspace.root, fallback.root, 'win32'),
      'workspace did not use the selected safe root',
    );
    assert(
      basename(workspace.worktree) === 'w',
      'short worktree name was not used',
    );
    const marker = JSON.parse(await readFile(workspace.markerPath, 'utf8'));
    assert(
      marker.owner === 'iot-platform-module-runner',
      'workspace ownership marker was not written',
    );

    let concurrentRejected = false;
    try {
      await createWorkspace({
        repositoryRoot: root,
        requestedRoot: fallback.root,
        platform: 'win32',
        env: {},
      });
    } catch (error) {
      concurrentRejected = error.message.includes(
        'Another module-runner workspace is active or stale',
      );
    }
    assert(concurrentRejected, 'concurrent workspace was not rejected');

    const cleanup = await cleanupWorkspace(workspace);
    assert(cleanup.temporaryRootRemoved, 'workspace cleanup was not verified');
    assert(
      cleanup.remainingOwnedWorkspaces === 0,
      'owned workspaces remained after cleanup',
    );
    let markerStillExists = true;
    try {
      await readFile(workspace.markerPath, 'utf8');
    } catch (error) {
      markerStillExists = error.code !== 'ENOENT';
    }
    assert(!markerStillExists, 'owned workspace was not removed');

    let diskGuardRejected = false;
    try {
      await createWorkspace({
        repositoryRoot: root,
        requestedRoot: fallback.root,
        platform: 'win32',
        env: {},
        minFreeBytes: Number.MAX_SAFE_INTEGER,
      });
    } catch (error) {
      diskGuardRejected = error.message.includes(
        'Insufficient free disk space',
      );
    }
    assert(diskGuardRejected, 'workspace disk guard was not enforced');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyOfficialCleanup() {
  const root = await createShortFixtureRoot();
  const repository = resolve(root, 'r');
  const workRoot = resolve(root, 'w');
  verifyWindowsFixtureWorkRoot('w');
  await mkdir(repository, { recursive: true });

  try {
    await runChecked('git', ['init', '--initial-branch=main'], {
      cwd: repository,
    });
    await configureFixtureRepository(
      repository,
      'Module Runner Cleanup',
      'cleanup@example.invalid',
    );
    await writeFile(resolve(repository, 'sample.txt'), 'alpha\n', 'utf8');
    await runChecked('git', ['add', 'sample.txt'], { cwd: repository });
    await runChecked('git', ['commit', '-m', 'baseline'], { cwd: repository });

    const workspace = await createWorkspace({
      repositoryRoot: repository,
      requestedRoot: workRoot,
      minFreeBytes: 1,
    });
    for (const markerPath of [workspace.markerPath, workspace.lockMarkerPath]) {
      const marker = JSON.parse(await readFile(markerPath, 'utf8'));
      marker.pid = 2_147_483_647;
      await writeFile(
        markerPath,
        `${JSON.stringify(marker, null, 2)}\n`,
        'utf8',
      );
    }

    const ownedCleanup = await cleanupOwnedWorkspaces({
      repositoryRoot: repository,
      workRoot,
      minAgeMinutes: 0,
      allOwned: true,
    });
    assert(
      ownedCleanup.removed.length === 1,
      'owned cleanup did not remove workspace',
    );
    assert(ownedCleanup.remainingOwned === 0, 'owned cleanup left a workspace');

    const legacyRoot = resolve(workRoot, 'm-legacy');
    const legacyWorktree = resolve(legacyRoot, 'w');
    await createDetachedWorktree(
      repository,
      legacyWorktree,
      await headSha(repository),
    );
    const legacyCleanup = await cleanupOwnedWorkspaces({
      repositoryRoot: repository,
      workRoot,
      minAgeMinutes: 0,
      allOwned: true,
      includeLegacyWorktrees: true,
    });
    assert(
      legacyCleanup.removedLegacy.length === 1,
      'legacy cleanup did not remove the proven repository worktree',
    );
    assert(
      legacyCleanup.remainingRegistered === 0,
      'legacy cleanup left a registered worktree',
    );

    const invalidArchive = resolve(root, 'invalid-package.zip');
    await createStoredZip(invalidArchive, [
      { name: 'README.txt', data: Buffer.from('invalid package\n', 'utf8') },
    ]);
    let invalidPackageRejected = false;
    try {
      await executePackage({
        repositoryRoot: repository,
        archivePath: invalidArchive,
        outputDirectory: resolve(root, 'invalid-output'),
        workRoot,
      });
    } catch (error) {
      invalidPackageRejected = error.message.includes(
        'Expected exactly one slice manifest',
      );
    }
    assert(invalidPackageRejected, 'invalid package was not rejected');

    const cleanupProbe = await createWorkspace({
      repositoryRoot: repository,
      requestedRoot: workRoot,
      minFreeBytes: 1,
    });
    await cleanupWorkspace(cleanupProbe);
    await assertClean(repository);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createShortFixtureRoot() {
  return mkdtemp(resolve(tmpdir(), 'i-'));
}

function verifyWindowsFixtureWorkRoot(relativeWorkRoot) {
  const simulatedRoot = win32.resolve(
    WINDOWS_TEMP_FIXTURE,
    'i-123456',
    relativeWorkRoot,
  );
  const projectedLength = projectedWorktreePathLength(simulatedRoot, 'win32');
  assert(
    projectedLength <= WINDOWS_SAFE_PATH_LIMIT,
    `Windows fixture work root exceeds ${WINDOWS_SAFE_PATH_LIMIT}: ${projectedLength}`,
  );
}

function samePath(left, right, platform = process.platform) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  if (platform === 'win32') {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }
  return normalizedLeft === normalizedRight;
}

async function configureFixtureRepository(repository, name, email) {
  for (const [key, value] of [
    ['user.name', name],
    ['user.email', email],
    ['core.autocrlf', 'false'],
    ['core.eol', 'lf'],
    ['core.safecrlf', 'true'],
  ]) {
    await runChecked('git', ['config', key, value], { cwd: repository });
  }
}

async function verifyWorktreeAndLineEndings() {
  const root = await createShortFixtureRoot();
  const repository = resolve(root, 'r');
  const worktree = resolve(root, 'w');
  await mkdir(repository);

  try {
    await runChecked('git', ['init', '--initial-branch=main'], {
      cwd: repository,
    });
    await configureFixtureRepository(
      repository,
      'Module Runner Self Test',
      'self-test@example.invalid',
    );
    await writeFile(resolve(repository, 'sample.txt'), 'alpha\r\n', 'utf8');
    await runChecked('git', ['add', 'sample.txt'], { cwd: repository });
    await runChecked('git', ['commit', '-m', 'baseline'], { cwd: repository });
    const base = await headSha(repository);

    await createDetachedWorktree(repository, worktree, base);
    const changes = [{ status: 'M', path: 'sample.txt' }];
    const styles = await captureTextStyles(worktree, changes);
    await writeFile(
      resolve(worktree, 'sample.txt'),
      'alpha\r\nbeta\r\n',
      'utf8',
    );
    const entries = await statusEntries(worktree);
    assert(
      entries.length === 1 && entries[0].path === 'sample.txt',
      'status parse failed',
    );

    await verifyChangedTextFiles(worktree, changes, styles);

    await writeFile(
      resolve(worktree, 'sample.txt'),
      'alpha\r\nbeta\r\n\r\n',
      'utf8',
    );
    let extraBlankLineRejected = false;
    try {
      await verifyChangedTextFiles(worktree, changes, styles);
    } catch (error) {
      extraBlankLineRejected = error.message.includes(
        'Extra blank line at EOF',
      );
    }
    assert(
      extraBlankLineRejected,
      'extra blank line at EOF was not rejected by the fail-fast text policy',
    );

    await writeFile(
      resolve(worktree, 'sample.txt'),
      'alpha\r\nbeta  \r\n',
      'utf8',
    );
    let trailingWhitespaceRejected = false;
    try {
      await verifyChangedTextFiles(worktree, changes, styles);
    } catch (error) {
      trailingWhitespaceRejected = error.message.includes(
        'Trailing whitespace',
      );
    }
    assert(
      trailingWhitespaceRejected,
      'trailing whitespace was not rejected by the fail-fast text policy',
    );

    await writeFile(
      resolve(worktree, 'sample.txt'),
      'alpha\r\nbeta\r\n',
      'utf8',
    );
    await verifyChangedTextFiles(worktree, changes, styles);
    const content = await readFile(resolve(worktree, 'sample.txt'), 'utf8');
    assert(
      content === 'alpha\r\nbeta\r\n',
      'exact payload line-ending preservation failed',
    );

    await git(worktree, ['add', 'sample.txt']);
    const commit = await createCommit(worktree, 'verified change');
    assert(
      (await headSha(worktree, 'HEAD^')) === base,
      'commit parent mismatch',
    );
    const committed = await commitNameStatus(worktree, commit);
    assert(
      committed.length === 1 && committed[0].status === 'M',
      'commit status verification failed',
    );
    await assertClean(worktree);
  } finally {
    await removeWorktree(repository, worktree).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyEndToEndExecution() {
  const root = await createShortFixtureRoot();
  const repository = resolve(root, 'r');
  const output = resolve(root, 'o');
  const manifestPath = resolve(root, 'm.json');
  const archivePath = resolve(root, 'p.zip');
  const payloadRoot = resolve(root, 'p');
  const workRoot = resolve(root, 'w');
  verifyWindowsFixtureWorkRoot('w');
  await mkdir(repository, { recursive: true });
  await mkdir(payloadRoot, { recursive: true });

  try {
    const npmVersion = (await runChecked('npm', ['--version'])).stdout.trim();

    await runChecked('git', ['init', '--initial-branch=main'], {
      cwd: repository,
    });
    await configureFixtureRepository(
      repository,
      'Module Runner E2E',
      'module-runner@example.invalid',
    );

    const requiredFiles = {
      '.nvmrc': `${process.version.slice(1)}\n`,
      '.prettierrc': '{"endOfLine":"auto"}\n',
      '.eslintrc.cjs': 'module.exports = {};\n',
      '.gitattributes': 'tools/module-runner/** text eol=lf\n',
      '.editorconfig': 'root = true\n',
      'package.json': `${JSON.stringify(
        {
          name: 'module-runner-e2e',
          private: true,
          packageManager: `npm@${npmVersion}`,
          scripts: {
            build: 'echo build',
            test: 'echo test',
            'lint:check': 'echo lint',
            'test:contracts': 'echo contracts',
            'test:historical-contract-state': 'echo historical-state',
            'test:historical-contract-transitions':
              'echo historical-transitions',
            'module:doctor': 'node tools/module-runner/doctor.mjs',
            'module:execute': 'node tools/module-runner/execute.mjs',
            'module:runner:check': 'node tools/module-runner/check-sources.mjs',
            'module:runner:self-test': 'node tools/module-runner/self-test.mjs',
            'module:validate': 'node scripts/manage-module-state.mjs validate',
            'module:simulate': 'node scripts/manage-module-state.mjs simulate',
          },
        },
        null,
        2,
      )}\n`,
      'package-lock.json':
        '{"name":"module-runner-e2e","lockfileVersion":3,"requires":true,"packages":{}}\n',
      'project-config.json': `${JSON.stringify(
        {
          development: {
            activeWorkstream: 'Module 10 - Dynamic Dashboard',
            activeSlice: 'Module 10 Slice 10.10 - Runner E2E',
            moduleLifecycleEvidence: 'Self-test only',
            moduleLifecycleState: 'active',
            currentModule: 10,
            nextModule: 11,
            nextModuleStatus: 'Module 11 is not active',
            moduleRegistry: 'AI-Development-Kit/modules/module-registry.json',
            productionDeploymentStatus: 'Not approved',
          },
        },
        null,
        2,
      )}\n`,
      'AI-Development-Kit/bootstrap/PROJECT-BOOTSTRAP-v1.0.md': '# Bootstrap\n',
      'AI-Development-Kit/architecture/SYSTEM.md': '# System\n',
      'AI-Development-Kit/agent/REPOSITORY-MEMORY.md': '# Memory\n',
      'AI-Development-Kit/modules/module-registry.json': `${JSON.stringify(
        {
          version: 1,
          modules: [
            {
              module: 10,
              title: 'Dynamic Dashboard',
              scope: 'Self-test module scope',
              prompt: 'AI-Development-Kit/prompts/MODULE-10.md',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'AI-Development-Kit/prompts/MODULE-10.md': '# Module 10\n',
      'docs/module-lifecycle.md': '# Lifecycle\n',
      'docs/project-state.md': '# Project State\n',
      'docs/roadmap.md': '# Roadmap\n',
      'test/contract-surface-policy.json':
        '{"version":1,"contractClasses":{},"currentStateContracts":[]}\n',
      'scripts/manage-module-state.mjs': 'process.exit(0);\n',
      'tools/module-runner/profiles/validation-profiles.json': `${JSON.stringify(
        {
          version: 1,
          profiles: {
            'self-test-proof': [
              {
                label: 'Verify staged content',
                command: process.execPath,
                args: [
                  '-e',
                  "const fs=require('fs'); if(fs.readFileSync('sample.txt','utf8')!=='alpha\\nbeta\\n') process.exit(2); if(fs.readFileSync('added.txt','utf8')!=='added\\n') process.exit(3);",
                ],
                timeoutMs: 30000,
              },
            ],
            'self-test-post': [
              {
                label: 'Verify committed content',
                command: process.execPath,
                args: [
                  '-e',
                  "const fs=require('fs'); if(fs.readFileSync('sample.txt','utf8')!=='alpha\\nbeta\\n') process.exit(4);",
                ],
                timeoutMs: 30000,
              },
            ],
            'self-test-failure': [
              {
                label: 'Intentional validation failure cleanup proof',
                command: process.execPath,
                args: ['-e', 'process.exit(9);'],
                timeoutMs: 30000,
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      'sample.txt': 'alpha\n',
    };

    for (const [relativePath, content] of Object.entries(requiredFiles)) {
      const absolutePath = resolve(repository, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    }

    await runChecked('git', ['add', '--all'], { cwd: repository });
    await runChecked('git', ['commit', '-m', 'baseline'], { cwd: repository });
    const baseSha = await headSha(repository);
    const trackedBefore = (
      await runChecked('git', ['ls-files', '-z'], { cwd: repository })
    ).stdout
      .split('\0')
      .filter(Boolean).length;

    await writeFile(
      resolve(payloadRoot, 'sample.txt'),
      'alpha\nbeta\n',
      'utf8',
    );
    await writeFile(resolve(payloadRoot, 'added.txt'), 'added\n', 'utf8');
    const sampleHash = sha256Buffer(Buffer.from('alpha\nbeta\n')).toString();
    const addedHash = sha256Buffer(Buffer.from('added\n')).toString();

    const manifest = {
      version: 1,
      id: 'self-test-slice',
      title: 'End-to-end runner proof',
      baseSha,
      branch: 'main',
      commitSubject: 'test(tooling): prove module runner',
      expectedTrackedFilesBefore: trackedBefore,
      expectedTrackedFilesAfter: trackedBefore + 1,
      payload: {
        format: 'exact-files-v1',
        path: 'payload',
      },
      allowedChanges: {
        added: ['added.txt'],
        modified: ['sample.txt'],
        deleted: [],
      },
      expectedFileHashes: {
        'added.txt': addedHash,
        'sample.txt': sampleHash,
      },
      forbiddenPrefixes: ['src/', 'prisma/'],
      validationProfile: 'self-test-proof',
      postApplyValidationProfile: 'self-test-post',
    };
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    await createStoredZip(archivePath, [
      { name: 'slice.manifest.json', data: await readFile(manifestPath) },
      {
        name: 'payload/sample.txt',
        data: await readFile(resolve(payloadRoot, 'sample.txt')),
      },
      {
        name: 'payload/added.txt',
        data: await readFile(resolve(payloadRoot, 'added.txt')),
      },
    ]);

    const whitespacePayload = Buffer.from('alpha\nbeta\n\n', 'utf8');
    const whitespaceManifest = {
      ...manifest,
      id: 'self-test-whitespace-failure-slice',
      commitSubject: 'test(tooling): reject whitespace before validation',
      expectedTrackedFilesAfter: trackedBefore,
      allowedChanges: {
        added: [],
        modified: ['sample.txt'],
        deleted: [],
      },
      expectedFileHashes: {
        'sample.txt': sha256Buffer(whitespacePayload).toString(),
      },
      validationProfile: 'self-test-failure',
      postApplyValidationProfile: undefined,
    };
    delete whitespaceManifest.postApplyValidationProfile;
    const whitespaceArchive = resolve(root, 'whitespace-package.zip');
    await createStoredZip(whitespaceArchive, [
      {
        name: 'whitespace.manifest.json',
        data: Buffer.from(
          `${JSON.stringify(whitespaceManifest, null, 2)}\n`,
          'utf8',
        ),
      },
      { name: 'payload/sample.txt', data: whitespacePayload },
    ]);

    let whitespaceFailure = null;
    try {
      await executePackage({
        repositoryRoot: repository,
        archivePath: whitespaceArchive,
        outputDirectory: resolve(root, 'whitespace-output'),
        workRoot,
      });
    } catch (error) {
      whitespaceFailure = error;
    }
    assert(whitespaceFailure, 'extra blank line package was not rejected');
    assert(
      whitespaceFailure.message.includes('Extra blank line at EOF'),
      'extra blank line was not rejected by the dependency-free payload gate',
    );
    assert(
      whitespaceFailure.result?.exitCode !== 9,
      'long-running validation started before the fail-fast whitespace gate',
    );
    assert(
      (await headSha(repository)) === baseSha,
      'fail-fast whitespace rejection changed the repository HEAD',
    );
    await assertClean(repository);

    const result = await executePackage({
      repositoryRoot: repository,
      archivePath,
      outputDirectory: output,
      workRoot,
    });

    assert(result.status === 'local-commit-verified', 'E2E status mismatch');
    assert(
      (await headSha(repository)) === result.provenCommit,
      'E2E HEAD mismatch',
    );
    await assertClean(repository);
    assert(
      (await readFile(resolve(repository, 'sample.txt'), 'utf8')) ===
        'alpha\nbeta\n',
      'E2E modified file mismatch',
    );
    assert(
      (await readFile(resolve(repository, 'added.txt'), 'utf8')) === 'added\n',
      'E2E added file mismatch',
    );
    const handoffBytes = await readFile(result.handoffPath);
    assert(
      handoffBytes.includes(Buffer.from('MANIFEST-SHA256.txt')),
      'Handoff integrity manifest missing',
    );
    for (const requiredEntry of [
      '06-SESSION-PROTOCOL.md',
      '07-VALIDATION-POLICY.json',
      '08-CONTEXT-MAP.json',
      '09-FAILURE-PREVENTION.md',
      '10-CONTINUITY-CHECKLIST.md',
      'context/project-config.json',
      'context/package.json',
      'context/test/contract-surface-policy.json',
      'context/tools/module-runner/profiles/validation-profiles.json',
    ]) {
      assert(
        handoffBytes.includes(Buffer.from(requiredEntry)),
        `Handoff continuity entry missing: ${requiredEntry}`,
      );
    }

    const extractedHandoffRoot = resolve(root, 'handoff-extracted');
    const extractedHandoffEntries = await extractZip(
      result.handoffPath,
      extractedHandoffRoot,
    );
    assert(
      extractedHandoffEntries.includes('06-SESSION-PROTOCOL.md'),
      'Session protocol was not extractable',
    );
    const handoffState = JSON.parse(
      await readFile(resolve(extractedHandoffRoot, '05-STATE.json'), 'utf8'),
    );
    assert(
      handoffState.schema === 'iot-platform-portable-handoff-v6',
      'Handoff state schema mismatch',
    );
    assert(
      handoffState.continuity.crossSliceImpactAuditRequired === true,
      'Cross-slice impact audit policy missing',
    );
    assert(
      handoffState.validationPolicy.mandatoryRules.fullJestRequired === true,
      'Full Jest handoff policy missing',
    );
    assert(
      handoffState.validationPolicy.mandatoryRules
        .historicalTransitionSafetyRequired === true,
      'Historical transition handoff policy missing',
    );
    assert(
      handoffState.validationPolicy.mandatoryRules
        .exactlyOneFinalNewlineRequired === true,
      'Exactly-one-final-newline handoff policy missing',
    );
    assert(
      handoffState.validationPolicy.mandatoryRules
        .gitWhitespaceBeforeDependencyBootstrapRequired === true,
      'Fail-fast Git whitespace handoff policy missing',
    );
    assert(
      handoffState.continuity.validationOrderOptimizedForTime === true,
      'Time-efficient validation ordering policy missing',
    );
    assert(
      handoffState.packageTrust.draftPackageRule.includes('DRAFT CANDIDATE'),
      'Draft package trust rule missing',
    );
    const sessionProtocol = await readFile(
      resolve(extractedHandoffRoot, '06-SESSION-PROTOCOL.md'),
      'utf8',
    );
    for (const requiredRule of [
      'AUDIT ONLY',
      'DRAFT CANDIDATE',
      'Cross-slice continuity rule',
      'No repository changes made.',
      'exactly one final newline',
      'before dependency bootstrap',
    ]) {
      assert(
        sessionProtocol.includes(requiredRule),
        `Session protocol missing ${requiredRule}`,
      );
    }
    const contextMap = JSON.parse(
      await readFile(
        resolve(extractedHandoffRoot, '08-CONTEXT-MAP.json'),
        'utf8',
      ),
    );
    assert(
      contextMap.entries.some(
        (entry) =>
          entry.sourcePath === 'AI-Development-Kit/agent/REPOSITORY-MEMORY.md',
      ),
      'Repository Memory was not embedded in the handoff context',
    );
    assert(
      contextMap.entries.some(
        (entry) =>
          entry.sourcePath === 'AI-Development-Kit/prompts/MODULE-10.md',
      ),
      'Active module prompt was not embedded in the handoff context',
    );

    const successReport = await readFile(result.reportPath, 'utf8');
    for (const proof of [
      'Workspace cleanup verified: yes',
      'Disposable worktree removed: yes',
      'Workspace lock removed: yes',
      'Remaining owned workspaces: 0',
    ]) {
      assert(successReport.includes(proof), `success report missing ${proof}`);
    }

    const failureBaseSha = await headSha(repository);
    const failurePayload = Buffer.from('alpha\nbeta\ngamma\n', 'utf8');
    const failureManifest = {
      ...manifest,
      id: 'self-test-failure-slice',
      baseSha: failureBaseSha,
      commitSubject: 'test(tooling): prove failure cleanup',
      expectedTrackedFilesBefore: trackedBefore + 1,
      expectedTrackedFilesAfter: trackedBefore + 1,
      allowedChanges: {
        added: [],
        modified: ['sample.txt'],
        deleted: [],
      },
      expectedFileHashes: {
        'sample.txt': sha256Buffer(failurePayload).toString(),
      },
      validationProfile: 'self-test-failure',
      postApplyValidationProfile: undefined,
    };
    delete failureManifest.postApplyValidationProfile;
    const failureArchive = resolve(root, 'failure-package.zip');
    await createStoredZip(failureArchive, [
      {
        name: 'failure.manifest.json',
        data: Buffer.from(
          `${JSON.stringify(failureManifest, null, 2)}\n`,
          'utf8',
        ),
      },
      { name: 'payload/sample.txt', data: failurePayload },
    ]);

    let validationFailure = null;
    try {
      await executePackage({
        repositoryRoot: repository,
        archivePath: failureArchive,
        outputDirectory: resolve(root, 'failure-output'),
        workRoot,
      });
    } catch (error) {
      validationFailure = error;
    }
    assert(validationFailure, 'intentional validation failure was not raised');
    assert(
      validationFailure.result?.exitCode === 9,
      'intentional validation exit code was not preserved',
    );
    assert(
      validationFailure.failureOutputs?.reportPath,
      'intentional validation failure report was not created',
    );
    const failureReport = await readFile(
      validationFailure.failureOutputs.reportPath,
      'utf8',
    );
    for (const proof of [
      'STATUS: STOPPED',
      'Git status: clean',
      'Workspace cleanup verified: yes',
      'Workspace lock removed: yes',
      'Remaining owned workspaces: 0',
      'Artifact status: INVALID',
    ]) {
      assert(failureReport.includes(proof), `failure report missing ${proof}`);
    }
    assert(
      (await headSha(repository)) === failureBaseSha,
      'failed validation changed the main repository HEAD',
    );
    await assertClean(repository);

    const postFailureProbe = await createWorkspace({
      repositoryRoot: repository,
      requestedRoot: workRoot,
      minFreeBytes: 1,
    });
    await cleanupWorkspace(postFailureProbe);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function verifyZipWriter() {
  const root = await createShortFixtureRoot();
  try {
    const output = resolve(root, 'test.zip');
    const extracted = resolve(root, 'extracted');
    await createStoredZip(output, [
      { name: 'folder/hello.txt', data: Buffer.from('hello\n', 'utf8') },
    ]);
    const bytes = await readFile(output);
    assert(bytes.readUInt32LE(0) === 0x04034b50, 'ZIP local header missing');
    assert(bytes.includes(Buffer.from('hello.txt')), 'ZIP entry missing');
    const entries = await extractZip(output, extracted);
    assert(
      entries.length === 1 && entries[0] === 'folder/hello.txt',
      'ZIP extraction inventory mismatch',
    );
    assert(
      (await readFile(resolve(extracted, 'folder', 'hello.txt'), 'utf8')) ===
        'hello\n',
      'ZIP extraction content mismatch',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
