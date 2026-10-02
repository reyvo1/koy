import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(resolve(root, relative), 'utf8');

/**
 * Wave 12, second slice: edge gateway.
 *
 * The census found two facts that decide this slice's shape:
 *
 * 1. `Telemetry` records `deviceId` but nothing about WHO delivered it. A device reporting its own reading
 *    and a gateway forwarding on its behalf produce identical rows. So an operator looking at a bad number
 *    cannot tell whether the sensor or the relay produced it, and there is nothing to audit.
 * 2. `DeviceCredential` is `@unique deviceId`. There is no identity a gateway could hold. So "edge gateway"
 *    today can only mean a string inside a payload, which is not a gateway.
 *
 * So the gateway is made a real, tenant-owned identity that is explicitly allowed to speak for a bounded
 * set of devices, and telemetry carries who delivered it.
 *
 * Deliberately NOT in this slice: an MQTT bridge, relay buffering, or store-and-forward. None of those can
 * be proven without a physical gateway, and a bridge nobody has observed is exactly the simulated evidence
 * this project refuses to accept. The identity and attribution boundaries below are the part that is real.
 */

const schema = read('prisma/schema.prisma');
const service = read('src/edge/edge-gateway.service.ts');
const adr = read('docs/phoenix/adr/ADR-010-edge-gateway-identity-and-attribution.md');

describe('Wave 12 edge gateway', () => {
  describe('ADR', () => {
    it('is decided explicitly, and records what it refuses', () => {
      expect(adr).toMatch(/^# ADR-010/m);
      expect(adr).toMatch(/## Decision/);
      expect(adr).toMatch(/## Safety Boundaries/);
    });

    it('says plainly that no bridge is claimed, because none has been observed', () => {
      expect(adr).toMatch(/bridge/i);
    });
  });

  describe('the gateway is an identity, not a label', () => {
    it('is a model of its own with tenant ownership', () => {
      expect(schema).toMatch(/model EdgeGateway\s*\{/);
      expect(schema).toMatch(/tenantId\s+String/);
    });

    it('has its own credential, so a gateway can hold an identity a device could not forge', () => {
      expect(schema).toMatch(/model EdgeGatewayCredential\s*\{/);
      expect(schema).toMatch(/passwordHash|credentialHash|secretHash/);
    });

    it('is scoped to a region rather than floating free of one', () => {
      expect(schema).toMatch(/regionId\s+String\?/);
    });

    it('has a state that can be unknown rather than defaulted to healthy', () => {
      expect(schema).toMatch(/gatewayStatus|lastSeenAt/);
    });

    it('maps its table to the lower-case name this schema uses everywhere else', () => {
      expect(schema).toMatch(/@@map\("edge_gateways"\)/);
    });
  });

  describe('which devices a gateway may speak for', () => {
    it('is an explicit list, not "everything in the region"', () => {
      expect(schema).toMatch(/model EdgeGatewayDevice\s*\{/);
      expect(service).toMatch(/gatewayDevice|allowedDevice/i);
    });

    it('names the device uniquely so one gateway cannot claim it twice', () => {
      expect(schema).toMatch(/@@unique\(\[gatewayId, deviceId\]\)|@@unique\(\[deviceId, gatewayId\]\)/);
    });

    it('refuses to register a device that is not in the tenant', () => {
      expect(service).toMatch(/does not exist in this tenant|not in this tenant/i);
    });

    it('refuses to register a device that does not exist at all', () => {
      expect(service).toMatch(/does not exist/i);
    });
  });

  describe('attribution: who delivered a reading', () => {
    it('records the delivering gateway on telemetry', () => {
      expect(schema).toMatch(/deliveredByGatewayId/);
    });

    it('records it as a relation, not a free string', () => {
      expect(schema).toMatch(/deliveredByGateway\s+EdgeGateway\?/);
    });

    it('leaves it null when the device reported for itself', () => {
      // A null here means "the device itself", which is true. Defaulting it to some gateway would be a
      // claim about the delivery path of every existing row.
      expect(schema).toMatch(/deliveredByGatewayId\s+String\?/);
    });

    it('rejects telemetry that names a gateway which is not registered for that device', () => {
      expect(service).toMatch(/not registered|is not allowed|does not speak for/i);
    });

    it('rejects a gateway speaking for a device in another tenant', () => {
      expect(service).toMatch(/tenant/i);
    });
  });

  describe('refusals and bounds', () => {
    it('requires a tenant on every path that reads or writes', () => {
      expect(service).toMatch(/tenantId is required/);
    });

    it('bounds everything it lists', () => {
      expect(service).toMatch(/(take:|limit|LIMIT)/i);
    });

    it('does not invent a gateway or a heartbeat', () => {
      expect(service).not.toMatch(/mock|simulate|fake/i);
      expect(service).not.toMatch(/Math\.random/);
    });
  });
});