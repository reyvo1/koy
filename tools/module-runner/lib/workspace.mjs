import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve, win32 } from 'node:path';
import process from 'node:process';

export const WINDOWS_SAFE_PATH_LIMIT = 240;
const GENERATED_SUFFIX_BUDGET = 185;
const WORKSPACE_MARKER = '.iot-platform-module-runner-workspace.json';
const WORKSPACE_MARKER_VERSION = 1;
const WORKSPACE_LOCK_MARKER = 'owner.json';
const DEFAULT_MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024;

export async function selectWorkspaceRoot({
  repositoryRoot,
  requestedRoot,
  env = process.env,
  platform = process.platform,
} = {}) {
  const repo = resolve(repositoryRoot ?? process.cwd());
  const candidates = workspaceCandidates({ requestedRoot });
  const failures = [];

  for (const candidate of candidates) {
    try {
      await verifyWritableDirectory(candidate);
      const projectedLength = projectedWorktreePathLength(candidate, platform);
      if (platform === 'win32' && projectedLength > WINDOWS_SAFE_PATH_LIMIT) {
        failures.push(
          `${candidate}: projected path length ${projectedLength} exceeds ${
            WINDOWS_SAFE_PATH_LIMIT
          }`,
        );
        continue;
      }
      return {
        root: candidate,
        repositoryRoot: repo,
        projectedPathLength: projectedLength,
        safePathLimit: platform === 'win32' ? WINDOWS_SAFE_PATH_LIMIT : null,
      };
    } catch (error) {
      failures.push(`${candidate}: ${error.message}`);
    }
  }

  throw new Error(
    `No safe writable module-runner work root was found. ${failures.join('; ')}`,
  );
}

export async function createWorkspace({
  repositoryRoot,
  requestedRoot,
  env = process.env,
  platform = process.platform,
  minFreeBytes = minimumFreeBytes(env),
} = {}) {
  const selected = await selectWorkspaceRoot({
    repositoryRoot,
    requestedRoot,
    env,
    platform,
  });
  const freeBytesBefore = await availableDiskBytes(selected.root);
  if (freeBytesBefore < minFreeBytes) {
    throw new Error(
      `Insufficient free disk space for a disposable module-runner workspace. ` +
        `Required at least ${formatBytes(minFreeBytes)}, available ${formatBytes(
          freeBytesBefore,
        )} at ${selected.root}.`,
    );
  }

  const lock = await acquireWorkspaceLock(
    selected.root,
    selected.repositoryRoot,
  );
  let temporaryRoot = null;
  try {
    const existing = (await listOwnedWorkspaces(selected.root)).filter(
      (workspace) =>
        resolve(workspace.repositoryRoot) === selected.repositoryRoot,
    );
    if (existing.length > 0) {
      throw new Error(
        `Existing module-runner workspace found for this repository: ${existing
          .map((workspace) => workspace.temporaryRoot)
          .join(', ')}. Run the official module:cleanup command before retrying.`,
      );
    }

    temporaryRoot = await mkdtemp(resolve(selected.root, 'm-'));
    const worktree = resolve(temporaryRoot, 'w');
    const markerPath = resolve(temporaryRoot, WORKSPACE_MARKER);
    const marker = {
      version: WORKSPACE_MARKER_VERSION,
      owner: 'iot-platform-module-runner',
      repositoryRoot: selected.repositoryRoot,
      temporaryRoot,
      pid: process.pid,
      createdAt: new Date().toISOString(),
    };
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    return {
      ...selected,
      temporaryRoot,
      worktree,
      markerPath,
      lockPath: lock.path,
      lockMarkerPath: lock.markerPath,
      freeBytesBefore,
      minFreeBytes,
    };
  } catch (error) {
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    await releaseWorkspaceLock(lock, selected.repositoryRoot).catch(
      () => undefined,
    );
    throw error;
  }
}

