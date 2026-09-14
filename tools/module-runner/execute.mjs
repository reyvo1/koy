#!/usr/bin/env node
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import {
  parseArguments,
  optionalString,
  requireOption,
} from './lib/arguments.mjs';
import { verifyAllowedChanges } from './lib/change-policy.mjs';
import {
  addPaths,
  assertClean,
  commitNameStatus,
  commitSubject,
  createCommit,
  createDetachedWorktree,
  currentBranch,
  fastForward,
  fetchRemote,
  git,
  headSha,
  removeWorktree,
  stagedNameStatus,
  statusEntries,
  trackedFileCount,
} from './lib/git.mjs';
import {
  captureTextStyles,
  verifyChangedTextFiles,
  verifyPayloadTextFiles,
} from './lib/file-policy.mjs';
import { sha256File, verifyExpectedFileHashes } from './lib/hash.mjs';
import { createPortableHandoff } from './lib/handoff-core.mjs';
import {
  expectedChanges,
  loadManifest,
  loadValidationProfiles,
  resolvePayloadPath,
} from './lib/manifest.mjs';
import {
  ExecutionLog,
  writeExecutionOutputs,
  writeFailureOutputs,
} from './lib/report.mjs';
import { runDoctor } from './doctor.mjs';
import { runValidationProfile } from './lib/validation.mjs';
import { cleanupWorkspace, createWorkspace } from './lib/workspace.mjs';

