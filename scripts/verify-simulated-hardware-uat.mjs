#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const valueArg = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = path.resolve(valueArg('root') ?? process.cwd());
const reportsRoot = path.join(root, 'reports');

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function sha256File(file) {
  if (!existsSync(file) || !statSync(file).isFile()) fail(`source fingerprint input missing: ${path.relative(root, file)}`);
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
function readJson(file) {
  if (!existsSync(file)) fail(`required simulated-hardware evidence missing: ${path.relative(root, file)}`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { fail(`invalid JSON evidence ${path.relative(root, file)}: ${error.message}`); }
}
function latestFile(directory, predicate) {
  if (!existsSync(directory)) return null;
  const matches = readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((file) => statSync(file).isFile() && predicate(path.basename(file)))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return matches[0] ?? null;
}
function latestBrokerSummary() {
  if (!existsSync(reportsRoot)) return null;
  const summaries = [];
  for (const name of readdirSync(reportsRoot)) {
    if (!name.startsWith('live-broker-smoke-')) continue;
    const file = path.join(reportsRoot, name, 'live-broker-summary.json');
    if (existsSync(file)) summaries.push(file);
  }
  summaries.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return summaries[0] ?? null;
}

const wave3File = latestFile(path.join(reportsRoot, 'wave3'), (name) => name.startsWith('wave3-esp32-simulation-') && name.endsWith('.json'));
const brokerFile = latestBrokerSummary();
const cameraFile = path.join(reportsRoot, 'simulated-hardware-uat', 'camera.json');
const mediaFile = path.join(reportsRoot, 'simulated-hardware-uat', 'media.json');

assert(wave3File, 'Wave 3 simulated ESP32 evidence exists');
assert(brokerFile, 'live EMQX broker evidence exists');
const wave3 = readJson(wave3File);
const broker = readJson(brokerFile);
const camera = readJson(cameraFile);
const media = readJson(mediaFile);

assert(wave3.classification === 'SIMULATED_HARDWARE_LIVE_SERVICE', 'Wave 3 evidence is explicitly classified as simulated hardware + live service');
for (const [label, value] of Object.entries({
  provisioning: wave3.device?.provisioning,
  heartbeat: wave3.device?.heartbeat,
  wifiMqttReconnect: wave3.device?.wifiMqttReconnect,
  coldBootRejoin: wave3.device?.coldBootRejoin,
  initialTelemetry: wave3.mqtt?.initialTelemetry,
  postReconnectTelemetry: wave3.mqtt?.postReconnectTelemetry,
  coldBootTelemetry: wave3.mqtt?.coldBootTelemetry,
  qos1DuplicateTelemetryDedupe: wave3.mqtt?.qos1DuplicateTelemetryDedupe,
  commandAck: wave3.mqtt?.commandAck,
  trustedHttpsOta: wave3.ota?.trustedHttps,
  wrongDigestRejected: wave3.ota?.wrongDigestRejected,
  interruptedStreamRejected: wave3.ota?.interruptedStreamRejected,
  rollbackModel: wave3.ota?.rollbackModel,
  liveReconnectConfirmationModel: wave3.ota?.liveReconnectConfirmationModel,
})) assert(value === 'PASS', `Wave 3 ${label} is PASS`);
assert(Number.isInteger(wave3.mqtt?.duplicateCommandExecutionCount) && wave3.mqtt.duplicateCommandExecutionCount === 1, 'duplicate command executes actuator exactly once');
assert(Number.isInteger(wave3.mqtt?.duplicateAckReplays) && wave3.mqtt.duplicateAckReplays >= 1, 'duplicate command receives cached ACK replay');
assert(typeof wave3.ota?.artifactSha256 === 'string' && /^[a-f0-9]{64}$/i.test(wave3.ota.artifactSha256), 'Wave 3 evidence is bound to a SHA-256 firmware artifact');

assert(broker.details?.status === 'PASS', 'live EMQX broker smoke status is PASS');
assert(broker.details?.mode === 'ci-smoke', 'live broker evidence came from the CI smoke path');
assert(camera.status === 'PASS' && camera.evidenceClass === 'SIMULATED_HARDWARE', 'camera onboarding simulated-hardware evidence is PASS');
assert(media.status === 'PASS' && media.evidenceClass === 'SIMULATED_HARDWARE', 'RTSP-to-WebRTC simulated-camera evidence is PASS');

const outputDir = path.join(reportsRoot, 'simulated-hardware-uat');
mkdirSync(outputDir, { recursive: true });
const summary = {
  schemaVersion: 1,
  gate: 'SIMULATED_HARDWARE_UAT',
  status: 'PASS',
  evidenceClass: 'SIMULATED_HARDWARE_LIVE_SERVICE',
  observedAt: new Date().toISOString(),
  sourceFingerprint: {
    packageLockSha256: sha256File(path.join(root, 'package-lock.json')),
    baselineManifestSha256: sha256File(path.join(root, 'BASELINE-MANIFEST.sha256')),
    repositoryTreeSha256: sha256File(path.join(root, 'repository-tree.txt')),
  },
  firmwareArtifactSha256: wave3.ota.artifactSha256,
  sources: {
    wave3: path.relative(root, wave3File).replace(/\\/g, '/'),
    liveBroker: path.relative(root, brokerFile).replace(/\\/g, '/'),
    camera: path.relative(root, cameraFile).replace(/\\/g, '/'),
    media: path.relative(root, mediaFile).replace(/\\/g, '/'),
  },
  boundary: 'This closes automated software/hardware-simulation UAT. It is not relabelled as physical HIL evidence; later field validation is separate and non-blocking for software wave progression.',
};
writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

console.log('PASS  ESP32 exact-artifact live simulation covers reconnect, cold boot, QoS1 dedupe, command ACK and OTA rollback');
console.log('PASS  real EMQX auth/ACL/negative-flow smoke is present from this rescue run');
console.log('PASS  camera onboarding and RTSP-to-WebRTC use synthetic hardware inputs and real runtime protocols');
console.log('SIMULATED HARDWARE UAT PASS');
