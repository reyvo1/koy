jest.mock('server-only', () => ({}), { virtual: true });

import {
  isOperationalSummaryEmpty,
  isOperationalSummaryStale,
} from '../apps/admin-web/lib/operational-summary-state';
import type { AdminOperationalSummary } from '../apps/admin-web/lib/contracts';

/**
 * Behavioural coverage for the two predicates that decide what the admin dashboard renders.
 *
 * These functions were left uncovered when `operational-summary-loader.ts` was removed: the spec that
 * exercised them went with it, and the surviving contract only greps the file for strings. They still
 * drive real output -- `operational-summary-experience.tsx` branches on both of them to choose between
 * the empty state and the stale banner -- so a regression here silently changes what an operator sees
 * with no test failing.
 *
 * The fixtures are literal rather than cast so that a change to the summary contract fails here,
 * instead of quietly widening what these predicates accept.
 */

const base: AdminOperationalSummary = {
  generatedAt: '2026-07-20T10:00:00.000Z',
  staleThresholdSeconds: 300,
  devices: {
    total: 2,
    byStatus: {
      PROVISIONING: 0,
      PAIRED: 0,
      ACTIVE: 2,
      INACTIVE: 0,
      REVOKED: 0,
    },
    staleHeartbeat: 0,
    neverReportedHeartbeat: 0,
  },
  capabilities: { readable: 4, reportable: 3, writable: 1 },
  telemetry: { latestObservedAt: '2026-07-20T09:59:00.000Z' },
  commands: {
    total: 1,
    byStatus: { PENDING: 0, SENT: 1, ACKNOWLEDGED: 0, FAILED: 0, TIMED_OUT: 0 },
  },
};

const summary = (patch: {
  devices?: Partial<AdminOperationalSummary['devices']>;
  capabilities?: Partial<AdminOperationalSummary['capabilities']>;
  telemetry?: Partial<AdminOperationalSummary['telemetry']>;
  commands?: Partial<AdminOperationalSummary['commands']>;
} = {}): AdminOperationalSummary => ({
  ...base,
  devices: { ...base.devices, ...patch.devices },
  capabilities: { ...base.capabilities, ...patch.capabilities },
  telemetry: { ...base.telemetry, ...patch.telemetry },
  commands: { ...base.commands, ...patch.commands },
});

describe('Module 10 Admin Web operational summary state', () => {
  describe('isOperationalSummaryEmpty', () => {
    it('reports a summary with no devices, capabilities, telemetry or commands as empty', () => {
      const empty = summary({
        devices: { total: 0 },
        capabilities: { readable: 0, reportable: 0, writable: 0 },
        telemetry: { latestObservedAt: null },
        commands: { total: 0 },
      });

      expect(isOperationalSummaryEmpty(empty)).toBe(true);
    });

    it('reports a populated summary as not empty', () => {
      expect(isOperationalSummaryEmpty(summary())).toBe(false);
    });

    // Each field is counted separately. An earlier combined version of this list let a summary with
    // zero devices but live telemetry read as empty, which renders "no data" over a dashboard that
    // has telemetry -- the one direction an operator cannot detect from the screen.
    // Each entry restores exactly one field on an otherwise-empty summary. The patch has to put that
    // field back to a non-zero value: a first version patched it back to zero, which is the state the
    // other four assertions already cover, so all four failed for the same uninteresting reason.
    it.each([
      ['a device exists', { devices: { total: 2 } }],
      ['a capability is readable', { capabilities: { readable: 4, reportable: 3, writable: 1 } }],
      ['telemetry was reported', { telemetry: { latestObservedAt: '2026-07-20T09:59:00.000Z' } }],
      ['a command exists', { commands: { total: 1 } }],
    ])('is not empty when %s', (_label, patch) => {
      const otherwiseEmpty = summary({
        devices: { total: 0 },
        capabilities: { readable: 0, reportable: 0, writable: 0 },
        telemetry: { latestObservedAt: null },
        commands: { total: 0 },
        ...(patch as object),
      });

      expect(isOperationalSummaryEmpty(otherwiseEmpty)).toBe(false);
    });
  });

  describe('isOperationalSummaryStale', () => {
    it('is stale as soon as one device heartbeat is stale, whatever the telemetry says', () => {
      const staleHeartbeat = summary({ devices: { staleHeartbeat: 1 } });

      expect(isOperationalSummaryStale(staleHeartbeat)).toBe(true);
    });

    it('is not stale while telemetry keeps arriving inside the threshold', () => {
      expect(isOperationalSummaryStale(summary())).toBe(false);
    });

    it('is stale once telemetry falls past the threshold', () => {
      const stale = summary({
        telemetry: { latestObservedAt: '2026-07-20T09:00:00.000Z' },
      });

      expect(isOperationalSummaryStale(stale)).toBe(true);
    });

    // Exactly on the threshold is not stale. Off-by-one here decides whether a dashboard shows the
    // stale banner continuously at a healthy boundary, and no other test covers the comparison.
    it('is not stale exactly at the threshold', () => {
      const onBoundary = summary({
        telemetry: { latestObservedAt: '2026-07-20T09:55:00.000Z' },
      });

      expect(isOperationalSummaryStale(onBoundary)).toBe(false);
    });

    it('is stale one millisecond past the threshold', () => {
      const justPast = summary({
        telemetry: { latestObservedAt: '2026-07-20T09:54:59.999Z' },
      });

      expect(isOperationalSummaryStale(justPast)).toBe(true);
    });

    it('is not stale when no telemetry has ever been reported', () => {
      const neverReported = summary({ telemetry: { latestObservedAt: null } });

      expect(isOperationalSummaryStale(neverReported)).toBe(false);
    });

    it('scales the threshold the summary declares rather than a fixed window', () => {
      const lenient: AdminOperationalSummary = {
        ...summary({ telemetry: { latestObservedAt: '2026-07-20T09:00:00.000Z' } }),
        staleThresholdSeconds: 7200,
      };

      expect(isOperationalSummaryStale(lenient)).toBe(false);
    });
  });
});
