#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as dns } from 'node:dns';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const jsonArg = argv.find((value) => value.startsWith('--json='));
const jsonPath = jsonArg ? path.resolve(jsonArg.slice('--json='.length)) : null;
const noRegistryProbe = argv.includes('--no-registry-probe');
const registryHost = 'registry.npmjs.org';
const rows = [];

function add(name, state, detail) {
  rows.push({ name, state, detail });
}

function commandVersion(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command),
  });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function major(version) {
  const match = String(version ?? '').match(/^(?:v)?(\d+)/);
  return match ? Number(match[1]) : null;
}

async function probeRegistry() {
  const startedAt = Date.now();
  let dnsResult;
  try {
    const resolved = await Promise.race([
      dns.lookup(registryHost),
      new Promise((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error('DNS probe timed out'), { code: 'TIMEOUT' })), 3000),
      ),
    ]);
    dnsResult = { state: 'PASS', detail: `${registryHost} -> ${resolved.address}` };
  } catch (error) {
    dnsResult = {
      state: 'FAIL',
      detail: `${registryHost} ${error?.code ?? error?.message ?? 'lookup failed'}`,
    };
    return {
      dns: dnsResult,
      https: { state: 'SKIP', detail: 'HTTPS probe skipped because DNS did not resolve' },
      durationMs: Date.now() - startedAt,
    };
  }

  const httpsResult = await new Promise((resolve) => {
    const request = https.request(
      {
        protocol: 'https:',
        hostname: registryHost,
        path: '/-/ping',
        method: 'GET',
        timeout: 3500,
        headers: { 'user-agent': 'iot-platform-rescue-bootstrap-doctor/1' },
      },
      (response) => {
        response.resume();
        const ok = Number(response.statusCode) >= 200 && Number(response.statusCode) < 500;
        resolve({
          state: ok ? 'PASS' : 'FAIL',
          detail: `HTTPS ${response.statusCode ?? 'unknown'}`,
        });
      },
    );
    request.once('timeout', () => {
      request.destroy();
      resolve({ state: 'FAIL', detail: 'HTTPS probe timed out' });
    });
    request.once('error', (error) => {
      resolve({ state: 'FAIL', detail: error?.code ?? error?.message ?? 'HTTPS probe failed' });
    });
    request.end();
  });

  return { dns: dnsResult, https: httpsResult, durationMs: Date.now() - startedAt };
}

const packageJsonPath = path.resolve('package.json');
const packageLockPath = path.resolve('package-lock.json');
const packageJson = readJson(packageJsonPath);
const packageLock = readJson(packageLockPath);

const nodeVersion = process.version;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmVersion = commandVersion(npmCommand);
const expectedNodeMajor = Number(String(packageJson?.engines?.node ?? '').match(/\d+/)?.[0] ?? 22);
const expectedNpmMajor = Number(String(packageJson?.engines?.npm ?? '').match(/\d+/)?.[0] ?? 10);

add('Node.js toolchain', major(nodeVersion) === expectedNodeMajor ? 'PASS' : 'FAIL', `${nodeVersion}; expected major ${expectedNodeMajor}`);
add(
  'npm toolchain',
  npmVersion && major(npmVersion) === expectedNpmMajor ? 'PASS' : 'FAIL',
  `${npmVersion ?? 'not found'}; expected major ${expectedNpmMajor}`,
);
add('package.json', packageJson ? 'PASS' : 'FAIL', packageJson ? packageJsonPath : 'missing or invalid JSON');
add(
  'package-lock.json',
  packageLock?.lockfileVersion === 3 ? 'PASS' : 'FAIL',
  packageLock ? `lockfileVersion=${packageLock.lockfileVersion ?? 'unknown'}` : 'missing or invalid JSON',
);

const nodeModulesPath = path.resolve('node_modules');
const hiddenLockPath = path.join(nodeModulesPath, '.package-lock.json');
const nodeModulesExists = existsSync(nodeModulesPath);
const hiddenLockExists = existsSync(hiddenLockPath);
const criticalPackages = ['typescript', 'jest', 'prisma', '@nestjs/cli', 'next', 'expo'];
const missingCritical = criticalPackages.filter(
  (packageName) => !existsSync(path.join(nodeModulesPath, ...packageName.split('/'), 'package.json')),
);

