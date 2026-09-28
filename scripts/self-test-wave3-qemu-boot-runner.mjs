#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runWave3QemuBoot } from './run-wave3-qemu-boot.mjs';
import { WAVE3_QEMU_EFUSE_DEFAULTS, wave3QemuEfuseBytes } from './wave3-qemu-efuse-defaults.mjs';

function pass(label) { console.log(`PASS  ${label}`); }
async function expectReject(promise, pattern, label) {
  try { await promise; } catch (error) {
    if (pattern.test(error.message)) { pass(label); return; }
    throw new Error(`FAIL  ${label}: unexpected error ${error.message}`);
  }
  throw new Error(`FAIL  ${label}: unexpectedly resolved`);
}

// ESP-IDF v5.5.5 qemu_ext.py always attaches the eFuse backing store and always
// disables the emulated timer-group watchdog. A repository-native runner that
// drops either diverges from the chip state the toolchain itself boots.
function assertEspIdfDeviceGlobals(args, target, efuseDriver, timerDriver) {
  const global = (predicate, label) => {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-global' && predicate(args[i + 1])) { pass(label); return; }
    }
    throw new Error(`FAIL  ${label}: missing from ${args.join(' ')}`);
  };
  const driveIndex = args.indexOf('-drive');
  let hasEfuseDrive = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-drive' && typeof args[i + 1] === 'string' && args[i + 1].includes('id=efuse')) {
      hasEfuseDrive = true;
    }
  }
  if (!hasEfuseDrive) throw new Error(`FAIL  eFuse backing drive missing from ${args.join(' ')}`);
  if (driveIndex < 0) throw new Error('FAIL  flash drive missing');
  pass(`QEMU attaches an eFuse backing drive for ${target}`);
  global((v) => v === `driver=${efuseDriver},property=drive,value=efuse`,
    `QEMU binds the ${target} eFuse block to its default image`);
  global((v) => v === `driver=${timerDriver},property=wdt_disable,value=true`,
    `QEMU disables the emulated ${target} timer-group watchdog during boot`);
}

function assertEfuseImage(efuseImage, target) {
  if (!efuseImage || !existsSync(efuseImage)) {
    throw new Error(`FAIL  eFuse image was not materialised for ${target}`);
  }
  const written = readFileSync(efuseImage);
  const expected = wave3QemuEfuseBytes(target);
  if (!written.equals(expected)) {
    throw new Error(`FAIL  eFuse image for ${target} does not match the ESP-IDF default (${written.length} vs ${expected.length} bytes)`);
  }
  pass(`QEMU boots ${target} from the ESP-IDF default eFuse image (${expected.length} bytes)`);
}