export async function cleanupWorkspace(workspace) {
  const temporaryRoot = resolve(workspace.temporaryRoot);
  const root = resolve(workspace.root);
  if (
    dirname(temporaryRoot) !== root ||
    !basename(temporaryRoot).startsWith('m-')
  ) {
    throw new Error(`Refusing to clean unbounded workspace: ${temporaryRoot}`);
  }

  const marker = await readWorkspaceMarker(temporaryRoot);
  if (
    marker.owner !== 'iot-platform-module-runner' ||
    marker.version !== WORKSPACE_MARKER_VERSION ||
    resolve(marker.temporaryRoot) !== temporaryRoot ||
    resolve(marker.repositoryRoot) !== resolve(workspace.repositoryRoot)
  ) {
    throw new Error(`Workspace ownership marker mismatch: ${temporaryRoot}`);
  }

  await rm(temporaryRoot, { recursive: true, force: true });
  if (await pathExists(temporaryRoot)) {
    throw new Error(`Owned workspace still exists after cleanup: ${temporaryRoot}`);
  }

  await releaseWorkspaceLock(
    {
      path: workspace.lockPath,
      markerPath: workspace.lockMarkerPath,
    },
    workspace.repositoryRoot,
  );

  const remaining = (await listOwnedWorkspaces(root)).filter(
    (candidate) =>
      resolve(candidate.repositoryRoot) === resolve(workspace.repositoryRoot),
  );
  if (remaining.length > 0) {
    throw new Error(
      `Owned workspaces remain after cleanup: ${remaining
        .map((candidate) => candidate.temporaryRoot)
        .join(', ')}`,
    );
  }

  const freeBytesAfter = await availableDiskBytes(root);
  const freeBytesBefore = workspace.freeBytesBefore ?? null;
  return {
    root,
    temporaryRoot,
    temporaryRootRemoved: true,
    workspaceLockRemoved: !(await pathExists(workspace.lockPath)),
    remainingOwnedWorkspaces: 0,
    freeBytesBefore,
    freeBytesAfter,
    recoveredBytes:
      Number.isFinite(freeBytesBefore) && Number.isFinite(freeBytesAfter)
        ? Math.max(0, freeBytesAfter - freeBytesBefore)
        : null,
  };
}

export async function listOwnedWorkspaces(root) {
  const resolvedRoot = resolve(root);
  let entries;
  try {
    entries = await readdir(resolvedRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const workspaces = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('m-')) continue;
    const temporaryRoot = resolve(resolvedRoot, entry.name);
    try {
      const marker = await readWorkspaceMarker(temporaryRoot);
      const metadata = await stat(temporaryRoot);
      if (
        marker.owner === 'iot-platform-module-runner' &&
        marker.version === WORKSPACE_MARKER_VERSION &&
        resolve(marker.temporaryRoot) === temporaryRoot
      ) {
        workspaces.push({
          root: resolvedRoot,
          temporaryRoot,
          worktree: resolve(temporaryRoot, 'w'),
          repositoryRoot: resolve(marker.repositoryRoot),
          pid: marker.pid,
          createdAt: marker.createdAt,
          modifiedAtMs: metadata.mtimeMs,
        });
      }
    } catch {
      // Unmarked folders are never implicitly owned or removed.
    }
  }
  return workspaces.sort(
    (left, right) => left.modifiedAtMs - right.modifiedAtMs,
  );
}

export async function cleanupStaleWorkspaceLock(_root, repositoryRoot) {
  const lock = workspaceLock(repositoryRoot);
  if (!(await pathExists(lock.path))) return { removed: false, reason: 'absent' };
  const marker = await readLockMarker(lock.markerPath);
  validateLockMarker(marker, repositoryRoot, lock.path);
  if (isProcessAlive(marker.pid)) {
    return {
      removed: false,
      reason: `owner process ${marker.pid} is alive`,
    };
  }
  await rm(lock.path, { recursive: true, force: true });
  return { removed: true, reason: 'stale lock removed' };
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function projectedWorktreePathLength(
  root,
  platform = process.platform,
) {
  const resolvePath = platform === 'win32' ? win32.resolve : resolve;
  return resolvePath(root, 'm-123456', 'w').length + GENERATED_SUFFIX_BUDGET;
}

export async function availableDiskBytes(root) {
  const values = await statfs(root, { bigint: true });
  return Number(values.bavail * values.bsize);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unavailable';
  const gib = bytes / (1024 * 1024 * 1024);
  return `${gib.toFixed(2)} GiB`;
}

function workspaceCandidates({ requestedRoot }) {
  return [resolve(requestedRoot ?? resolve(tmpdir(), 'iw'))];
}


function minimumFreeBytes(env) {
  const configured = env.IOT_MODULE_MIN_FREE_BYTES;
  if (configured === undefined || configured === '') {
    return DEFAULT_MIN_FREE_BYTES;
  }
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('IOT_MODULE_MIN_FREE_BYTES must be a positive integer.');
  }
  return parsed;
}

