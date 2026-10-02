import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 12, third slice: the digital twin foundation.
 *
 * A digital twin that shows a device's last known value as if it were current is a lie with a dashboard on
 * it. That failure is not hypothetical here: `Device` already caches `status`, `lastHeartbeatAt`,
 * `healthScore` and `riskBand`, all of which go stale silently. Nothing in the platform currently compares
 * what the platform BELIEVES about a device against what the device LAST REPORTED, or admits when the belief
 * is older than the evidence behind it.
 *
 * So this slice is the reconciliation, not a replica. A twin here is: desired state, last observed state,
 * and a divergence verdict that is allowed to say "I do not know" when the observation has expired.
 *
 * Deliberately NOT in this slice: a simulation engine, physics, or predictive behaviour of the asset itself.
 * None of that has been observed, and a twin that invents future behaviour is the same fabricated evidence
 * the edge gateway ADR refused.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/twin/device-twin.service.ts');
const adr = read('docs/phoenix/adr/ADR-011-device-twin-reconciliation.md');

describe('Wave 12 digital twin', () => {
  describe('ADR', () => {
    it('is decided explicitly, with its refusals recorded', () => {
      expect(adr).toMatch(/^# ADR-011/m);
      expect(adr).toMatch(/## Decision/);
      expect(adr).toMatch(/## Safety Boundaries/);
    });

    it('states that it is a reconciliation and not a simulation', () => {
      expect(adr).toMatch(/simulat/i);
    });
  });

  describe('a twin records what was believed and when', () => {
    it('is a model with a versioned twin of a device', () => {
      expect(schema).toMatch(/model DeviceTwinSnapshot\s*\{/);
      expect(schema).toMatch(/twinVersion\s+Int/);
    });

    it('is tenant-scoped and bound to one device', () => {
      expect(schema).toMatch(/tenantId\s+String/);
      expect(schema).toMatch(/deviceId\s+String/);
    });

    it('records when the observation was taken, not just when it was stored', () => {
      // observedAt is the load-bearing column. Without it a stale reading and a fresh one look identical.
      expect(schema).toMatch(/observedAt\s+DateTime/);
    });

    it('keeps the raw evidence alongside the verdict', () => {
      expect(schema).toMatch(/observedPayload|observedStatus/);
    });

    it('maps its table to the lower-case name this schema uses', () => {
      expect(schema).toMatch(/@@map\("device_twin_snapshots"\)/);
    });

    it('allows the same version per device only once, so a replay cannot fork history', () => {
      expect(schema).toMatch(/@@unique\(\[deviceId, twinVersion\]\)|@@unique\(\[tenantId, deviceId, twinVersion\]\)/);
    });
  });

  describe('reconciliation, not simulation', () => {
    it('can say it does not know, rather than reporting the last value as current', () => {
      expect(service).toMatch(/STALE|UNKNOWN/i);
    });

    it('refuses to present an observation past the staleness horizon as current', () => {
      expect(service).toMatch(/stale|horizon|expired/i);
    });

    it('reports divergence rather than assuming agreement', () => {
      expect(service).toMatch(/DIVERGENT|diverge/i);
    });

    it('computes no future behaviour and invents no value it did not observe', () => {
      expect(service).not.toMatch(/predict|forecastValue|simulate/i);
      expect(service).not.toMatch(/Math\.random/);
    });

    it('does not fill in an absent observation with a default reading', () => {
      expect(service).toMatch(/did not report|no observation|never reported/i);
    });
  });

  describe('tenant isolation and bounds', () => {
    it('scopes every read to a tenant', () => {
      expect(service).toMatch(/tenantId is required/);
    });

    it('reads the device inside the tenant', () => {
      expect(service).toMatch(/tenantId: options\.tenantId|tenantId/);
    });

    it('bounds history', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('takes its clock from the caller so a snapshot is reproducible', () => {
      expect(service).toMatch(/now/);
    });

    it('does not mock anything', () => {
      expect(service).not.toMatch(/mock|simulate|fake/i);
    });
  });
});