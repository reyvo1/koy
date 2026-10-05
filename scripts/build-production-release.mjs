import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(
  root,
  process.env.RELEASE_OUTPUT_DIR ?? 'artifacts/iot-platform-release',
);
const requiredSources = [
  'dist',
  'package.json',
  'package-lock.json',
  'prisma/schema.prisma',
  'prisma/migrations',
  '.node-version',
  '.nvmrc',
  'ops',
  'scripts/verify-production-release.mjs',
  'scripts/verify-production-environment-evidence.mjs',
  'scripts/create-production-environment-evidence.mjs',
  'scripts/verify-production-environment-current.mjs',
  'scripts/verify-migration-compatibility.mjs',
  'docs/deployment-recovery.md',
];
const provenanceSources = [
  'package-lock.json',
  'BASELINE-MANIFEST.sha256',
  'repository-tree.txt',
];

function requirePath(path) {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    throw new Error(`Required release input is missing: ${path}`);
  }
}

function copyPath(path) {
  const source = resolve(root, path);
  const target = resolve(outputRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

execFileSync(process.execPath, ['scripts/verify-migration-compatibility.mjs'], {
  cwd: root,
  stdio: 'inherit',
});

for (const path of requiredSources) {
  requirePath(path);
}
for (const path of provenanceSources) {
  requirePath(path);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });
for (const path of requiredSources) {
  copyPath(path);
}

const packageJsonPath = resolve(outputRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
delete packageJson.workspaces;
packageJson.scripts = {
  start: 'node dist/main.js',
  'migrate:deploy': 'prisma migrate deploy',
};
writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

let revision = process.env.GITHUB_SHA;
if (!revision) {
  try {
    revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    revision = 'unknown';
  }
}

const files = listFiles(outputRoot)
  .map((absolute) => ({
    path: relative(outputRoot, absolute).split(sep).join('/'),
    bytes: statSync(absolute).size,
    sha256: sha256(absolute),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

const manifest = {
  schemaVersion: 1,
  application: packageJson.name,
  version: packageJson.version,
  revision,
  node: packageJson.engines?.node ?? null,
  packageManager: packageJson.packageManager ?? null,
  entrypoint: 'dist/main.js',
  createdAt: new Date().toISOString(),
  sourceFingerprint: {
    packageLockSha256: sha256(resolve(root, 'package-lock.json')),
    baselineManifestSha256: sha256(resolve(root, 'BASELINE-MANIFEST.sha256')),
    repositoryTreeSha256: sha256(resolve(root, 'repository-tree.txt')),
  },
  files,
};

writeFileSync(
  resolve(outputRoot, 'release-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
  `Production release directory created: ${relative(root, outputRoot)}`,
);
console.log(`Release revision: ${revision}`);
console.log(`Manifest files: ${files.length}`);
