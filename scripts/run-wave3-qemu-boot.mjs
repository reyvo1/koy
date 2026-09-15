#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXPECTED_MARKERS = [
  'WAVE3_QEMU_BOOT_OK',
  'WAVE3_SDK_LINK_OK version=2.1.0 state=0',
  'WAVE3_OTA_SHA256_REQUIRED',
];

function parseArgs(argv) {
  const values = {};
  for (const raw of argv) {
    if (!raw.startsWith('--')) continue;
    const index = raw.indexOf('=');
    if (index < 0) values[raw.slice(2)] = 'true';
    else values[raw.slice(2, index)] = raw.slice(index + 1);
  }
  return values;
}

function targetConfig(target) {
  if (target === 'esp32') {
    return {
      qemuBinary: 'qemu-system-xtensa',
      qemuArgs: ['-nographic', '-machine', 'esp32'],
    };
  }
  if (target === 'esp32c3') {
    return {
      qemuBinary: 'qemu-system-riscv32',
      qemuArgs: ['-nographic', '-icount', '3', '-machine', 'esp32c3'],
    };
  }
  throw new Error(`Unsupported Wave 3 QEMU target: ${target}`);
}

function tail(text, max = 12000) {
  return text.length <= max ? text : text.slice(-max);
}

function runChecked(command, args, { cwd, env = process.env, label }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  const combined = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`${label ?? command} failed with exit code ${result.status}\n${tail(combined)}`);
  }
  return combined;
}

export async function runWave3QemuBoot({
  target,
  appPath,
  timeoutMs = 30000,
  idfPy = 'idf.py',
  idfPyPrefixArgs = [],
  qemuBinary,
  qemuPrefixArgs = [],
  env = process.env,
  expectedMarkers = EXPECTED_MARKERS,
}) {
  const cfg = targetConfig(target);
  const resolvedApp = path.resolve(appPath);
  const buildDir = path.join(resolvedApp, 'build');
  if (!existsSync(path.join(resolvedApp, 'CMakeLists.txt'))) {
    throw new Error(`ESP-IDF app path is invalid: ${resolvedApp}`);
  }
  const projectDescriptionPath = path.join(buildDir, 'project_description.json');
  if (!existsSync(projectDescriptionPath)) {
    throw new Error(`ESP-IDF build output missing project_description.json: ${buildDir}`);
  }
  let projectDescription;
  try {
    projectDescription = JSON.parse(readFileSync(projectDescriptionPath, 'utf8'));
  } catch (error) {
    throw new Error(`ESP-IDF project_description.json is invalid: ${error.message}`);
  }
  if (projectDescription.target !== target) {
    throw new Error(`ESP-IDF build target mismatch: expected ${target}, got ${projectDescription.target ?? 'missing'}`);
  }

  const flashImage = path.join(buildDir, `wave3-qemu-${target}.bin`);
  // Use the ESP-IDF frontend instead of pytest-embedded's independent image
  // builder. ESP-IDF 5.5.5 owns the matching esptool v4 CLI contract and
  // expands the project's canonical flash_args itself.
  runChecked(
    idfPy,
    [...idfPyPrefixArgs, 'merge-bin', '-o', flashImage, '-f', 'raw', '--fill-flash-size', '4MB'],
    { cwd: resolvedApp, env, label: 'idf.py merge-bin' },
  );
  if (!existsSync(flashImage)) {
    throw new Error(`ESP-IDF merge-bin did not produce ${flashImage}`);
  }
  const expectedFlashBytes = 4 * 1024 * 1024;
  const actualFlashBytes = statSync(flashImage).size;
  if (actualFlashBytes !== expectedFlashBytes) {
    throw new Error(`ESP-IDF merged flash size mismatch: expected ${expectedFlashBytes}, got ${actualFlashBytes}`);
  }

  const binary = qemuBinary || cfg.qemuBinary;
  const qemuArgs = [
    ...qemuPrefixArgs,
    ...cfg.qemuArgs,
    '-drive', `file=${flashImage},if=mtd,format=raw`,
  ];

  return await new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    let timeout;
    let killTimer;
    const proc = spawn(binary, qemuArgs, {
      cwd: resolvedApp,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const cleanup = () => {
      clearTimeout(timeout);
      proc.stdout?.removeAllListeners();
      proc.stderr?.removeAllListeners();
      proc.removeAllListeners();
    };

    const stop = () => {
      if (proc.exitCode !== null || proc.killed) return;
      try { proc.kill('SIGTERM'); } catch {}
      killTimer = setTimeout(() => {
        if (proc.exitCode === null) {
          try { proc.kill('SIGKILL'); } catch {}
        }
      }, 1000);
      killTimer.unref?.();
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      stop();
      cleanup();
      resolve({ target, flashImage, output });
    };

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      stop();
      cleanup();
      reject(error);
    };

    const inspect = (chunk) => {
      output += chunk.toString('utf8');
      if (expectedMarkers.every((marker) => output.includes(marker))) finishOk();
    };

    proc.stdout.on('data', inspect);
    proc.stderr.on('data', inspect);
    proc.once('error', (error) => finishError(new Error(`QEMU ${target} spawn failed: ${error.message}`)));
    proc.once('exit', (code, signal) => {
      if (settled) return;
      finishError(new Error(
        `QEMU ${target} exited before all boot markers (code=${code}, signal=${signal ?? 'none'})\n${tail(output)}`,
      ));
    });

    timeout = setTimeout(() => {
      const missing = expectedMarkers.filter((marker) => !output.includes(marker));
      finishError(new Error(
        `QEMU ${target} boot timed out after ${timeoutMs}ms; missing=${missing.join(', ')}\n${tail(output)}`,
      ));
    }, timeoutMs);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.target;
  const appPath = args['app-path'];
  const timeoutMs = Number(args['timeout-ms'] ?? '30000');
  if (!target || !appPath || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Usage: node scripts/run-wave3-qemu-boot.mjs --target=esp32|esp32c3 --app-path=<path> [--timeout-ms=30000]');
  }
  const result = await runWave3QemuBoot({
    target,
    appPath,
    timeoutMs,
    idfPy: args['idf-py'] || process.env.WAVE3_IDF_PY || 'idf.py',
    qemuBinary: args['qemu-binary'] || process.env.WAVE3_QEMU_BINARY,
  });
  console.log(`PASS  Wave 3 ${target} firmware booted in Espressif QEMU with all contract markers`);
  console.log(`FLASH ${result.flashImage}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(`FAIL  ${error.stack || error.message}`);
    process.exit(1);
  });
}
