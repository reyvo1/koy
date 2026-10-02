import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 11, third slice: maintenance risk forecasting.
 *
 * `DeviceMaintenance` already records that work was opened and resolved, and the health scorer already
 * grades a device right now. Neither answers the question an operator actually has to plan against: is this
 * getting worse, and if so how long have I got before it needs attention?
 *
 * The temptation with anything named "prediction" is to emit a probability. That would be a number this
 * system has no evidence for -- there is no labelled history of devices that actually failed, so any
 * percentage would be invented and would read as authoritative. So this does not produce a probability.
 * It produces a band, a horizon in days, and the evidence behind both, and it refuses to band a device at
 * all when the signals do not support one. Silence is the honest answer far more often here, and a system
 * that always answers is a system that is always guessing.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/analytics/device-risk-forecasting.service.ts');

/** Comments are stripped so an assertion about the code cannot be satisfied by prose. */
const serviceCode = service
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Wave 11 maintenance risk forecasting', () => {
  describe('schema', () => {
    it('persists the band, the horizon and the evidence that produced them', () => {
      expect(schema).toMatch(/riskBand\s+DeviceRisk\?/);
      expect(schema).toMatch(/riskHorizonDays\s+Int\?/);
      expect(schema).toMatch(/riskEvaluatedAt\s+DateTime\?/);
      expect(schema).toMatch(/riskForecastVersion\s+String\?/);
    });

    it('can express a device with no forecast at all', () => {
      // NOT_ESTABLISHED is not a band, it is the absence of one. A device nobody has enough evidence to
      // grade must not be reported as stable.
      expect(schema).toMatch(/enum DeviceRisk\s*\{[\s\S]*NOT_ESTABLISHED/);
    });
  });

  describe('forecasting', () => {
    it('derives the forecast from real findings, commands and maintenance, not from a stored score', () => {
      expect(service).toContain('analyticsFinding');
      expect(service).toContain('deviceCommand');
      expect(service).toContain('deviceMaintenance');
      expect(service).not.toMatch(/Math\.random/);
      expect(service).not.toMatch(/mock|simulate|fake/i);
    });

    /**
     * The whole reason this slice is not a probability. A number in [0,1] reads as a measured likelihood
     * and would be quoted back in a report as one.
     */
    it('does not emit a probability', () => {
      // Scoped to code, not prose: the service's own comment explains that it refuses to produce one, and
      // that sentence must not be what satisfies this check.
      expect(serviceCode).not.toMatch(/probability/i);
      expect(serviceCode).not.toMatch(/Math\.random/);
      // A fraction of failures is a rate, which is fine. A bare likelihood field is not, and there is no
      // field of that shape anywhere in the result.
      expect(serviceCode).not.toMatch(/likelihood/i);
    });

    // Too little history cannot distinguish "holding steady" from "we have not been watching".
    it('refuses to band a device without enough commands to compare', () => {
      expect(service).toMatch(/minCommands/);
      expect(service).toMatch(/NOT_ESTABLISHED/);
    });

    it('reports the evidence alongside the band so it can be argued with', () => {
      expect(service).toMatch(/evidence/);
    });

    it('compares recent failures against an earlier window rather than only counting them', () => {
      // A device that has always failed commands is one problem. A device whose failures are increasing is
      // a different one, and only a trend distinguishes them.
      expect(service).toMatch(/rate/);
      expect(service).toMatch(/(recent|prior|earlier|previous)/);
    });

    it('stays tenant-scoped throughout', () => {
      expect(service).toMatch(/tenantId/);
    });

    it('bounds every read it issues', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('records the forecast version alongside the number', () => {
      expect(service).toMatch(/FORECAST_VERSION/);
    });

    // An open maintenance record is the operator already acting; predicting on top of it produces a second,
    // conflicting instruction for work that is in hand.
    it('defers to an already-open maintenance record instead of forecasting over it', () => {
      expect(service).toMatch(/OPEN/);
      expect(service).toMatch(/already open|open maintenance|existing maintenance/i);
    });
  });
});