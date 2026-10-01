import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 8 step 3: one integration provider that really talks to something.
 *
 * ## What "real adapter" has to mean here
 *
 * The registry was honest about its own scope — "connect/sync against this registry in later
 * slices; no real provider calls" — and the four provider enum values existed with a registry but
 * nothing behind them. `setStatus` had no caller, and it used `updateMany` without reading `count`,
 * so an integration id belonging to another tenant, or one that did not exist, produced a silent
 * no-op that looked exactly like success. A caller cannot tell "the provider is offline" from "that
 * row was never yours", and the second one is a security-relevant answer being reported as an
 * operational one.
 *
 * MQTT_BRIDGE is the adapter built here rather than ALEXA/GOOGLE_HOME, and the reason is the shape
 * of the evidence available: this repository runs a real EMQX broker, so an adapter over it can be
 * proven end to end against a stack that exists. A Google Home adapter in this repo would be an
 * unverifiable claim about someone else's OAuth consent screen, and pretending otherwise is the
 * failure mode this wave exists to remove.
 *
 * What this contract cannot prove, and does not claim: that Google's or Alexa's production
 * endpoints accept our traffic. Those remain unproven and are recorded as such.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string => readFileSync(`${ROOT}/${relative}`, 'utf8');
const exists = (relative: string): boolean => {
  try {
    readFileSync(`${ROOT}/${relative}`, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const REGISTRY = read('src/integrations/integration-registry.service.ts');
const ADAPTER = 'src/integrations/adapters/mqtt-bridge.adapter.ts';

describe('the registry stops reporting silence as success', () => {
  it('setStatus reads the affected row count', () => {
    const method = REGISTRY.slice(REGISTRY.indexOf('async setStatus'));
    expect(method.slice(0, 700)).toMatch(/count/);
  });

  it('and refuses to claim a status it did not set', () => {
    const method = REGISTRY.slice(REGISTRY.indexOf('async setStatus'));
    expect(method).toMatch(/NotFound|not found|NOT_FOUND/);
  });

  it('recordSync does not silently accept a foreign integration id', () => {
    // The upsert creates the sync row with a caller-supplied tenantId. If the integration id belongs
    // to another tenant, this would insert a row pointing at a tenant's integration the caller
    // never named.
    const method = REGISTRY.slice(REGISTRY.indexOf('async recordSync'));
    expect(method).toMatch(/integration\.findFirst|verifyIntegration/);
  });
});

describe('a real adapter exists, and it is over something that exists', () => {
  it('is a real file', () => {
    expect(exists(ADAPTER)).toBe(true);
  });

  it('connects to an MQTT broker rather than describing one', () => {
    const source = read(ADAPTER);
    expect(source).toMatch(/mqtt|connectAsync|connect\(/i);
  });

  it('publishes and subscribes, so a sync is bidirectional and observable', () => {
    const source = read(ADAPTER);
    expect(source).toMatch(/publish/);
    expect(source).toMatch(/subscribe/);
  });

  it('resolves its credentials from a reference, never from a stored secret', () => {
    // `Integration.credentialRef` is the only credential column, and the schema comment says the
    // secret lives in the tenant's secret store. An adapter that read a password off the row would
    // be a different, and worse, design.
    const source = read(ADAPTER);
    expect(source).toMatch(/credentialRef/);
    expect(source).not.toMatch(/password\s*[:=]\s*['"]/i);
  });

  it('times out, so a dead broker cannot hang a request', () => {
    const source = read(ADAPTER);
    expect(source).toMatch(/timeout|Timeout|TIMEOUT/);
  });

  it('reports a failed connect through the registry rather than swallowing it', () => {
    const source = read(ADAPTER);
    expect(source).toMatch(/setStatus|'ERROR'|"ERROR"/);
  });
});

describe('the sync is idempotent because the mapping is keyed', () => {
  it('reuses an existing external id instead of creating a second mapping', () => {
    const source = read(ADAPTER);
    expect(source).toMatch(/externalEntityId/);
    expect(source).toMatch(/recordSync/);
  });

  it('and a repeated sync of the same entity is safe to run twice', () => {
    // The unique key is (integration, entityType, externalEntityId). The contract is that the
    // adapter routes every write through recordSync rather than creating rows itself.
    expect(read('prisma/schema.prisma')).toMatch(
      /@@unique\(\[integrationId, entityType, externalEntityId\]\)/,
    );
  });
});

describe('only the one provider that can be proven is claimed as real', () => {
  it('the other three are not claimed as implemented', () => {
    // Comments stripped first. This assertion is about what the code does, and its own file's
    // docblock names ALEXA and GOOGLE_HOME in a heading explaining why they are not implemented --
    // so a whole-file search matches the explanation. This is the fourth time in this wave that a
    // source assertion matched prose; stripping comments is the general fix rather than rewording
    // the docblock each time.
    const code = (exists(ADAPTER) ? read(ADAPTER) : '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/ALEXA/);
    expect(code).not.toMatch(/GOOGLE_HOME/);
    expect(code).not.toMatch(/HOME_ASSISTANT/);
  });

  it('and the registry still admits all four, because the enum is not the claim', () => {
    expect(REGISTRY).toMatch(/'ALEXA'/);
    expect(REGISTRY).toMatch(/'MQTT_BRIDGE'/);
  });
});
