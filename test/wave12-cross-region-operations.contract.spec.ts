import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 12, fourth slice: cross-region operations.
 *
 * Wave 11's detectors (anomaly, health, risk, energy) all scope their findings to a DEVICE, and every
 * device has had a nullable regionId since ADR-009. Nothing joins those two: an operator whose fleet spans
 * regions cannot ask "which region is in trouble", and a per-region dashboard today would have to be built
 * by hand in SQL.
 *
 * The obvious shortcut -- group by region and present the numbers -- would be wrong in a specific way. A
 * device that was never assigned to a region does not belong to zero regions; it is unplaced, and dropping
 * it into a bucket silently reports a fleet as smaller than it is. So the rollup reports an explicit
 * unplaced count and refuses to present a partial region as a complete one.
 *
 * Still NOT in this slice: automatic cross-region failover, load balancing between regions, or any routing
 * decision. This is reporting over real findings, and anything that MOVES traffic needs its own decision.
 */

const service = read('src/analytics/cross-region-operations.service.ts');
const adr = read('docs/phoenix/adr/ADR-012-cross-region-operations-reporting.md');

describe('Wave 12 cross-region operations', () => {
  describe('ADR', () => {
    it('is decided explicitly with its refusals', () => {
      expect(adr).toMatch(/^# ADR-012/m);
      expect(adr).toMatch(/## Decision/);
      expect(adr).toMatch(/## Safety Boundaries/);
    });

    it('explicitly does not claim failover or routing', () => {
      expect(adr).toMatch(/failover|routing/i);
    });
  });

  describe('unplaced devices are counted, not hidden', () => {
    it('reports them separately rather than dropping them', () => {
      expect(service).toMatch(/unplaced/i);
    });

    it('says so when the region totals are incomplete', () => {
      expect(service).toMatch(/incomplete|does not cover|partial/i);
    });

    it('never assigns a device to a region it was not assigned to', () => {
      expect(service).not.toMatch(/regionId\s*:\s*['\"]/);
    });
  });

  describe('per-region rollup', () => {
    it('carries the region code and timezone so a row is self-describing', () => {
      expect(service).toMatch(/regionCode/);
      expect(service).toMatch(/timezone/);
    });

    it('counts findings by severity rather than flattening them', () => {
      expect(service).toMatch(/severity/i);
    });

    it('bounds every query it runs', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });
  });

  describe('tenant isolation', () => {
    it('requires a tenant on the reporting path', () => {
      expect(service).toMatch(/tenantId is required/);
    });

    it('scopes the findings read to the tenant', () => {
      expect(service).toMatch(/tenantId/);
    });

    it('never aggregates across tenants', () => {
      expect(service).not.toMatch(/groupBy[\s\S]{0,200}tenantId:\s*undefined/);
    });
  });

  describe('it does not invent a fleet', () => {
    it('does not fabricate a region that does not exist', () => {
      expect(service).not.toMatch(/mock|simulate|fake/i);
      expect(service).not.toMatch(/Math\.random/);
    });

    it('does not claim a device is healthy when nothing was observed', () => {
      expect(service).toMatch(/no observation|did not report|unobserved/i);
    });
  });
});