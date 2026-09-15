#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createServer } from 'node:https';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CommandDedupeCache,
  OtaSlotModel,
  downloadAndVerifyHttps,
} from './lib/wave3-sim-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cert = readFileSync(path.join(root, 'test/fixtures/wave2-localhost-tls.cert.pem'));
const key = readFileSync(path.join(root, 'test/fixtures/wave2-localhost-tls.key.pem'));
const artifact = Buffer.from('wave3-realistic-firmware-fixture-for-self-test');
const digest = createHash('sha256').update(artifact).digest('hex');

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
}

const cache = new CommandDedupeCache(2);
assert(cache.observe('c1').duplicate === false, 'first command executes exactly once');
cache.record('c1', true, 'ok');
const replay = cache.observe('c1');
assert(replay.duplicate && replay.success === true, 'duplicate command replays cached terminal result');
cache.record('c2', false, 'device-error');
cache.record('c3', true, 'ok');
assert(cache.observe('c1').duplicate === false, 'bounded command cache evicts the oldest command deterministically');

const ota = new OtaSlotModel('A');
ota.stageVerified('B');
ota.rebootIntoStaged();
assert(ota.active === 'B' && ota.pendingVerify, 'verified OTA boots pending confirmation');
ota.rebootWithoutConfirmation();
assert(ota.active === 'A' && !ota.pendingVerify, 'unconfirmed OTA reboot rolls back to previous slot');
ota.stageVerified('B');
ota.rebootIntoStaged();
assert(ota.confirmLiveReconnect() && ota.active === 'B', 'live reconnect confirms the new OTA slot');

const server = createServer({ cert, key }, (req, res) => {
  if (req.url === '/firmware.bin') {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': artifact.length });
    res.end(artifact);
    return;
  }
  if (req.url === '/truncated.bin') {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': artifact.length });
    res.write(artifact.subarray(0, 8));
    res.destroy();
    return;
  }
  res.writeHead(404).end();
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

try {
  const address = server.address();
  const base = `https://127.0.0.1:${address.port}`;
  const good = await downloadAndVerifyHttps(`${base}/firmware.bin`, digest, { ca: cert });
  assert(good.sha256 === digest && good.bytes === artifact.length, 'OTA simulator accepts trusted HTTPS bytes only after SHA-256 matches');

  await downloadAndVerifyHttps(`${base}/firmware.bin`, '0'.repeat(64), { ca: cert })
    .then(() => { throw new Error('wrong digest unexpectedly accepted'); })
    .catch((error) => assert(error.message === 'OTA_SHA256_MISMATCH', 'OTA simulator rejects a wrong SHA-256')); 

  await downloadAndVerifyHttps(`${base}/truncated.bin`, digest, { ca: cert })
    .then(() => { throw new Error('truncated stream unexpectedly accepted'); })
    .catch((error) => assert(/OTA_(STREAM_(ABORTED|ERROR|TRUNCATED)|NETWORK:ECONNRESET)/.test(error.message), 'OTA simulator rejects an interrupted artifact stream'));
} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log('WAVE 3 ESP32 SIMULATION SELF-TEST PASS');
