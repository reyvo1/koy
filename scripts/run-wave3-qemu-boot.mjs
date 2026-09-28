#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { wave3QemuEfuseBytes } from './wave3-qemu-efuse-defaults.mjs';

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

// The runner must reproduce the argument contract that ESP-IDF v5.5.5's own
// `idf.py qemu` frontend builds in tools/idf_py_actions/qemu_ext.py, minus the
// monitor/gdb plumbing that does not apply to a marker-scanning boot.
//
//   esp32   : qemu-system-xtensa  -M esp32 -m 4M
//   esp32c3 : qemu-system-riscv32 -M esp32c3  (+ -icount 3, mandatory)
//
// ESP32 takes `-m 4M` because the native frontend always passes it. Note this is
// PSRAM, not internal SRAM: esp32_soc_init() always maps DRAM/IRAM/iCache/RTC
// regardless of machine->ram_size, and only esp32_machine_init_psram() is gated on
// it. The Wave 3 test app does not enable CONFIG_SPIRAM, so this argument is
// native-contract parity rather than a functional prerequisite. Keeping it means a
// future PSRAM-enabled build inherits the correct emulated window instead of
// silently losing it.
// ESP32-C3 has no PSRAM path, so it takes no -m and instead requires -icount 3
// because that machine cannot run in free-running mode.
function targetConfig(target) {
  if (target === 'esp32') {
    return {
      qemuBinary: 'qemu-system-xtensa',
      qemuArgs: ['-nographic', '-machine', 'esp32', '-m', '4M'],
      efuseDriver: 'nvram.esp32.efuse',
      timerDriver: 'timer.esp32.timg',
    };
  }
  if (target === 'esp32c3') {
    return {
      qemuBinary: 'qemu-system-riscv32',
      qemuArgs: ['-nographic', '-icount', '3', '-machine', 'esp32c3'],
      efuseDriver: 'nvram.esp32c3.efuse',
      timerDriver: 'timer.esp32c3.timg',
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

  // Materialise the eFuse image exactly as `idf.py qemu` does. QEMU refuses to
  // start when a -drive file is missing, and an all-zero eFuse block is a
  // different chip from the revision the ESP-IDF toolchain boots by default.
  const efuseImage = path.join(buildDir, `wave3-qemu-${target}-efuse.bin`);
  const efuseBytes = wave3QemuEfuseBytes(target);
  writeFileSync(efuseImage, efuseBytes);
  if (statSync(efuseImage).size !== efuseBytes.length) {
    throw new Error(`Wave 3 QEMU eFuse image is truncated: ${efuseImage}`);
  }

  const binary = qemuBinary || cfg.qemuBinary;
  const qemuArgs = [
    ...qemuPrefixArgs,
    ...cfg.qemuArgs,
    '-drive', `file=${flashImage},if=mtd,format=raw`,
    '-drive', `file=${efuseImage},if=none,format=raw,id=efuse`,
    '-global', `driver=${cfg.efuseDriver},property=drive,value=efuse`,
    // The emulated TWDT would otherwise reset the SoC mid-boot, which reads as
    // a silent marker timeout instead of an honest emulation failure.
    '-global', `driver=${cfg.timerDriver},property=wdt_disable,value=true`,
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
      resolve({ target, flashImage, efuseImage, output });
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
  console.log(`EFUSE ${result.efuseImage}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((error) => {
    console.error(`FAIL  ${error.stack || error.message}`);
    process.exit(1);
  });
}
