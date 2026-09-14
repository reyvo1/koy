import { runChecked, runNative } from './process.mjs';

const gitConfig = [
  '-c',
  'core.autocrlf=false',
  '-c',
  'core.safecrlf=true',
  '-c',
  'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol',
];

export async function git(repo, args, options = {}) {
  return runChecked('git', [...gitConfig, '-C', repo, ...args], options);
}

export async function gitResult(repo, args, options = {}) {
  return runNative('git', [...gitConfig, '-C', repo, ...args], options);
}

export async function gitText(repo, args, options = {}) {
  const result = await git(repo, args, options);
  return result.stdout.trim();
}

export async function assertGitRepository(repo) {
  const inside = await gitText(repo, ['rev-parse', '--is-inside-work-tree']);
  if (inside !== 'true') {
    throw new Error(`Not a Git worktree: ${repo}`);
  }
}

export async function currentBranch(repo) {
  return gitText(repo, ['branch', '--show-current']);
}

export async function headSha(repo, revision = 'HEAD') {
  return gitText(repo, ['rev-parse', revision]);
}

export async function commitSubject(repo, revision = 'HEAD') {
  return gitText(repo, ['log', '-1', '--pretty=format:%s', revision]);
}

export async function trackedFileCount(repo) {
  const result = await git(repo, ['ls-files', '-z']);
  return result.stdout.length === 0
    ? 0
    : result.stdout.split('\0').filter(Boolean).length;
}

export async function statusEntries(repo) {
  const result = await git(repo, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  return parsePorcelainStatus(result.stdout);
}

export async function assertClean(repo) {
  const entries = await statusEntries(repo);
  if (entries.length > 0) {
    throw new Error(
      `Working tree is not clean:\n${entries
        .map((entry) => `${entry.status}\t${entry.path}`)
        .join('\n')}`,
    );
  }
}

export function parsePorcelainStatus(value) {
  if (value.length === 0) {
    return [];
  }

  const tokens = value.split('\0');
  const entries = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }

    const status = token.slice(0, 2);
    const path = token.slice(3);
    if (status.includes('R') || status.includes('C')) {
      const nextPath = tokens[index + 1];
      if (!nextPath) {
        throw new Error(`Incomplete rename/copy status record: ${token}`);
      }
      entries.push({ status, path: nextPath, sourcePath: path });
      index += 1;
      continue;
    }

    entries.push({ status, path });
  }

  return entries;
}

export async function diffNameStatus(repo, revision = null) {
  const args = ['diff', '--name-status', '-z', '--no-renames'];
  if (revision) {
    args.push(revision);
  }
  const result = await git(repo, args);
  return parseNameStatus(result.stdout);
}

export async function stagedNameStatus(repo) {
  const result = await git(repo, [
    'diff',
    '--cached',
    '--name-status',
    '-z',
    '--no-renames',
  ]);
  return parseNameStatus(result.stdout);
}

export async function commitNameStatus(repo, revision = 'HEAD') {
  const result = await git(repo, [
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    '-z',
    '--no-renames',
    revision,
  ]);
  return parseNameStatus(result.stdout);
}

export function parseNameStatus(value) {
  const tokens = value.split('\0').filter(Boolean);
  if (tokens.length % 2 !== 0) {
    throw new Error('Unexpected Git name-status output length.');
  }

  const entries = [];
  for (let index = 0; index < tokens.length; index += 2) {
    entries.push({ status: tokens[index], path: tokens[index + 1] });
  }
  return entries;
}

export async function addPaths(repo, paths) {
  if (paths.length === 0) {
    throw new Error('No paths were supplied for staging.');
  }
  await git(repo, ['add', '--all', '--', ...paths]);
}

export async function createDetachedWorktree(repo, worktreePath, baseSha) {
  await git(repo, ['worktree', 'add', '--detach', worktreePath, baseSha]);
}

export async function removeWorktree(repo, worktreePath) {
  const result = await gitResult(repo, [
    'worktree',
    'remove',
    '--force',
    worktreePath,
  ]);
  if (result.exitCode === 0) return;

  await gitResult(repo, ['worktree', 'prune']);
  const listed = await gitResult(repo, ['worktree', 'list', '--porcelain']);
  const normalized = worktreePath.replaceAll('\\', '/').toLowerCase();
  const stillRegistered = listed.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith('worktree '))
    .map((line) =>
      line.slice('worktree '.length).replaceAll('\\', '/').toLowerCase(),
    )
    .includes(normalized);

  if (stillRegistered) {
    throw new Error(
      `Failed to remove disposable Git worktree ${worktreePath}: ${
        result.stderr.trim() || result.stdout.trim()
      }`,
    );
  }
}

export async function createCommit(repo, subject) {
  await git(repo, [
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--no-verify',
    '-m',
    subject,
  ]);
  return headSha(repo);
}

export async function fastForward(repo, commitSha) {
  await git(repo, ['merge', '--ff-only', commitSha]);
}

export async function fetchRemote(repo, remoteName = 'origin') {
  await git(repo, ['fetch', '--prune', remoteName]);
}
