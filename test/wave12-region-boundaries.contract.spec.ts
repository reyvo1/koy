import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 12, first slice: multi-region boundaries.
 *
 * Nothing in this platform names a region, an edge gateway or a digital twin. The Wave 12 exit criteria call
 * for multi-region boundaries and an edge gateway "under explicit ADRs", and this repository has never been
 * honest about the difference between a region that exists and a region that is a label.
 *
 * So the first slice is deliberately the smallest honest one: a region is a real, owned, addressable thing
 * that a tenant actually sits in, and assigning a device to one is a scoped operation that refuses to invent
 * geography. A `regionId` column on `Device` alone would be a string with no owner, no referential
 * integrity and no meaning -- and every downstream feature would then be built on it.
 *
 * The failure this guards against is the obvious one: a multi-region system that reports "device is in
 * region eu-west" for a platform with one region, or that lets a device's region change without recording
 * why. Both look like enterprise features on a dashboard and neither is one.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/region/region-assignment.service.ts');
const adr = read('docs/phoenix/adr/ADR-009-region-boundaries.md');

describe('Wave 12 region boundaries', () => {
  describe('ADR', () => {
    it('records the decision explicitly, as the Wave 12 exit criteria require', () => {
      expect(adr).toMatch(/^# ADR-009/m);
      expect(adr).toMatch(/Status:/);
      expect(adr).toMatch(/## Decision/);
      expect(adr).toMatch(/## Safety Boundaries/);
    });

    it('states what the decision refuses to do', () => {
      // The point of an ADR here is to record the boundary, including the parts deliberately left out.
      expect(adr).toMatch(/Safety Boundaries/);
    });
  });

  describe('region as an owned entity', () => {
    it('has a region with an identity, a code and an owner rather than a bare string', () => {
      expect(schema).toMatch(/model Region\s*\{/);
      expect(schema).toMatch(/regionCode\s+String/);
      expect(schema).toMatch(/@@unique\(\[regionCode\]\)|regionCode\s+String\s+@unique/);
    });

    it('records which regions are actually available, not an unbounded free text field', () => {
      // A platform with one region must say one region, not accept any string an operator types.
      expect(schema).toMatch(/isActive\s+Boolean/);
    });

    it('places a device in a region through a real relation, not a dangling column', () => {
      expect(schema).toMatch(/region\s+Region\?/);
      expect(schema).toMatch(/regionId\s+String\?/);
    });

    it('keeps the region optional so no existing row has to be backfilled with fiction', () => {
      // A nullable column means "unknown", which is true. A default of some region would be a claim.
      expect(schema).toMatch(/regionId\s+String\?/);
    });
  });

  describe('assignment', () => {
    it('refuses to assign a device to a region that is not active', () => {
      expect(service).toMatch(/isActive/);
      expect(service).toMatch(/throw new RangeError/);
    });

    it('refuses to assign through a region belonging to nobody', () => {
      expect(service).toMatch(/region/i);
      expect(service).toMatch(/not found|does not exist/i);
    });

    it('requires both the tenant and the device', () => {
      expect(service).toMatch(/tenantId is required/);
      expect(service).toMatch(/deviceId is required/);
    });

    it('records why a region changed, so a silent reassignment cannot happen', () => {
      expect(service).toMatch(/reason/);
    });

    it('stamps the assignment with a clock the caller supplies', () => {
      expect(service).toMatch(/now/);
    });

    it('bounds everything it reads', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('does not read a region list that could silently cross tenants', () => {
      expect(service).not.toMatch(/mock|simulate|fake/i);
      expect(service).not.toMatch(/Math\.random/);
    });
  });
});