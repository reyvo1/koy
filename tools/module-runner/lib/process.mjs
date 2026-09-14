import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_HEARTBEAT_MS = 30_000;
const MAX_CAPTURE_BYTES = 20 * 1024 * 1024;

export class NativeCommandError extends Error {
  constructor(message, result) {
    super(message);
    this.name = 'NativeCommandError';
    this.result = result;
  }
}

export function formatCommand(command, args = []) {
  return [command, ...args]
    .map((value) => (/\s|"/.test(value) ? JSON.stringify(value) : value))
    .join(' ');
}

export async function resolveInvocation(
  command,
  args = [],
  {
    platform = process.platform,
    execPath = process.execPath,
    env = process.env,
  } = {},
) {
  if (platform !== 'win32' || !['npm', 'npx'].includes(command)) {
    return { executable: command, args: [...args] };
  }

  const cliFile = command === 'npm' ? 'npm-cli.js' : 'npx-cli.js';
  const candidates = [];

  if (typeof env.npm_execpath === 'string' && env.npm_execpath.length > 0) {
    if (command === 'npm') {
      candidates.push(env.npm_execpath);
    } else {
      candidates.push(resolve(dirname(env.npm_execpath), cliFile));
    }
  }

  candidates.push(
    resolve(dirname(execPath), 'node_modules', 'npm', 'bin', cliFile),
    resolve(dirname(execPath), '..', 'node_modules', 'npm', 'bin', cliFile),
  );

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate, constants.F_OK);
      return {
        executable: execPath,
        args: [candidate, ...args],
      };
    } catch {
      // Continue through deterministic Node/npm installation layouts.
    }
  }

  throw new Error(
    `Unable to resolve ${command} CLI for Windows without invoking a shell. ` +
      `Checked: ${[...new Set(candidates)].join(', ')}`,
  );
}

export async function runNative(
  command,
  args = [],
  {
    cwd = process.cwd(),
    env = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    heartbeatMs = DEFAULT_HEARTBEAT_MS,
    input,
    log,
    stream = false,
    stdoutWriter = process.stdout,
    stderrWriter = process.stderr,
  } = {},
) {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(
      `timeoutMs must be a positive integer. Actual: ${timeoutMs}`,
    );
  }
  if (!Number.isInteger(heartbeatMs) || heartbeatMs <= 0) {
    throw new Error(
      `heartbeatMs must be a positive integer. Actual: ${heartbeatMs}`,
    );
  }

  const startedAt = Date.now();
  const commandLine = formatCommand(command, args);
  const invocation = await resolveInvocation(command, args, {
    env: { ...process.env, ...env },
  });
  const child = spawn(invocation.executable, invocation.args, {
    cwd,
    env: { ...process.env, ...env },
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdout = createCapture();
  const stderr = createCapture();
  let timedOut = false;
  let timeoutTermination = null;

  child.stdout.on('data', (chunk) => {
    const bytes = Buffer.from(chunk);
    stdout.push(bytes);
    if (stream) stdoutWriter.write(bytes);
  });
  child.stderr.on('data', (chunk) => {
    const bytes = Buffer.from(chunk);
    stderr.push(bytes);
    if (stream) stderrWriter.write(bytes);
  });

  if (input === undefined) {
    child.stdin.end();
  } else {
    child.stdin.end(input);
  }

  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    stderrWriter.write(
      `\n[module-runner] still running (${elapsedSeconds}s): ${commandLine}\n`,
    );
  }, heartbeatMs);
  heartbeat.unref();

  const timer = setTimeout(() => {
    timedOut = true;
    timeoutTermination = terminateProcessTree(child);
  }, timeoutMs);
  timer.unref();

  let exitCode;
  try {
    exitCode = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => {
        accept(code ?? (signal ? 128 : 1));
      });
    });
  } finally {
    clearTimeout(timer);
    if (heartbeat) clearInterval(heartbeat);
    if (timeoutTermination) {
      await timeoutTermination.catch(() => undefined);
    }
  }

  const result = {
    command,
    executable: invocation.executable,
    args: [...args],
    effectiveArgs: [...invocation.args],
    commandLine,
    cwd,
    exitCode,
    timedOut,
    timeoutMs,
    streamed: stream,
    stdout: stdout.text(),
    stderr: stderr.text(),
    stdoutTruncated: stdout.truncated,
    stderrTruncated: stderr.truncated,
    durationMs: Date.now() - startedAt,
  };

  if (typeof log === 'function') {
    log(result);
  }

  return result;
}

export async function runChecked(command, args = [], options = {}) {
  const result = await runNative(command, args, options);
  if (result.timedOut) {
    throw new NativeCommandError(
      `Command timed out after ${result.durationMs} ms ` +
        `(limit ${result.timeoutMs} ms): ${result.commandLine}`,
      result,
    );
  }
  if (result.exitCode !== 0) {
    throw new NativeCommandError(
      `Command failed with exit code ${result.exitCode}: ${result.commandLine}`,
      result,
    );
  }
  return result;
}

function createCapture() {
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  return {
    push(chunk) {
      if (bytes >= MAX_CAPTURE_BYTES) {
        truncated = true;
        return;
      }
      const remaining = MAX_CAPTURE_BYTES - bytes;
      const accepted =
        chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(accepted);
      bytes += accepted.length;
      if (accepted.length !== chunk.length) truncated = true;
    },
    text() {
      const suffix = truncated
        ? '\n[module-runner] captured output truncated after 20 MiB\n'
        : '';
      return Buffer.concat(chunks).toString('utf8') + suffix;
    },
    get truncated() {
      return truncated;
    },
  };
}

async function terminateProcessTree(child) {
  if (!child.pid) return;

  if (process.platform === 'win32') {
    await new Promise((accept) => {
      const killer = spawn(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      killer.once('error', () => accept());
      killer.once('close', () => accept());
    });
    return;
  }

  child.kill('SIGTERM');
  await new Promise((accept) => setTimeout(accept, 2_000));
  if (child.exitCode === null) child.kill('SIGKILL');
}