export async function executeSlice({
  repositoryRoot,
  manifestPath,
  payloadPath: cliPayloadPath,
  outputDirectory,
  proveOnly = false,
  keepWorktree = false,
  workRoot = null,
  workspace: providedWorkspace = null,
}) {
  const repo = resolve(repositoryRoot);
  const manifestInfo = await loadManifest(manifestPath);
  const manifest = manifestInfo.manifest;
  const payloadPath = resolvePayloadPath(manifestInfo, cliPayloadPath);
  const output = resolve(outputDirectory ?? dirname(repo));
  const log = new ExecutionLog();
  const logCommand = (result) => log.command(result);

  if (proveOnly && !keepWorktree) {
    throw new Error(
      '--prove-only requires --keep-worktree so the proven commit remains reachable.',
    );
  }

  let workspace = providedWorkspace;
  let worktreeCreated = false;
  let provenCommit = null;
  let mainFastForwarded = false;
  let primaryError = null;
  let cleanupReport = null;
  let worktreeRemoved = true;
  const cleanupErrors = [];
  let snapshotPath = null;

  try {
    log.section('Dependency-free payload proof');
    await verifyPayloadAssets(payloadPath, manifest);
    await verifyPayloadTextFiles(payloadPath, expectedChanges(manifest));
    log.line(
      'Payload inventory, hashes, UTF-8, line endings, trailing whitespace, and exactly-one-final-newline checks passed.',
    );

    log.section('Environment doctor');
    const doctor = await runDoctor({
      repositoryRoot: repo,
      manifestPath: manifestInfo.path,
      fetch: true,
      workRoot: workspace?.root ?? workRoot,
    });
    log.line(JSON.stringify(doctor, null, 2));

    if (!workspace) {
      workspace = await createWorkspace({
        repositoryRoot: repo,
        requestedRoot: workRoot,
      });
    } else if (resolve(workspace.repositoryRoot) !== repo) {
      throw new Error(
        `Provided workspace repository mismatch. Expected ${repo}, actual ${workspace.repositoryRoot}.`,
      );
    }

    const worktree = workspace.worktree;
    log.section('Workspace policy');
    log.line(`Workspace root: ${workspace.root}`);
    log.line(`Disposable worktree: ${worktree}`);
    log.line(
      `Projected generated path length: ${workspace.projectedPathLength}`,
    );
    log.line(
      `Free disk before: ${formatWorkspaceBytes(workspace.freeBytesBefore)}`,
    );
    if (workspace.safePathLimit) {
      log.line(`Windows safe path budget: ${workspace.safePathLimit}`);
    }

    log.section('Disposable Git worktree');
    await createDetachedWorktree(repo, worktree, manifest.baseSha);
    worktreeCreated = true;
    worktreeRemoved = false;
    log.line(`Created detached worktree: ${worktree}`);

    const expected = expectedChanges(manifest);
    const textStyles = await captureTextStyles(worktree, expected);

    await materializePayload(payloadPath, worktree, manifest);

    const workingChanges = mapWorkingTreeChanges(await statusEntries(worktree));
    const verifiedWorkingChanges = verifyAllowedChanges(
      manifest,
      workingChanges,
      'Post-apply working tree',
    );

    await verifyChangedTextFiles(worktree, verifiedWorkingChanges, textStyles);
    await verifyExpectedFileHashes(
      worktree,
      verifiedWorkingChanges,
      manifest.expectedFileHashes,
    );

    const allPaths = expectedChanges(manifest).map((change) => change.path);
    await addPaths(worktree, allPaths);
    const staged = await stagedNameStatus(worktree);
    const verifiedStaged = verifyAllowedChanges(
      manifest,
      staged,
      'Staged disposable-worktree change set',
    );

    const trackedAfterStage = await trackedFileCount(worktree);
    if (trackedAfterStage !== manifest.expectedTrackedFilesAfter) {
      throw new Error(
        `Tracked-file count after staging mismatch. Expected ${manifest.expectedTrackedFilesAfter}, actual ${trackedAfterStage}.`,
      );
    }

    log.section('Fail-fast staged Git whitespace proof');
    await git(worktree, ['diff', '--cached', '--check'], { log: logCommand });
    log.line(
      'Staged Git whitespace proof passed before dependency bootstrap and long-running validation.',
    );

    const profiles = await loadValidationProfiles(worktree);
    log.section(`Validation profile: ${manifest.validationProfile}`);
    await runValidationProfile({
      repositoryRoot: worktree,
      profileName: manifest.validationProfile,
      profiles,
      changedPaths: verifiedStaged
        .filter((change) => change.status !== 'D')
        .map((change) => change.path),
      log: logCommand,
    });

    await verifyChangedTextFiles(worktree, verifiedStaged, textStyles);
    await verifyExpectedFileHashes(
      worktree,
      verifiedStaged,
      manifest.expectedFileHashes,
    );
    const postValidationStatus = mapWorkingTreeChanges(
      await statusEntries(worktree),
    );
    verifyAllowedChanges(
      manifest,
      postValidationStatus,
      'Post-validation working tree',
    );
    await git(worktree, ['diff', '--exit-code', '--', ...allPaths], {
      log: logCommand,
    });
    await git(worktree, ['diff', '--cached', '--check'], { log: logCommand });

    provenCommit = await createCommit(worktree, manifest.commitSubject);
    const provenParent = await headSha(worktree, 'HEAD^');
    if (provenParent !== manifest.baseSha) {
      throw new Error(
        `Proven commit parent mismatch. Expected ${manifest.baseSha}, actual ${provenParent}.`,
      );
    }
    if ((await commitSubject(worktree)) !== manifest.commitSubject) {
      throw new Error('Proven commit subject mismatch.');
    }
    verifyAllowedChanges(
      manifest,
      await commitNameStatus(worktree),
      'Proven commit',
    );
    await assertClean(worktree);

    log.section('Proof result');
    log.line(`PROVEN COMMIT: ${provenCommit}`);
    log.line('Disposable worktree is clean.');

    if (proveOnly) {
      return {
        status: 'proved-only',
        provenCommit,
        worktree,
        log,
      };
    }

    log.section('Fast-forward exact proven commit into main worktree');
    await assertClean(repo);
    if ((await currentBranch(repo)) !== manifest.branch) {
      throw new Error(`Main worktree is no longer on ${manifest.branch}.`);
    }
    if ((await headSha(repo)) !== manifest.baseSha) {
      throw new Error('Main worktree HEAD changed after proof.');
    }

    if (manifest.remote) {
      await fetchRemote(repo, manifest.remote.name);
      const remoteSha = await headSha(
        repo,
        `${manifest.remote.name}/${manifest.remote.branch}`,
      );
      if (remoteSha !== manifest.baseSha) {
        throw new Error(
          `Remote changed after proof. Expected ${manifest.baseSha}, actual ${remoteSha}.`,
        );
      }
    }

    await fastForward(repo, provenCommit);
    mainFastForwarded = true;
    if ((await headSha(repo)) !== provenCommit) {
      throw new Error(
        'Main worktree did not fast-forward to the proven commit.',
      );
    }
    verifyAllowedChanges(
      manifest,
      await commitNameStatus(repo),
      'Main worktree commit',
    );
    if ((await trackedFileCount(repo)) !== manifest.expectedTrackedFilesAfter) {
      throw new Error(
        'Main worktree tracked-file count is incorrect after fast-forward.',
      );
    }
    await assertClean(repo);
    await verifyExpectedFileHashes(
      repo,
      expectedChanges(manifest),
      manifest.expectedFileHashes,
    );

    log.section('Post-fast-forward verification');
    const postApplyProfiles = await loadValidationProfiles(repo);
    const smokeProfile = manifest.postApplyValidationProfile;
    if (smokeProfile) {
      await runValidationProfile({
        repositoryRoot: repo,
        profileName: smokeProfile,
        profiles: postApplyProfiles,
        changedPaths: expectedChanges(manifest)
          .filter((change) => change.status !== 'D')
          .map((change) => change.path),
        log: logCommand,
      });
    }

    await mkdir(output, { recursive: true });
    snapshotPath = resolve(
      output,
      `iot-platform-${provenCommit.slice(0, 7)}-full-tracked.zip`,
    );
    await git(
      repo,
      ['archive', '--format=zip', `--output=${snapshotPath}`, 'HEAD'],
      { log: logCommand },
    );
  } catch (error) {
    primaryError = error;
    log.section('FAILURE');
    log.line(error.stack ?? error.message);
  } finally {
    if (workspace && !keepWorktree) {
      if (worktreeCreated) {
        try {
          await removeWorktree(repo, workspace.worktree);
          worktreeRemoved = true;
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      try {
        cleanupReport = {
          ...(await cleanupWorkspace(workspace)),
          worktreeRemoved,
        };
      } catch (error) {
        cleanupErrors.push(error);
      }

      log.section('Workspace cleanup');
      if (cleanupReport) {
        log.line(
          `Disposable worktree removed: ${cleanupReport.worktreeRemoved ? 'yes' : 'no'}`,
        );
        log.line(
          `Temporary root removed: ${cleanupReport.temporaryRootRemoved ? 'yes' : 'no'}`,
        );
        log.line(
          `Workspace lock removed: ${cleanupReport.workspaceLockRemoved ? 'yes' : 'no'}`,
        );
        log.line(
          `Remaining owned workspaces: ${cleanupReport.remainingOwnedWorkspaces}`,
        );
        log.line(
          `Free disk before: ${formatWorkspaceBytes(cleanupReport.freeBytesBefore)}`,
        );
        log.line(
          `Free disk after: ${formatWorkspaceBytes(cleanupReport.freeBytesAfter)}`,
        );
        log.line(
          `Recovered disk: ${formatWorkspaceBytes(cleanupReport.recoveredBytes)}`,
        );
      }
      for (const error of cleanupErrors) {
        log.line(`CLEANUP ERROR: ${error.message}`);
      }

      if (cleanupErrors.length > 0) {
        if (primaryError) {
          primaryError.cleanupErrors = cleanupErrors;
        } else {
          primaryError = new AggregateError(
            cleanupErrors,
            'Disposable workspace cleanup failed.',
          );
        }
      }
    }
  }

  if (primaryError) {
    const failureOutputs = await writeFailureOutputs({
      outputDirectory: output,
      manifest,
      baseSha: manifest.baseSha,
      currentSha: await headSha(repo).catch(() => null),
      provenCommit,
      mainFastForwarded,
      cleanupReport,
      cleanupErrors,
      repositoryBranch: await currentBranch(repo).catch(() => null),
      repositoryStatus: await statusEntries(repo).catch(() => null),
      error: primaryError,
      log,
    }).catch(() => null);
    if (failureOutputs) {
      primaryError.failureOutputs = failureOutputs;
    }
    throw primaryError;
  }

  try {
    const outputs = await writeExecutionOutputs({
      outputDirectory: output,
      manifest,
      commitSha: provenCommit,
      parentSha: manifest.baseSha,
      trackedFiles: manifest.expectedTrackedFilesAfter,
      snapshotPath,
      cleanupReport,
      log,
      status: 'LOCAL COMMIT VERIFIED',
    });

    const handoff = await createPortableHandoff({
      repositoryRoot: repo,
      outputDirectory: output,
      status: 'local-unpushed',
      reportPath: outputs.reportPath,
      validationLogPath: outputs.logPath,
      localProofVerified: true,
      notes: [
        `Manifest ${manifest.id} was proved in one disposable workspace.`,
        `Main branch fast-forwarded to exact proven commit ${provenCommit}.`,
        'Workspace cleanup was verified before handoff creation.',
        'Push was not performed.',
      ],
    });

    return {
      status: 'local-commit-verified',
      provenCommit,
      snapshotPath,
      cleanupReport,
      ...outputs,
      ...handoff,
    };
  } catch (error) {
    log.section('FAILURE');
    log.line(error.stack ?? error.message);
    const failureOutputs = await writeFailureOutputs({
      outputDirectory: output,
      manifest,
      baseSha: manifest.baseSha,
      currentSha: await headSha(repo).catch(() => null),
      provenCommit,
      mainFastForwarded,
      cleanupReport,
      cleanupErrors,
      repositoryBranch: await currentBranch(repo).catch(() => null),
      repositoryStatus: await statusEntries(repo).catch(() => null),
      error,
      log,
    }).catch(() => null);
    if (failureOutputs) error.failureOutputs = failureOutputs;
    throw error;
  }
}

function formatWorkspaceBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unavailable';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

async function verifyPayloadAssets(payloadRoot, manifest) {
  const expected = expectedChanges(manifest)
    .filter((change) => change.status !== 'D')
    .map((change) => change.path)
    .sort();
  const actual = await listPayloadFiles(payloadRoot);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Payload inventory mismatch. Expected ${expected.join(', ')}, actual ${actual.join(', ')}.`,
    );
  }

  for (const path of expected) {
    const absolutePath = resolve(payloadRoot, path);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Payload entry must be a regular file: ${path}`);
    }
    const actualHash = await sha256File(absolutePath);
    const expectedHash = manifest.expectedFileHashes[path];
    if (actualHash !== expectedHash) {
      throw new Error(
        `Payload SHA-256 mismatch for ${path}. Expected ${expectedHash}, actual ${actualHash}.`,
      );
    }
  }
}

