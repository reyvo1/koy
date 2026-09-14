#!/usr/bin/env node
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { optionalString, parseArguments } from './lib/arguments.mjs';
import {
  assertClean,
  assertGitRepository,
  git,
  gitText,
  removeWorktree,
} from './lib/git.mjs';
import {
  availableDiskBytes,
  cleanupStaleWorkspaceLock,
  formatBytes,
  isProcessAlive,
  listOwnedWorkspaces,
} from './lib/workspace.mjs';

const DEFAULT_MIN_AGE_MINUTES = 60;

export async function cleanupOwnedWorkspaces({
  repositoryRoot,
  workRoot,
  minAgeMinutes = DEFAULT_MIN_AGE_MINUTES,
  allOwned = false,
  includeLegacyWorktrees = false,
}) {
  const repo = resolve(repositoryRoot);
  const root = resolve(workRoot ?? resolve(tmpdir(), 'iw'));
  await assertGitRepository(repo);
  await assertClean(repo);
  await mkdir(root, { recursive: true });

  const freeBytesBefore = await availableDiskBytes(root);
  const registered = await registeredWorktrees(repo);
  const now = Date.now();
  const removed = [];
  const removedLegacy = [];
  const skipped = [];

  for (const workspace of await listOwnedWorkspaces(root)) {
    if (resolve(workspace.repositoryRoot) !== repo) {
      skipped.push(`${workspace.temporaryRoot}: different repository owner`);
      continue;
    }
    const ageMs = now - workspace.modifiedAtMs;
    if (!allOwned && ageMs < minAgeMinutes * 60_000) {
      skipped.push(
        `${workspace.temporaryRoot}: younger than cleanup threshold`,
      );
      continue;
    }
    if (isProcessAlive(workspace.pid)) {
      skipped.push(
        `${workspace.temporaryRoot}: owner process ${workspace.pid} is alive`,
      );
      continue;
    }

    if (registered.has(normalizePath(workspace.worktree))) {
      await removeWorktree(repo, workspace.worktree);
    }
    await cleanupWorkspaceWithoutCurrentLock(workspace);
    removed.push(workspace.temporaryRoot);
  }

  if (includeLegacyWorktrees) {
    const legacy = await listLegacyWorkspaces({
      repo,
      root,
      now,
      minAgeMinutes,
      allOwned,
    });
    for (const workspace of legacy) {
      if (registered.has(normalizePath(workspace.worktree))) {
        await removeWorktree(repo, workspace.worktree);
      } else {
        await git(repo, ['worktree', 'prune']);
      }
      await rm(workspace.temporaryRoot, { recursive: true, force: true });
      if (await pathExists(workspace.temporaryRoot)) {
        throw new Error(
          `Legacy workspace still exists after cleanup: ${workspace.temporaryRoot}`,
        );
      }
      removedLegacy.push(workspace.temporaryRoot);
    }
  }

  await git(repo, ['worktree', 'prune']);
  const lockResult = await cleanupStaleWorkspaceLock(root, repo);
  if (!lockResult.removed && lockResult.reason !== 'absent') {
    skipped.push(`workspace lock: ${lockResult.reason}`);
  }

  const remainingOwned = (await listOwnedWorkspaces(root)).filter(
    (workspace) => resolve(workspace.repositoryRoot) === repo,
  );
  const remainingRegistered = [...(await registeredWorktrees(repo))].filter(
    (path) => path.startsWith(`${normalizePath(root)}/m-`),
  );

  if (allOwned && remainingOwned.length > 0) {
    throw new Error(
      `Owned workspaces remain after cleanup: ${remainingOwned
        .map((workspace) => workspace.temporaryRoot)
        .join(', ')}`,
    );
  }
  if (allOwned && includeLegacyWorktrees && remainingRegistered.length > 0) {
    throw new Error(
      `Registered legacy worktrees remain after cleanup: ${remainingRegistered.join(
        ', ',
      )}`,
    );
  }

  return {
    root,
    removed,
    removedLegacy,
    skipped,
    remainingOwned: remainingOwned.length,
    remainingRegistered: remainingRegistered.length,
    freeBytesBefore,
    freeBytesAfter: await availableDiskBytes(root),
  };
}