const root = mkdtempSync(path.join(os.tmpdir(), 'wave3-qemu-runner-'));
const app = path.join(root, 'app');
const build = path.join(app, 'build');
const bin = path.join(root, 'bin');
mkdirSync(build, { recursive: true });
mkdirSync(bin, { recursive: true });
writeFileSync(path.join(app, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.16)\n');
writeFileSync(path.join(build, 'project_description.json'), '{"target":"esp32"}\n');

const idf = path.join(bin, 'fake-idf.mjs');
const idfLog = path.join(root, 'idf-argv.json');
writeFileSync(idf, `import fs from 'node:fs'; import path from 'node:path';
const args=process.argv.slice(2); fs.writeFileSync(process.env.WAVE3_FAKE_IDF_LOG, JSON.stringify(args));
if(args[0]!=='merge-bin') process.exit(9);
const oi=args.indexOf('-o'); if(oi<0) process.exit(8);
fs.writeFileSync(path.resolve(process.cwd(), args[oi+1]), Buffer.alloc(4 * 1024 * 1024, 0xff));
`);


const idfWrongSize = path.join(bin, 'fake-idf-wrong-size.mjs');
writeFileSync(idfWrongSize, `import fs from 'node:fs'; import path from 'node:path';
const args=process.argv.slice(2); const oi=args.indexOf('-o'); if(oi<0) process.exit(8);
fs.writeFileSync(path.resolve(process.cwd(), args[oi+1]), Buffer.alloc(4096, 0xff));
`);

const qemuOk = path.join(bin, 'qemu-ok.mjs');
const qemuLog = path.join(root, 'qemu-argv.json');
writeFileSync(qemuOk, `import fs from 'node:fs';
fs.writeFileSync(process.env.WAVE3_FAKE_QEMU_LOG, JSON.stringify(process.argv.slice(2)));
console.log('WAVE3_QEMU_BOOT_OK');
console.error('WAVE3_SDK_LINK_OK version=2.1.0 state=0');
console.log('WAVE3_OTA_SHA256_REQUIRED');
setInterval(()=>{},1000);
`);

const qemuMissing = path.join(bin, 'qemu-missing.mjs');
writeFileSync(qemuMissing, `console.log('WAVE3_QEMU_BOOT_OK'); process.exit(0);`);

const qemuHang = path.join(bin, 'qemu-hang.mjs');
writeFileSync(qemuHang, `console.log('booting but no markers'); setInterval(()=>{},1000);`);

const fakeEnv = { ...process.env, WAVE3_FAKE_IDF_LOG: idfLog, WAVE3_FAKE_QEMU_LOG: qemuLog };
const fakeIdf = { idfPy: process.execPath, idfPyPrefixArgs: [idf] };
const fakeQemuOk = { qemuBinary: process.execPath, qemuPrefixArgs: [qemuOk] };

try {
  const ok = await runWave3QemuBoot({ target: 'esp32', appPath: app, timeoutMs: 2000, ...fakeIdf, ...fakeQemuOk, env: fakeEnv });
  if (!ok.output.includes('WAVE3_OTA_SHA256_REQUIRED')) throw new Error('success output missing marker');
  pass('QEMU runner succeeds only after all required boot markers are observed across stdout/stderr');
  const idfArgs = JSON.parse(readFileSync(idfLog, 'utf8'));
  if (idfArgs.join(' ') !== `merge-bin -o ${path.join(build, 'wave3-qemu-esp32.bin')} -f raw --fill-flash-size 4MB`) throw new Error(`unexpected idf.py merge-bin args: ${idfArgs.join(' ')}`);
  pass('QEMU runner delegates flash-image generation to idf.py merge-bin with a fixed 4MB image contract');
  const esp32Args = JSON.parse(readFileSync(qemuLog, 'utf8'));
  if (!esp32Args.includes('-machine') || !esp32Args.includes('esp32') || esp32Args.includes('-icount')) throw new Error(`unexpected ESP32 QEMU args: ${esp32Args.join(' ')}`);
  const esp32Mem = esp32Args.indexOf('-m');
  if (esp32Mem < 0 || esp32Args[esp32Mem + 1] !== '4M') throw new Error(`ESP32 QEMU must request the 4 MiB PSRAM window: ${esp32Args.join(' ')}`);
  pass('ESP32 QEMU command matches the target machine contract');
  pass('ESP32 QEMU requests the PSRAM window the native ESP-IDF frontend always passes');
  assertEspIdfDeviceGlobals(esp32Args, 'esp32', 'nvram.esp32.efuse', 'timer.esp32.timg');
  assertEfuseImage(ok.efuseImage, 'esp32');

  writeFileSync(path.join(build, 'project_description.json'), '{\"target\":\"esp32c3\"}\n');
  await expectReject(
    runWave3QemuBoot({ target: 'esp32', appPath: app, timeoutMs: 2000, ...fakeIdf, ...fakeQemuOk, env: fakeEnv }),
    /build target mismatch/,
    'matrix target mismatch is rejected before merged-image generation or QEMU boot',
  );

  writeFileSync(path.join(build, 'project_description.json'), '{\"target\":\"esp32c3\"}\n');
  const c3 = await runWave3QemuBoot({ target: 'esp32c3', appPath: app, timeoutMs: 2000, ...fakeIdf, ...fakeQemuOk, env: fakeEnv });
  if (c3.target !== 'esp32c3') throw new Error('C3 target not preserved');
  pass('QEMU runner accepts ESP32-C3 and owns its target-specific command path');
  const c3Args = JSON.parse(readFileSync(qemuLog, 'utf8'));
  const icount = c3Args.indexOf('-icount');
  if (!c3Args.includes('esp32c3') || icount < 0 || c3Args[icount + 1] !== '3') throw new Error(`unexpected ESP32-C3 QEMU args: ${c3Args.join(' ')}`);
  if (c3Args.includes('-m')) throw new Error(`ESP32-C3 has no PSRAM path and must not request -m: ${c3Args.join(' ')}`);
  pass('ESP32-C3 QEMU command includes the required -icount 3 execution model');
  pass('ESP32-C3 QEMU omits the ESP32-only PSRAM window argument');
  assertEspIdfDeviceGlobals(c3Args, 'esp32c3', 'nvram.esp32c3.efuse', 'timer.esp32c3.timg');
  assertEfuseImage(c3.efuseImage, 'esp32c3');

  if (WAVE3_QEMU_EFUSE_DEFAULTS.esp32 === WAVE3_QEMU_EFUSE_DEFAULTS.esp32c3) {
    throw new Error('FAIL  ESP32 and ESP32-C3 must not share one eFuse default');
  }
  pass('ESP32 and ESP32-C3 boot from distinct ESP-IDF eFuse defaults');
  try {
    wave3QemuEfuseBytes('esp32s3');
    throw new Error('FAIL  unsupported target must not resolve an eFuse default');
  } catch (error) {
    if (!/No Wave 3 QEMU eFuse default/.test(error.message)) throw error;
  }
  pass('unsupported targets fail closed before any eFuse image is written');

  writeFileSync(path.join(build, 'project_description.json'), '{\"target\":\"esp32\"}\n');
  await expectReject(
    runWave3QemuBoot({ target: 'esp32', appPath: app, timeoutMs: 2000, idfPy: process.execPath, idfPyPrefixArgs: [idfWrongSize], ...fakeQemuOk, env: fakeEnv }),
    /merged flash size mismatch/,
    'merged QEMU flash must be exactly the configured 4MB device size',
  );

  await expectReject(
    runWave3QemuBoot({ target: 'esp32', appPath: app, timeoutMs: 2000, ...fakeIdf, qemuBinary: process.execPath, qemuPrefixArgs: [qemuMissing], env: fakeEnv }),
    /exited before all boot markers/,
    'premature QEMU exit fails closed instead of becoming simulated-hardware PASS',
  );

  await expectReject(
    runWave3QemuBoot({ target: 'esp32', appPath: app, timeoutMs: 150, ...fakeIdf, qemuBinary: process.execPath, qemuPrefixArgs: [qemuHang], env: fakeEnv }),
    /boot timed out/,
    'QEMU boot timeout fails closed with missing-marker context',
  );

  await expectReject(
    runWave3QemuBoot({ target: 'esp32s3', appPath: app, timeoutMs: 100, ...fakeIdf, ...fakeQemuOk, env: fakeEnv }),
    /Unsupported Wave 3 QEMU target/,
    'unsupported QEMU targets are rejected before execution',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('WAVE 3 QEMU BOOT RUNNER SELF-TEST PASS');
