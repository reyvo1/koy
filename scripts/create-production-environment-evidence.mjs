#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (name) => argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const releaseRoot = path.resolve(arg('release') ?? process.env.RELEASE_OUTPUT_DIR ?? 'artifacts/iot-platform-release');
const runtimeEnvPath = path.resolve(arg('env') ?? '/etc/iot-platform/iot-platform.env');
const backupEnvPath = path.resolve(arg('backup-env') ?? '/etc/iot-platform/iot-platform-backup.env');
const attestationPath = path.resolve(arg('attestation') ?? 'ops/production/environment-attestation.json');
const outputPath = path.resolve(arg('output') ?? 'production-environment-evidence.json');
const fixtureMode = process.env.PRODUCTION_PREFLIGHT_SELF_TEST === '1';
const procOvercommitPath = fixtureMode && arg('proc-overcommit') ? path.resolve(arg('proc-overcommit')) : '/proc/sys/vm/overcommit_memory';

function fail(message) { console.error(`BLOCKED  ${message}`); process.exit(1); }
function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex'); }
function loadJson(file, label) { if (!existsSync(file)) fail(`${label} is missing: ${file}`); try { return JSON.parse(readFileSync(file,'utf8')); } catch (error) { fail(`${label} is not valid JSON: ${error.message}`); } }
function parseEnv(file, label) {
  if (!existsSync(file)) fail(`${label} is missing: ${file}`);
  const result = {};
  for (const raw of readFileSync(file,'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('='); if (idx <= 0) fail(`${label} contains malformed line: ${raw}`);
    const key = line.slice(0, idx).trim(); let value = line.slice(idx+1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    result[key]=value;
  }
  return result;
}
function requireValue(env, key, label) { const value = env[key]; if (typeof value !== 'string' || value.trim()==='') fail(`${key} is required in ${label}`); return value.trim(); }
function requireSecret(env,key,label) { const value=requireValue(env,key,label); if (/REPLACE_|change[_-]?me|placeholder/i.test(value) || value.length < 32) fail(`${key} is placeholder/too weak in ${label}`); return value; }
function requireBooleanTrue(env,key,label) { if (requireValue(env,key,label).toLowerCase() !== 'true') fail(`${key}=true is required for production approval in ${label}`); }
function rejectReservedExampleHost(url, label) {
  const host = url.hostname.toLowerCase();
  if (host === 'example.com' || host.endsWith('.example.com') || host === 'example.org' || host.endsWith('.example.org') || host === 'example.net' || host.endsWith('.example.net')) {
    fail(`${label} must not use a reserved example domain`);
  }
}
function requireProtected(file, expectedOwner) {
  const mode = (statSync(file).mode & 0o777).toString(8).padStart(4,'0');
  if (mode !== '0640') fail(`${file} must have mode 0640; got ${mode}`);
  if (!fixtureMode) {
    const result = spawnSync('stat',['-c','%U:%G',file],{encoding:'utf8'});
    if (result.status !== 0) fail(`could not determine owner for ${file}`);
    if (result.stdout.trim() !== expectedOwner) fail(`${file} must be owned by ${expectedOwner}; got ${result.stdout.trim()}`);
  }
}
function assertLoopbackUrl(value, schemes, label) {
  let url; try { url = new URL(value); } catch { fail(`${label} is not a valid URL`); }
  if (!schemes.includes(url.protocol)) fail(`${label} must use ${schemes.join(' or ')}`);
  if (!['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname)) fail(`${label} must target loopback for the single-VPS production topology`);
  if (!url.password || /REPLACE_|change[_-]?me|placeholder/i.test(url.password)) fail(`${label} must contain a non-placeholder credential`);
  return url;
}

const manifestPath = path.join(releaseRoot,'release-manifest.json');
const manifest = loadJson(manifestPath,'release manifest');
if (manifest.schemaVersion !== 1 || !manifest.sourceFingerprint) fail('release manifest contract is invalid');
const runtimeEnv = parseEnv(runtimeEnvPath,'runtime environment');
const backupEnv = parseEnv(backupEnvPath,'backup environment');
const attestation = loadJson(attestationPath,'production environment attestation');
if (attestation.schemaVersion !== 1 || attestation.environment !== 'production') fail('production environment attestation contract is invalid');
for (const key of ['mqttAclVerified','mqttCaHostnameVerified','dnsTlsVerified','offHostBackupVerified','monitoringAccessVerified']) if (attestation[key] !== true) fail(`operator attestation is not PASS: ${key}`);
for (const key of ['backupOwner','monitoringOwner','rollbackOwner','reviewedBy']) { const value=attestation[key]; if (typeof value !== 'string' || value.trim().length<2 || /^REPLACE_/i.test(value)) fail(`operator attestation is missing ${key}`); }
if (typeof attestation.publicOrigin !== 'string' || !attestation.publicOrigin.startsWith('https://')) fail('operator attestation publicOrigin must use https://');
let attestedOrigin; try { attestedOrigin = new URL(attestation.publicOrigin); } catch { fail('operator attestation publicOrigin is not a valid URL'); }
rejectReservedExampleHost(attestedOrigin, 'operator attestation publicOrigin');

if (process.version.split('.')[0] !== 'v22' && !fixtureMode) fail(`Node.js 22 is required; got ${process.version}`);
if (!existsSync(procOvercommitPath) || readFileSync(procOvercommitPath,'utf8').trim() !== '1') fail('vm.overcommit_memory must equal 1 before production approval');
requireProtected(runtimeEnvPath,'root:iot-platform');
requireProtected(backupEnvPath,'root:postgres');
if (requireValue(runtimeEnv,'NODE_ENV','runtime environment') !== 'production') fail('NODE_ENV=production is required');
if (requireValue(runtimeEnv,'HOST','runtime environment') !== '127.0.0.1') fail('HOST=127.0.0.1 is required for the single-VPS production topology');
if (requireValue(runtimeEnv,'SWAGGER_ENABLED','runtime environment').toLowerCase() !== 'false') fail('SWAGGER_ENABLED=false is required in production');
for (const key of ['SCHEDULER_RUNTIME_ENABLED','AUTOMATION_RUNTIME_ENABLED','NOTIFICATION_RUNTIME_ENABLED']) requireBooleanTrue(runtimeEnv,key,'runtime environment');
for (const key of ['JWT_SECRET','MQTT_WEBHOOK_SECRET','METRICS_ACCESS_TOKEN','MQTT_PASSWORD','EMAIL_RELAY_TOKEN']) requireSecret(runtimeEnv,key,'runtime environment');
const mqttUsername = requireValue(runtimeEnv,'MQTT_USERNAME','runtime environment'); if (/REPLACE_|change[_-]?me|placeholder/i.test(mqttUsername)) fail('MQTT_USERNAME is placeholder in runtime environment');
assertLoopbackUrl(requireValue(runtimeEnv,'DATABASE_URL','runtime environment'),['postgresql:','postgres:'],'DATABASE_URL');
assertLoopbackUrl(requireValue(runtimeEnv,'REDIS_URL','runtime environment'),['redis:','rediss:'],'REDIS_URL');
const mqtt = new URL(requireValue(runtimeEnv,'MQTT_BROKER_URL','runtime environment')); if (mqtt.protocol !== 'mqtts:') fail('MQTT_BROKER_URL must use mqtts://'); rejectReservedExampleHost(mqtt,'MQTT_BROKER_URL');
const relay = new URL(requireValue(runtimeEnv,'EMAIL_RELAY_URL','runtime environment')); if (relay.protocol !== 'https:' || relay.username || relay.password) fail('EMAIL_RELAY_URL must be credential-free https://'); rejectReservedExampleHost(relay,'EMAIL_RELAY_URL');
requireValue(runtimeEnv,'EMAIL_FROM','runtime environment');
const origins = requireValue(runtimeEnv,'CORS_ALLOWED_ORIGINS','runtime environment').split(',').map(v=>v.trim()).filter(Boolean); if (!origins.includes(attestation.publicOrigin)) fail('attested publicOrigin must be present in CORS_ALLOWED_ORIGINS');
for (const origin of origins) if (!origin.startsWith('https://')) fail('all production CORS origins must use https://');
if (runtimeEnv.MQTT_CA_FILE) { const ca=path.resolve(runtimeEnv.MQTT_CA_FILE); if (!existsSync(ca) && !fixtureMode) fail(`MQTT_CA_FILE does not exist: ${ca}`); }
assertLoopbackUrl(requireValue(backupEnv,'DATABASE_URL','backup environment'),['postgresql:','postgres:'],'backup DATABASE_URL');
const retention = Number(requireValue(backupEnv,'BACKUP_RETENTION_DAYS','backup environment')); if (!Number.isInteger(retention) || retention < 35) fail('BACKUP_RETENTION_DAYS must be at least 35 for production approval');
requireValue(backupEnv,'BACKUP_GPG_RECIPIENT','backup environment');
const backupDir = requireValue(backupEnv,'BACKUP_DIR','backup environment'); if (!path.isAbsolute(backupDir)) fail('BACKUP_DIR must be absolute');

const evidence = {
  schemaVersion:1, gate:'PRODUCTION_ENVIRONMENT', status:'APPROVED', observedAt:new Date().toISOString(),
  releaseManifestSha256: sha256(manifestPath), runtimeEnvSha256: sha256(runtimeEnvPath), backupEnvSha256: sha256(backupEnvPath),
  localChecks:{ nodeMajor:22, vmOvercommitMemory:1, runtimeFeaturesEnabled:true, runtimeEnvironmentProtected:true, backupEnvironmentProtected:true, secretPlaceholdersAbsent:true },
  externalChecks:{ publicOrigin:attestation.publicOrigin, mqttAclVerified:true, mqttCaHostnameVerified:true, dnsTlsVerified:true, offHostBackupVerified:true, monitoringAccessVerified:true, backupOwner:attestation.backupOwner.trim(), monitoringOwner:attestation.monitoringOwner.trim(), rollbackOwner:attestation.rollbackOwner.trim(), reviewedBy:attestation.reviewedBy.trim() }
};
writeFileSync(outputPath, `${JSON.stringify(evidence,null,2)}\n`, { mode:0o640 });
console.log(`PASS  production environment preflight evidence written: ${outputPath}`);
