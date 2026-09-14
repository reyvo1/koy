import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (relativePath: string): string =>
  readFileSync(resolve(root, relativePath), 'utf8');
describe('Module 10 Slice 10.9 Admin Web Operational Dashboard UI Proposal contract', () => {
  const proposal = read(
    'docs/module-10-admin-web-operational-dashboard-ui-proposal.md',
  );

  it('preserves the remote-green proposal while Module 10 lifecycle advances', () => {
    expect(proposal).toContain('completed proposal-only checkpoint');
    expect(proposal).toContain('`658f020`');
    expect(proposal).toContain('`29725053250`');
  });

  it('records the approved proposal and implementation sequence before mobile work', () => {
    expect(proposal).toContain(
      '10.9 Admin Web Operational Dashboard UI Proposal',
    );
    expect(proposal).toContain(
      '10.10 Admin Web Operational Dashboard UI Foundation',
    );
    expect(proposal).toContain('10.11 Mobile Foundation and Dynamic Dashboard');
  });

  it('keeps authorization and session material server-side', () => {
    expect(proposal).toContain('HttpOnly');
    expect(proposal).toContain('SameSite=Lax');
    expect(proposal).toContain('single-flight refresh');
    expect(proposal).toContain('Authorization: Bearer');
    expect(proposal).toContain('X-Tenant-Id');
    expect(proposal).toContain('backend `403` remains authoritative');
    expect(proposal).toContain(
      'No menu item, route, component, cookie value, or client state establishes authorization',
    );
  });

  it('binds the UI to the exact normalized operational-summary fields', () => {
    for (const field of [
      'generatedAt',
      'staleThresholdSeconds',
      'devices.total',
      'devices.byStatus',
      'devices.staleHeartbeat',
      'devices.neverReportedHeartbeat',
      'capabilities.readable',
      'capabilities.reportable',
      'capabilities.writable',
      'telemetry.latestObservedAt',
      'commands.total',
      'commands.byStatus',
    ]) {
      expect(proposal).toContain(field);
    }

    expect(proposal).toContain(
      'must not invent health, readiness, MQTT publisher',
    );
    expect(proposal).toContain('Zero counts are valid data');
  });

  it('defines all bounded accessible states and no mutation actions', () => {
    for (const state of [
      'loading',
      'unauthenticated',
      'unauthorized',
      'empty',
      'stale',
      'offline',
      'error',
    ]) {
      expect(proposal).toContain(state);
    }

    expect(proposal).toContain('No action may publish a command');
    expect(proposal).toContain('read-only request');
    expect(proposal).toContain('default user-facing language is Indonesian');
  });

  it('hands implementation to the separately approved Slice 10.10 record', () => {
    const foundation = read(
      'docs/module-10-admin-web-operational-dashboard-ui-foundation.md',
    );
    const page = read('apps/admin-web/app/page.tsx');

    expect(proposal).toContain(
      'docs/module-10-admin-web-operational-dashboard-ui-foundation.md',
    );
    expect(foundation).toContain('Slice 10.10 is completed and green remotely');
    expect(foundation).toContain('f4195f814b5c83c5aa21409f284c73a08be64108');
    expect(foundation).toContain('29766694450');
    expect(foundation).toContain('Module Execution Kit v1.0.3');
    expect(page).toContain('OperationalSummaryExperience');
    expect(
      read('src/admin-operations/admin-operations.controller.ts'),
    ).toContain("@Get('operational-summary')");
  });

  it('preserves infrastructure, protocol, and deployment exclusions', () => {
    for (const boundary of [
      'Prometheus text or metrics service tokens',
      'direct MQTT, Redis, PostgreSQL, RTSP, ONVIF, or vendor API connections',
      'raw MQTT topics or raw telemetry payloads',
      'command, provisioning, ownership, membership, credential, or dashboard mutation controls',
      'Module 11 state',
      'production deployment approval',
    ]) {
      expect(proposal).toContain(boundary);
    }
  });

});