async function cleanupWorkspaceWithoutCurrentLock(workspace) {
  const temporaryRoot = resolve(workspace.temporaryRoot);
  const root = resolve(workspace.root);
  const sameParent =
    process.platform === 'win32'
      ? dirname(temporaryRoot).toLowerCase() === root.toLowerCase()
      : dirname(temporaryRoot) === root;
  if (!sameParent || !basename(temporaryRoot).startsWith('m-')) {
    throw new Error(`Refusing to clean unbounded workspace: ${temporaryRoot}`);
  }
  await rm(temporaryRoot, { recursive: true, force: true });
  if (await pathExists(temporaryRoot)) {
    throw new Error(`Owned workspace still exists after cleanup: ${temporaryRoot}`);
  }
}

async function listLegacyWorkspaces({
  repo,
  root,
  now,
  minAgeMinutes,
  allOwned,
}) {
  const entries = await readdir(root, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const commonDirValue = await gitText(repo, ['rev-parse', '--git-common-dir']);
  const commonDir = normalizePath(
    resolve(
      commonDirValue.startsWith('.')
        ? resolve(repo, commonDirValue)
        : commonDirValue,
    ),
  );
  const legacy = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('m-')) continue;
    const temporaryRoot = resolve(root, entry.name);
    if (
      await pathExists(
        resolve(
          temporaryRoot,
          '.iot-platform-module-runner-workspace.json',
        ),
      )
    ) {
      continue;
    }
    const worktree = resolve(temporaryRoot, 'w');
    const gitFile = resolve(worktree, '.git');
    if (!(await pathExists(gitFile))) continue;

    let gitPointer;
    try {
      gitPointer = (await readFile(gitFile, 'utf8')).trim();
    } catch {
      continue;
    }
    if (!gitPointer.startsWith('gitdir: ')) continue;
    const gitDirValue = gitPointer.slice('gitdir: '.length);
    const gitDir = normalizePath(
      resolve(gitDirValue.startsWith('.') ? resolve(worktree, gitDirValue) : gitDirValue),
    );
    if (!gitDir.startsWith(`${commonDir}/worktrees/`)) continue;

    const metadata = await stat(temporaryRoot);
    const ageMs = now - metadata.mtimeMs;
    if (!allOwned && ageMs < minAgeMinutes * 60_000) continue;
    legacy.push({ temporaryRoot, worktree });
  }
  return legacy;
}

async function registeredWorktrees(repo) {
  const output = await gitText(repo, ['worktree', 'list', '--porcelain']);
  return new Set(
    output
      .split(/\r?\n/)
      .filter((line) => line.startsWith('worktree '))
      .map((line) => normalizePath(line.slice('worktree '.length))),
  );
}

function normalizePath(value) {
  return resolve(value).replaceAll('\\', '/').toLowerCase();
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function main() {
  const { options } = parseArguments(process.argv.slice(2));
  const minAgeValue = optionalString(
    options,
    'min-age-minutes',
    String(DEFAULT_MIN_AGE_MINUTES),
  );
  const minAgeMinutes = Number(minAgeValue);
  if (!Number.isFinite(minAgeMinutes) || minAgeMinutes < 0) {
    throw new Error('--min-age-minutes must be a non-negative number.');
  }
  const includeLegacyWorktrees =
    options.get('include-legacy-worktrees') === true;
  if (includeLegacyWorktrees && !optionalString(options, 'work-root')) {
    throw new Error(
      '--include-legacy-worktrees requires an explicit --work-root.',
    );
  }

  const result = await cleanupOwnedWorkspaces({
    repositoryRoot: optionalString(options, 'repo', process.cwd()),
    workRoot: optionalString(options, 'work-root'),
    minAgeMinutes,
    allOwned: options.get('all-owned') === true,
    includeLegacyWorktrees,
  });

  console.log('MODULE RUNNER WORKSPACE CLEANUP PASSED');
  console.log(`Root: ${result.root}`);
  console.log(`Removed owned: ${result.removed.length}`);
  console.log(`Removed legacy: ${result.removedLegacy.length}`);
  console.log(`Skipped: ${result.skipped.length}`);
  console.log(`Remaining owned: ${result.remainingOwned}`);
  console.log(`Remaining registered: ${result.remainingRegistered}`);
  console.log(`Free disk before: ${formatBytes(result.freeBytesBefore)}`);
  console.log(`Free disk after: ${formatBytes(result.freeBytesAfter)}`);
  for (const path of result.removed) console.log(`REMOVED OWNED ${path}`);
  for (const path of result.removedLegacy) console.log(`REMOVED LEGACY ${path}`);
  for (const reason of result.skipped) console.log(`SKIPPED ${reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('STATUS: STOPPED');
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