async function listPayloadFiles(payloadRoot, directory = payloadRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Payload symlink is not allowed: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listPayloadFiles(payloadRoot, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Unsupported payload entry: ${absolutePath}`);
    }
    files.push(relative(payloadRoot, absolutePath).split(sep).join('/'));
  }

  return files.sort();
}

async function materializePayload(payloadRoot, worktree, manifest) {
  for (const change of expectedChanges(manifest)) {
    const targetPath = resolve(worktree, change.path);
    if (change.status === 'D') {
      await rm(targetPath, { recursive: true, force: true });
      continue;
    }

    const sourcePath = resolve(payloadRoot, change.path);
    const bytes = await readFile(sourcePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bytes);
  }
}

function mapWorkingTreeChanges(entries) {
  return entries.map((entry) => {
    if (entry.status === '??') {
      return { status: 'A', path: entry.path };
    }
    if (entry.status.includes('D')) {
      return { status: 'D', path: entry.path };
    }
    if (entry.status.includes('A')) {
      return { status: 'A', path: entry.path };
    }
    if (entry.status.includes('M')) {
      return { status: 'M', path: entry.path };
    }
    throw new Error(
      `Unsupported working-tree status ${entry.status} for ${entry.path}.`,
    );
  });
}

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const repositoryRoot = optionalString(options, 'repo', process.cwd());
  const manifestPath = requireOption(options, 'manifest');
  const payloadPath = optionalString(options, 'payload');
  const outputDirectory = optionalString(options, 'output');
  const workRoot = optionalString(options, 'work-root');

  const result = await executeSlice({
    repositoryRoot,
    manifestPath,
    payloadPath,
    outputDirectory,
    proveOnly: options.get('prove-only') === true,
    keepWorktree: options.get('keep-worktree') === true,
    workRoot,
  });

  console.log();
  if (result.status === 'proved-only') {
    console.log('PROOF PASSED');
    console.log(`Proven commit: ${result.provenCommit}`);
    console.log(`Worktree: ${result.worktree}`);
    return;
  }

  console.log('LOCAL COMMIT VERIFIED');
  console.log(`HEAD: ${result.provenCommit}`);
  console.log(`Snapshot: ${result.snapshotPath}`);
  console.log(`Report: ${result.reportPath}`);
  console.log(`Validation log: ${result.logPath}`);
  console.log(`Handoff: ${result.handoffPath}`);
  console.log(`Handoff SHA: ${result.shaPath}`);
  console.log('Push performed: no');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.result && !error.result.streamed) {
      if (error.result.stdout) console.error(error.result.stdout);
      if (error.result.stderr) console.error(error.result.stderr);
    }
    if (error.failureOutputs) {
      console.error(`Failure report: ${error.failureOutputs.reportPath}`);
      console.error(`Failure log: ${error.failureOutputs.logPath}`);
    }
    process.exitCode = 1;
  });
}