let dependencyState = 'MISSING';
if (nodeModulesExists && !hiddenLockExists) dependencyState = 'PARTIAL';
else if (hiddenLockExists && missingCritical.length > 0) dependencyState = 'PARTIAL';
else if (hiddenLockExists && missingCritical.length === 0) dependencyState = 'READY';

add(
  'Dependency installation',
  dependencyState === 'READY' ? 'PASS' : 'FAIL',
  dependencyState === 'READY'
    ? 'node_modules hidden lock + critical tool packages present'
    : dependencyState === 'PARTIAL'
      ? `partial/incomplete install${missingCritical.length ? `; missing critical: ${missingCritical.join(', ')}` : ''}`
      : 'node_modules not installed',
);

const cachePath = path.join(os.homedir(), '.npm', '_cacache');
add('npm cache', existsSync(cachePath) ? 'INFO' : 'WARN', existsSync(cachePath) ? cachePath : 'cache directory not found');

let registry = null;
if (dependencyState !== 'READY' && !noRegistryProbe) {
  registry = await probeRegistry();
  add('npm registry DNS', registry.dns.state, registry.dns.detail);
  add('npm registry HTTPS', registry.https.state, registry.https.detail);
} else if (dependencyState !== 'READY') {
  add('npm registry probe', 'SKIP', '--no-registry-probe requested');
} else {
  add('npm registry probe', 'SKIP', 'dependencies already installed; network is not a runtime prerequisite');
}

const toolchainReady = rows
  .filter((row) => ['Node.js toolchain', 'npm toolchain', 'package.json', 'package-lock.json'].includes(row.name))
  .every((row) => row.state === 'PASS');

let status;
if (!toolchainReady) status = 'TOOLCHAIN_OR_LOCK_INVALID';
else if (dependencyState === 'READY') status = 'READY';
else if (dependencyState === 'PARTIAL') status = 'PARTIAL_INSTALL';
else if (noRegistryProbe) status = 'DEPENDENCIES_MISSING';
else if (registry?.dns.state !== 'PASS' || registry?.https.state !== 'PASS') status = 'DEPENDENCY_NETWORK_BLOCKED';
else status = 'INSTALL_REQUIRED_REGISTRY_REACHABLE';

const widths = {
  name: Math.max('Check'.length, ...rows.map((row) => row.name.length)),
  state: Math.max('State'.length, ...rows.map((row) => row.state.length)),
};
console.log(`${'Check'.padEnd(widths.name)}  ${'State'.padEnd(widths.state)}  Detail`);
console.log(`${'-'.repeat(widths.name)}  ${'-'.repeat(widths.state)}  ${'-'.repeat(48)}`);
for (const row of rows) {
  console.log(`${row.name.padEnd(widths.name)}  ${row.state.padEnd(widths.state)}  ${row.detail}`);
}
console.log(`\nResult: ${status}`);

if (status === 'PARTIAL_INSTALL') {
  console.log('NEXT  Remove the partial node_modules directory before retrying the exact lockfile install.');
} else if (status === 'DEPENDENCY_NETWORK_BLOCKED') {
  console.log('NEXT  Restore DNS/HTTPS access to registry.npmjs.org (or provide a complete trusted npm cache/proxy), then retry npm ci.');
} else if (status === 'INSTALL_REQUIRED_REGISTRY_REACHABLE') {
  console.log('NEXT  Run: npm ci --ignore-scripts --prefer-offline --no-audit --fund=false --progress=false');
} else if (status === 'READY') {
  console.log('NEXT  Dependency bootstrap is ready; continue with rescue:runtime:check / rescue:acceptance.');
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status,
  dependencyState,
  registry,
  rows,
};
if (jsonPath) {
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`REPORT  ${jsonPath}`);
}

process.exitCode = status === 'READY' ? 0 : 2;
