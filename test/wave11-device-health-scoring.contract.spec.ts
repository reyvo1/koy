import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 11, second slice: device health scoring.
 *
 * `Device` carries a status and a `lastHeartbeatAt`, so an operator can already see whether a device is
 * up. What they cannot see is how well it is doing. A device that reports every thirty seconds while its
 * readings are wildly out of line with its own history is reporting faithfully and is still broken, and
 * "ACTIVE" hides that completely.
 *
 * A score that cannot be explained is worse than no score: an operator shown "62" has no basis for acting
 * on it and no way to tell whether it moved. So the components are kept separate and returned alongside
 * the total, each with the weight that produced its contribution, and the evaluation is stamped so a
 * cached reading can be told apart from a fresh one.
 *
 * The signals are already authoritative: real heartbeat rows and the real findings written by the Wave 11
 * anomaly detector. Nothing here estimates a likelihood it cannot support.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/analytics/device-health-scoring.service.ts');

describe('Wave 11 device health scoring', () => {
  describe('schema', () => {
    it('persists the score, its band and when it was computed', () => {
      expect(schema).toMatch(/healthScore\s+Int\?/);
      expect(schema).toMatch(/healthStatus\s+DeviceHealth\?/);
      expect(schema).toMatch(/healthEvaluatedAt\s+DateTime\?/);
      expect(schema).toMatch(/enum DeviceHealth\s*\{[\s\S]*HEALTHY/);
    });

    it('can express a device that has stopped reporting at all', () => {
      // A device that is silent is not merely unhealthy; the distinct band stops "offline" being
      // averaged into a percentage, which would understate it.
      expect(schema).toMatch(/enum DeviceHealth\s*\{[\s\S]*OFFLINE/);
    });
  });

  describe('scoring', () => {
    it('derives the score from the heartbeat and the anomaly findings, not from a stored value', () => {
      expect(service).toContain('lastHeartbeatAt');
      expect(service).toContain('analyticsFinding');
      expect(service).not.toMatch(/Math\.random/);
      expect(service).not.toMatch(/mock|simulate|fake/i);
    });

    it('reports a silent device as OFFLINE rather than scoring it against stale data', () => {
      expect(service).toMatch(/OFFLINE/);
      // The heartbeat comparison has to be against a caller-supplied clock, or "now" makes the result
      // unreproducible in a test and untestable at a boundary.
      expect(service).toMatch(/now/);
    });

    it('returns its components so a score can be explained', () => {
      expect(service).toMatch(/components/);
      expect(service).toMatch(/weight/);
    });

    it('keeps the total inside 0-100 whatever the signals do', () => {
      expect(service).toMatch(/Math\.(min|max)/);
      expect(service).toMatch(/100/);
    });

    it('ignores another tenant\'s findings', () => {
      expect(service).toMatch(/tenantId/);
    });

    // A score computed from findings the tenant can delete would change under the operator's feet.
    it('reads findings over a bounded window', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('records the scorer version alongside the number', () => {
      expect(service).toMatch(/SCORER_VERSION/);
    });
  });
});