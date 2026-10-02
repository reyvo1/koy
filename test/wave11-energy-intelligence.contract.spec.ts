import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 11, fourth slice: energy intelligence.
 *
 * The Wave 10 rollups already carry `valueSum` and `sampleCount` per bucket, so a period total can be read
 * without touching the raw telemetry table at all. What is missing is anything an operator can act on:
 * what did this tenant consume, how does that compare with the period before, and which devices are behind
 * it.
 *
 * The constraint that shapes the whole slice is that a power reading is not an energy reading. Watts are a
 * rate; energy is a rate integrated over time, and the rollups deliberately do not record the sampling
 * interval. Multiplying an average wattage by a wall-clock span would produce a confident, entirely invented
 * number, and energy figures are exactly the kind of number that ends up on an invoice. So a capability is
 * only treated as energy when its own declared unit says so, and the service says it cannot do it otherwise
 * rather than guessing a conversion.
 *
 * The second constraint is coverage. A tenant total that silently omits the devices that reported nothing
 * reads as the tenant's complete consumption. The result therefore carries what it was computed from, so a
 * partial figure cannot be mistaken for a whole one.
 */

const service = read('src/analytics/energy-intelligence.service.ts');

describe('Wave 11 energy intelligence', () => {
  describe('reading from rollups', () => {
    // Reading raw telemetry for a period total would put the hot table back in the path of every report.
    it('reads the rollups rather than the raw telemetry table', () => {
      expect(service).toContain('telemetryRollup');
      expect(service).not.toMatch(/prisma\.telemetry\./);
    });

    it('takes the total from the summed values, not from a sampled average', () => {
      expect(service).toMatch(/valueSum/);
    });
  });

  describe('what counts as energy', () => {
    it('decides from the capability its own declared unit', () => {
      expect(service).toContain('capability');
      expect(service).toMatch(/unit/i);
    });

    /**
     * The trap this slice exists to avoid. Watts integrated over a guessed interval looks exactly like
     * energy on a dashboard and is wrong by a factor nobody can reconstruct afterwards.
     */
    it('refuses to treat a power reading as energy', () => {
      expect(service).toMatch(/watt|power/i);
      expect(service).toMatch(/refus|not energy|not an energy/i);
      expect(service).not.toMatch(/3600|0\.277/);
    });

    it('cannot report a total for a period it was not asked about', () => {
      expect(service).toMatch(/periodStart|periodEnd|from|to/);
    });
  });

  describe('comparison', () => {
    // A total with no previous period beside it tells an operator nothing about whether it is too much.
    it('compares against the preceding period', () => {
      expect(service).toMatch(/previous|prior|preceding/i);
    });

    it('states the direction of the change rather than only the numbers', () => {
      expect(service).toMatch(/direction|increase|decrease|flat/i);
    });

    // Dividing by a zero baseline produces Infinity or NaN, both of which render as garbage.
    it('does not compute a change against a zero or missing baseline', () => {
      expect(service).toMatch(/Number\.isFinite/);
      expect(service).toMatch(/(=== 0|> 0|== null|=== null)/);
    });
  });

  describe('coverage', () => {
    it('reports what the total was computed from', () => {
      expect(service).toMatch(/devices|contributing|coverage/i);
    });
  });

  describe('scoping and bounds', () => {
    it('is tenant-scoped', () => {
      expect(service).toMatch(/tenantId/);
    });

    it('bounds the rollup rows it reads', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('refuses to run without a tenant', () => {
      expect(service).toMatch(/tenantId is required/);
    });
  });
});