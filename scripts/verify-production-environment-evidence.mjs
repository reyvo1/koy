#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const fileArg = argv.find((value) => value.startsWith('--file='));
const file = path.resolve(fileArg ? fileArg.slice('--file='.length) : process.env.PRODUCTION_ENVIRONMENT_EVIDENCE ?? 'production-environment-evidence.json');
const sha256Pattern = /^[a-f0-9]{64}$/;
const maxEvidenceAgeMs = 24 * 60 * 60 * 1000;
function fail(message) { console.error(`FAIL  ${message}`); process.exit(1); }
function validTimestamp(value) { if (typeof value !== 'string' || !value) return false; const time = Date.parse(value); return Number.isFinite(time) && time <= Date.now() + 5 * 60 * 1000; }
if (!existsSync(file)) fail(`production environment evidence is missing: ${file}`);
let evidence;
try { evidence = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`production environment evidence is not valid JSON: ${error.message}`); }
if (evidence.schemaVersion !== 1 || evidence.gate !== 'PRODUCTION_ENVIRONMENT' || evidence.status !== 'APPROVED') fail('production environment evidence contract is invalid');
if (!validTimestamp(evidence.observedAt)) fail('production environment evidence observedAt is invalid or future-dated');
if (Date.now() - Date.parse(evidence.observedAt) > maxEvidenceAgeMs) fail('production environment evidence is older than 24 hours; recapture target-environment checks before deployment');
for (const field of ['releaseManifestSha256','runtimeEnvSha256','backupEnvSha256']) {
  if (!sha256Pattern.test(evidence[field] ?? '')) fail(`production environment evidence ${field} is missing or invalid`);
}
const local = evidence.localChecks;
if (!local || local.nodeMajor !== 22 || local.vmOvercommitMemory !== 1 || local.runtimeFeaturesEnabled !== true || local.runtimeEnvironmentProtected !== true || local.backupEnvironmentProtected !== true || local.secretPlaceholdersAbsent !== true) {
  fail('production environment local checks are incomplete or not PASS');
}
const external = evidence.externalChecks;
for (const field of ['mqttAclVerified','mqttCaHostnameVerified','dnsTlsVerified','offHostBackupVerified','monitoringAccessVerified']) {
  if (external?.[field] !== true) fail(`production environment external check is not PASS: ${field}`);
}
for (const field of ['backupOwner','monitoringOwner','rollbackOwner','reviewedBy']) {
  const value = external?.[field];
  if (typeof value !== 'string' || value.trim().length < 2 || /^REPLACE_/i.test(value)) fail(`production environment owner/reviewer is missing: ${field}`);
}
if (typeof external?.publicOrigin !== 'string' || !external.publicOrigin.startsWith('https://')) fail('production environment publicOrigin must be https://');
let publicOrigin; try { publicOrigin = new URL(external.publicOrigin); } catch { fail('production environment publicOrigin is not a valid URL'); }
const host = publicOrigin.hostname.toLowerCase();
if (host === 'example.com' || host.endsWith('.example.com') || host === 'example.org' || host.endsWith('.example.org') || host === 'example.net' || host.endsWith('.example.net')) fail('production environment publicOrigin must not use a reserved example domain');
console.log(`PASS  production environment evidence verified: ${file}`);
