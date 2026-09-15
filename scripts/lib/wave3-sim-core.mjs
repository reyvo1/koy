import { createHash } from 'node:crypto';
import https from 'node:https';

export class CommandDedupeCache {
  constructor(limit = 8) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('limit must be a positive integer');
    this.limit = limit;
    this.order = [];
    this.results = new Map();
  }

  observe(commandId) {
    if (!commandId || typeof commandId !== 'string') throw new Error('commandId is required');
    const existing = this.results.get(commandId);
    if (existing) return { duplicate: true, ...existing };
    return { duplicate: false };
  }

  record(commandId, success, reason = '') {
    if (!this.results.has(commandId)) {
      this.order.push(commandId);
      while (this.order.length > this.limit) {
        const evicted = this.order.shift();
        this.results.delete(evicted);
      }
    }
    const result = { success: Boolean(success), reason: String(reason ?? '') };
    this.results.set(commandId, result);
    return result;
  }
}

export class OtaSlotModel {
  constructor(active = 'A') {
    this.active = active;
    this.previous = null;
    this.staged = null;
    this.pendingVerify = false;
  }

  stageVerified(slot) {
    if (!slot || slot === this.active) throw new Error('verified OTA must target inactive slot');
    this.staged = slot;
  }

  rebootIntoStaged() {
    if (!this.staged) throw new Error('no verified OTA image staged');
    this.previous = this.active;
    this.active = this.staged;
    this.staged = null;
    this.pendingVerify = true;
  }

  confirmLiveReconnect() {
    if (!this.pendingVerify) return false;
    this.pendingVerify = false;
    this.previous = null;
    return true;
  }

  rebootWithoutConfirmation() {
    if (!this.pendingVerify) return false;
    if (!this.previous) throw new Error('rollback target missing');
    this.active = this.previous;
    this.previous = null;
    this.pendingVerify = false;
    return true;
  }
}

export async function downloadAndVerifyHttps(url, expectedSha256, { ca, timeoutMs = 10_000 } = {}) {
  if (!/^https:\/\//i.test(url)) throw new Error('OTA_URL_NOT_HTTPS');
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 ?? '')) throw new Error('OTA_SHA256_INVALID');
  if (!ca) throw new Error('OTA_CA_REQUIRED');

  return await new Promise((resolve, reject) => {
    let settled = false;
    const hash = createHash('sha256');
    let bytes = 0;
    let declaredLength = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const req = https.get(url, { ca, rejectUnauthorized: true }, (res) => {
      const status = res.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        res.resume();
        finish(new Error(`OTA_HTTP_${status}`));
        return;
      }
      const rawLength = res.headers['content-length'];
      if (rawLength !== undefined) {
        const parsed = Number(rawLength);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          res.resume();
          finish(new Error('OTA_CONTENT_LENGTH_INVALID'));
          return;
        }
        declaredLength = parsed;
      }

      res.on('data', (chunk) => {
        bytes += chunk.length;
        hash.update(chunk);
      });
      res.on('aborted', () => finish(new Error('OTA_STREAM_ABORTED')));
      res.on('error', (error) => finish(new Error(`OTA_STREAM_ERROR:${error.code ?? error.message}`)));
      res.on('end', () => {
        if (declaredLength !== null && bytes !== declaredLength) {
          finish(new Error('OTA_STREAM_TRUNCATED'));
          return;
        }
        if (bytes === 0) {
          finish(new Error('OTA_EMPTY_ARTIFACT'));
          return;
        }
        const actualSha256 = hash.digest('hex');
        if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
          finish(new Error('OTA_SHA256_MISMATCH'));
          return;
        }
        finish(null, { bytes, sha256: actualSha256 });
      });
    });

    req.on('error', (error) => finish(new Error(`OTA_NETWORK:${error.code ?? error.message}`)));
    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error('OTA_TIMEOUT'));
    }, timeoutMs);
  });
}
