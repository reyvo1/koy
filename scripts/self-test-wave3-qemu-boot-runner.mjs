#!/usr/bin/env node
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runWave3QemuBoot } from './run-wave3-qemu-boot.mjs';

function pass(label) { console.log(`PASS  ${label}`); }
async function expectReject(promise, pattern, label) {
  try { await promise; } catch (error) {
    if (pattern.test(error.message)) { pass(label); return; }
    throw new Error(`FAIL  ${label}: unexpected error ${error.message}`);
  }
  throw new Error(`FAIL  ${label}: unexpectedly resolved`);
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
  pass('ESP32 QEMU command matches the target machine contract');

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
  pass('ESP32-C3 QEMU command includes the required -icount 3 execution model');

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