function workspaceLock(repositoryRoot) {
  const repositoryKey = createHash('sha256')
    .update(resolve(repositoryRoot).toLowerCase())
    .digest('hex')
    .slice(0, 16);
  const path = resolve(
    tmpdir(),
    'iw',
    `.iot-platform-module-runner-${repositoryKey}.lock`,
  );
  return { path, markerPath: resolve(path, WORKSPACE_LOCK_MARKER) };
}

async function acquireWorkspaceLock(_root, repositoryRoot) {
  const lock = workspaceLock(repositoryRoot);
  await mkdir(dirname(lock.path), { recursive: true });
  try {
    await mkdir(lock.path);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let details = 'existing lock ownership is unreadable';
    try {
      const marker = await readLockMarker(lock.markerPath);
      validateLockMarker(marker, repositoryRoot, lock.path);
      details = isProcessAlive(marker.pid)
        ? `owner process ${marker.pid} is alive`
        : `owner process ${marker.pid} is not alive; official cleanup is required`;
    } catch (markerError) {
      details = markerError.message;
    }
    throw new Error(
      `Another module-runner workspace is active or stale for this repository at ${lock.path}: ${details}.`,
    );
  }

  const marker = {
    version: WORKSPACE_MARKER_VERSION,
    owner: 'iot-platform-module-runner-lock',
    repositoryRoot: resolve(repositoryRoot),
    lockPath: lock.path,
    pid: process.pid,
    createdAt: new Date().toISOString(),
  };
  try {
    await writeFile(lock.markerPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
    return lock;
  } catch (error) {
    await rm(lock.path, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function releaseWorkspaceLock(lock, repositoryRoot) {
  if (!lock?.path || !(await pathExists(lock.path))) return;
  const marker = await readLockMarker(lock.markerPath);
  validateLockMarker(marker, repositoryRoot, lock.path);
  if (marker.pid !== process.pid) {
    throw new Error(
      `Workspace lock belongs to another process ${marker.pid}: ${lock.path}`,
    );
  }
  await rm(lock.path, { recursive: true, force: true });
  if (await pathExists(lock.path)) {
    throw new Error(`Workspace lock still exists after cleanup: ${lock.path}`);
  }
}

function validateLockMarker(marker, repositoryRoot, lockPath) {
  if (
    marker.owner !== 'iot-platform-module-runner-lock' ||
    marker.version !== WORKSPACE_MARKER_VERSION ||
    resolve(marker.repositoryRoot) !== resolve(repositoryRoot) ||
    resolve(marker.lockPath) !== resolve(lockPath)
  ) {
    throw new Error(`Workspace lock ownership mismatch: ${lockPath}`);
  }
}

async function readWorkspaceMarker(temporaryRoot) {
  const markerPath = resolve(temporaryRoot, WORKSPACE_MARKER);
  return JSON.parse(await readFile(markerPath, 'utf8'));
}

async function readLockMarker(markerPath) {
  return JSON.parse(await readFile(markerPath, 'utf8'));
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

async function verifyWritableDirectory(directory) {
  await mkdir(directory, { recursive: true });
  await access(directory, constants.R_OK | constants.W_OK);
  const probe = resolve(directory, `.probe-${process.pid}-${Date.now()}`);
  await writeFile(probe, 'ok\n', 'utf8');
  await rm(probe, { force: true });
  await access(dirname(directory), constants.R_OK);
}
