import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseRoot = resolve(
  root,
  process.env.RELEASE_OUTPUT_DIR ?? 'artifacts/iot-platform-release',
);
const manifestPath = resolve(releaseRoot, 'release-manifest.json');
const approvalPath = resolve(releaseRoot, 'production-approval.json');
const requireApproved = process.argv.slice(2).includes('--require-approved');
const required = [
  'dist/main.js',
  'package.json',
  'package-lock.json',
  'prisma/schema.prisma',
  'prisma/migrations/migration_lock.toml',
  'ops/systemd/iot-platform.service',
  'ops/systemd/iot-platform-backup.service',
  'ops/systemd/iot-platform-backup.timer',
  'ops/nginx/iot-platform.conf.template',
  'ops/env/iot-platform.env.example',
  'ops/env/iot-platform-backup.env.example',
  'ops/scripts/install-release.sh',
  'ops/scripts/rollback-release.sh',
  'ops/scripts/postgres-backup.sh',
  'ops/scripts/postgres-restore.sh',
  'scripts/verify-production-release.mjs',
  'docs/deployment-recovery.md',
  'release-manifest.json',
];
const forbiddenSegments = new Set([
  'src',
  'test',
  'coverage',
  'node_modules',
  '.git',
  'apps',
  'packages',
]);

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic links are forbidden in release artifacts: ${relative(releaseRoot, absolute)}`);
    }
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    } else {
      throw new Error(`Unsupported filesystem entry in release artifact: ${relative(releaseRoot, absolute)}`);
    }
  }
  return files;
}

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function isSafeRelativePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.startsWith('/') || filePath.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(filePath)) return false;
  const segments = filePath.replace(/\\/g, '/').split('/');
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

function insideReleaseRoot(filePath) {
  const absolute = resolve(releaseRoot, filePath);
  const prefix = `${releaseRoot}${sep}`;
  return absolute === releaseRoot || absolute.startsWith(prefix);
}

if (!existsSync(manifestPath)) {
  throw new Error('release-manifest.json is missing');
}
for (const path of required) {
  if (!existsSync(resolve(releaseRoot, path))) {
    throw new Error(`Required release file is missing: ${path}`);
  }
}

const actualFiles = listFiles(releaseRoot).map((absolute) =>
  relative(releaseRoot, absolute).split(sep).join('/'),
);
for (const path of actualFiles) {
  const segments = path.split('/');
  if (segments.some((segment) => forbiddenSegments.has(segment))) {
    throw new Error(`Forbidden release path: ${path}`);
  }
  if (
    segments.some(
      (segment) => segment === '.env' || segment.startsWith('.env.'),
    )
  ) {
    throw new Error(`Environment secret file must not be packaged: ${path}`);
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.entrypoint !== 'dist/main.js') {
  throw new Error('Release manifest contract is invalid');
}
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  throw new Error('Release manifest contains no files');
}
const manifestPaths = new Set();
for (const file of manifest.files) {
  if (!isSafeRelativePath(file.path) || !insideReleaseRoot(file.path)) {
    throw new Error(`Unsafe manifest path: ${file.path}`);
  }
  const normalizedPath = file.path.replace(/\\/g, '/');
  if (normalizedPath === 'release-manifest.json') {
    throw new Error('release-manifest.json must not self-reference in manifest.files');
  }
  if (manifestPaths.has(normalizedPath)) {
    throw new Error(`Duplicate manifest path: ${normalizedPath}`);
  }
  manifestPaths.add(normalizedPath);
  const absolute = resolve(releaseRoot, normalizedPath);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Manifest file is missing: ${normalizedPath}`);
  }
  if (
    statSync(absolute).size !== file.bytes ||
    digest(absolute) !== file.sha256
  ) {
    throw new Error(`Manifest checksum mismatch: ${normalizedPath}`);
  }
}

