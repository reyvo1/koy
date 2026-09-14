import { mkdir, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export class ExecutionLog {
  constructor() {
    this.lines = [];
  }

  line(value = '') {
    this.lines.push(String(value));
  }

  section(title) {
    this.line();
    this.line(`===== ${title} =====`);
  }

  command(result) {
    this.section(result.commandLine);
    if (result.stdout.trim().length > 0) {
      this.line(result.stdout.trimEnd());
    }
    if (result.stderr.trim().length > 0) {
      this.line(result.stderr.trimEnd());
    }
    this.line(`exit=${result.exitCode} durationMs=${result.durationMs}`);
  }

  text() {
    return `${this.lines.join('\n').trimEnd()}\n`;
  }
}

export async function writeExecutionOutputs({
  outputDirectory,
  manifest,
  commitSha,
  parentSha,
  trackedFiles,
  snapshotPath,
  cleanupReport,
  log,
  status,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const shortSha = commitSha.slice(0, 7);
  const reportPath = resolve(
    outputDirectory,
    `iot-platform-${shortSha}-module-runner-report.txt`,
  );
  const logPath = resolve(
    outputDirectory,
    `iot-platform-${shortSha}-${manifest.id}-validation.log`,
  );

  const report = [
    'IoT Platform Module Execution Kit Report',
    '========================================',
    `Manifest: ${manifest.id}`,
    `Title: ${manifest.title}`,
    `Branch: ${manifest.branch}`,
    `HEAD full: ${commitSha}`,
    `Parent commit: ${parentSha}`,
    `Commit subject: ${manifest.commitSubject}`,
    `Tracked file count: ${trackedFiles}`,
    `Validation profile: ${manifest.validationProfile}`,
    `Status: ${status}`,
    `Snapshot: ${basename(snapshotPath)}`,
    'Push performed: no',
    'Production deployment approved: no',
    `Workspace cleanup verified: ${
      cleanupReport?.worktreeRemoved &&
      cleanupReport?.temporaryRootRemoved &&
      cleanupReport?.workspaceLockRemoved &&
      cleanupReport?.remainingOwnedWorkspaces === 0
        ? 'yes'
        : 'no'
    }`,
    `Disposable worktree removed: ${
      cleanupReport?.worktreeRemoved ? 'yes' : 'no'
    }`,
    `Workspace lock removed: ${
      cleanupReport?.workspaceLockRemoved ? 'yes' : 'no'
    }`,
    `Remaining owned workspaces: ${
      cleanupReport?.remainingOwnedWorkspaces ?? 'unavailable'
    }`,
    `Free disk before: ${formatBytes(cleanupReport?.freeBytesBefore)}`,
    `Free disk after: ${formatBytes(cleanupReport?.freeBytesAfter)}`,
    `Recovered disk: ${formatBytes(cleanupReport?.recoveredBytes)}`,
  ].join('\n');

  await writeFile(reportPath, `${report}\n`, 'utf8');
  await writeFile(logPath, log.text(), 'utf8');

  return { reportPath, logPath };
}

export async function writeFailureOutputs({
  outputDirectory,
  manifest,
  baseSha,
  currentSha,
  provenCommit,
  mainFastForwarded,
  cleanupReport,
  cleanupErrors = [],
  repositoryBranch,
  repositoryStatus,
  error,
  log,
}) {
  await mkdir(outputDirectory, { recursive: true });
  const prefix = `iot-platform-${manifest.id}-failure`;
  const reportPath = resolve(outputDirectory, `${prefix}-report.txt`);
  const logPath = resolve(outputDirectory, `${prefix}-validation.log`);
  const exactCommand = error?.result?.commandLine ?? 'not a native command';

  const report = [
    'IoT Platform Module Execution Kit Failure Report',
    '================================================',
    'STATUS: STOPPED',
    `Manifest: ${manifest.id}`,
    `Title: ${manifest.title}`,
    `Base SHA: ${baseSha}`,
    `First proven failure: ${error?.message ?? 'unavailable'}`,
    `Exact command: ${exactCommand}`,
    'Exact error:',
    failureDetail(error),
    `Current branch: ${repositoryBranch ?? 'unavailable'}`,
    `Current main SHA: ${currentSha ?? 'unavailable'}`,
    `Git status: ${formatRepositoryStatus(repositoryStatus)}`,
    `Proven commit: ${provenCommit ?? 'not created'}`,
    `Main fast-forwarded: ${mainFastForwarded ? 'yes' : 'no'}`,
    `Repository impact: ${
      mainFastForwarded
        ? 'main contains the already-proven commit; no automatic rollback was attempted'
        : 'main repository was not modified by the failed proof'
    }`,
    `Safe checkpoint: ${
      mainFastForwarded
        ? currentSha ?? provenCommit ?? 'unavailable'
        : baseSha
    }`,
    `Workspace cleanup verified: ${
      cleanupReport?.temporaryRootRemoved &&
      cleanupReport?.workspaceLockRemoved &&
      cleanupErrors.length === 0
        ? 'yes'
        : 'no'
    }`,
    `Workspace lock removed: ${
      cleanupReport?.workspaceLockRemoved ? 'yes' : 'no'
    }`,
    `Remaining owned workspaces: ${
      cleanupReport?.remainingOwnedWorkspaces ?? 'unavailable'
    }`,
    `Free disk before: ${formatBytes(cleanupReport?.freeBytesBefore)}`,
    `Free disk after: ${formatBytes(cleanupReport?.freeBytesAfter)}`,
    `Recovered disk: ${formatBytes(cleanupReport?.recoveredBytes)}`,
    `Cleanup errors: ${cleanupErrors.length}`,
    'Artifact status: INVALID',
    `Actions not performed: ${actionsNotPerformed({
      provenCommit,
      mainFastForwarded,
    })}`,
    'Required next decision: owner review of the exact first failure',
    'Push performed: no',
  ].join('\n');

  await writeFile(reportPath, `${report}\n`, 'utf8');
  await writeFile(logPath, log.text(), 'utf8');
  return { reportPath, logPath };
}

function formatRepositoryStatus(status) {
  if (!Array.isArray(status)) return 'unavailable';
  if (status.length === 0) return 'clean';
  return status
    .map((entry) => `${entry.status} ${entry.path}`)
    .join('; ');
}

function actionsNotPerformed({ provenCommit, mainFastForwarded }) {
  const actions = [];
  if (!provenCommit) actions.push('local commit');
  if (!mainFastForwarded) actions.push('main fast-forward');
  actions.push('push', 'completion', 'activation', 'deployment');
  return actions.join(', ');
}

function failureDetail(error) {
  const output = error?.result?.stderr?.trim() || error?.result?.stdout?.trim();
  if (!output) return error?.stack ?? error?.message ?? 'unavailable';
  const limit = 4_000;
  if (output.length <= limit) return output;
  return `${output.slice(0, limit)}\n[truncated; full output is in the validation log]`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unavailable';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}