const reservedSidecars = new Set(['production-approval.json']);
const actualPayloadPaths = new Set(
  actualFiles.filter((filePath) => filePath !== 'release-manifest.json' && !reservedSidecars.has(filePath)),
);
for (const filePath of actualPayloadPaths) {
  if (!manifestPaths.has(filePath)) {
    throw new Error(`Untracked release file is not covered by manifest: ${filePath}`);
  }
}
for (const filePath of manifestPaths) {
  if (!actualPayloadPaths.has(filePath)) {
    throw new Error(`Manifest references file not present in release: ${filePath}`);
  }
}
if (actualPayloadPaths.size !== manifestPaths.size) {
  throw new Error('Release file set does not exactly match manifest');
}

const sha256Pattern = /^[a-f0-9]{64}$/;
for (const field of ['packageLockSha256', 'baselineManifestSha256', 'repositoryTreeSha256']) {
  if (!sha256Pattern.test(manifest.sourceFingerprint?.[field] ?? '')) {
    throw new Error(`Release source fingerprint is missing/invalid: ${field}`);
  }
}
if (manifest.sourceFingerprint.packageLockSha256 !== digest(resolve(releaseRoot, 'package-lock.json'))) {
  throw new Error('Release source fingerprint does not match packaged package-lock.json');
}

function validTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000;
}

const approvalExists = existsSync(approvalPath);
if (requireApproved && !approvalExists) {
  throw new Error('Production approval receipt is required for installation: production-approval.json');
}
if (approvalExists) {
  let approval;
  try {
    approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
  } catch (error) {
    throw new Error(`Production approval receipt is not valid JSON: ${error.message}`);
  }
  if (
    approval.schemaVersion !== 1 ||
    approval.gate !== 'PRODUCTION_RELEASE' ||
    approval.status !== 'APPROVED'
  ) {
    throw new Error('Production approval receipt contract is invalid');
  }
  if (!validTimestamp(approval.approvedAt)) {
    throw new Error('Production approval receipt approvedAt is missing, invalid, or future-dated');
  }
  if (approval.releaseManifestSha256 !== digest(manifestPath)) {
    throw new Error('Production approval receipt is not bound to this release manifest');
  }
  for (const field of ['packageLockSha256', 'baselineManifestSha256', 'repositoryTreeSha256']) {
    if (approval.sourceFingerprint?.[field] !== manifest.sourceFingerprint?.[field]) {
      throw new Error(`Production approval receipt source fingerprint mismatch: ${field}`);
    }
  }
  if (!sha256Pattern.test(approval.evidenceSha256 ?? '')) {
    throw new Error('Production approval receipt evidenceSha256 is missing or invalid');
  }
  if (!validTimestamp(approval.evidenceGeneratedAt)) {
    throw new Error('Production approval receipt evidenceGeneratedAt is missing, invalid, or future-dated');
  }
  const ota = approval.otaDigestVerification;
  if (
    !ota ||
    typeof ota.deviceId !== 'string' ||
    ota.deviceId.trim().length === 0 ||
    !validTimestamp(ota.executedAt) ||
    !sha256Pattern.test(ota.artifactSha256 ?? '') ||
    !sha256Pattern.test(ota.deviceObservedSha256 ?? '') ||
    ota.artifactSha256.toLowerCase() !== ota.deviceObservedSha256.toLowerCase()
  ) {
    throw new Error('Production approval receipt OTA digest proof is invalid');
  }
}

const packageJson = JSON.parse(
  readFileSync(resolve(releaseRoot, 'package.json'), 'utf8'),
);
if (packageJson.workspaces !== undefined) {
  throw new Error('Backend release must not retain workspace metadata');
}
if (packageJson.engines?.node !== '>=22 <23') {
  throw new Error('Release Node.js engine must remain >=22 <23');
}
if (packageJson.scripts?.start !== 'node dist/main.js') {
  throw new Error('Release start command is invalid');
}

console.log(`Verified production release: ${relative(root, releaseRoot)}`);
console.log(`Verified manifest entries: ${manifest.files.length}`);
console.log(`Production approval receipt: ${approvalExists ? 'VALID' : 'ABSENT (integrity-only artifact)'}`);
