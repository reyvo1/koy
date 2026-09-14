jest.mock('server-only', () => ({}), { virtual: true });

import { BackendRequestError } from '../apps/admin-web/lib/backend';
import { parseOperationalSummary } from '../apps/admin-web/lib/operational-summary-loader';
import {
  isOperationalSummaryEmpty,
  isOperationalSummaryStale,
} from '../apps/admin-web/lib/operational-summary-state';

const validSummary = {
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
    byStatus: {
      PENDING: 0,
      SENT: 0,
      ACKNOWLEDGED: 1,
      FAILED: 0,
      TIMED_OUT: 0,
    },
  },
};

describe('Module 10 Admin Web operational summary loader', () => {
  it('accepts and normalizes the approved bounded contract', () => {
    expect(parseOperationalSummary(validSummary)).toEqual(validSummary);
  });

  it('rejects missing status counts and unsafe numeric values', () => {
    expect(() =>
      parseOperationalSummary({
        ...validSummary,
        devices: {
          ...validSummary.devices,
          byStatus: { ACTIVE: 2 },
        },
      }),
    ).toThrow(BackendRequestError);

    expect(() =>
      parseOperationalSummary({
        ...validSummary,
        commands: { ...validSummary.commands, total: -1 },
      }),
    ).toThrow('commands.total');
  });

  it('rejects inconsistent aggregate totals and heartbeat counts', () => {
    expect(() =>
      parseOperationalSummary({
        ...validSummary,
        devices: { ...validSummary.devices, total: 3 },
      }),
    ).toThrow('devices.total');

    expect(() =>
      parseOperationalSummary({
        ...validSummary,
        commands: { ...validSummary.commands, total: 2 },
      }),
    ).toThrow('commands.total');

    expect(() =>
      parseOperationalSummary({
        ...validSummary,
        devices: {
          ...validSummary.devices,
          staleHeartbeat: 2,
          neverReportedHeartbeat: 1,
        },
      }),
    ).toThrow('devices.heartbeatCounts');
  });

  it('derives empty and stale states only from server-provided fields', () => {
    const parsed = parseOperationalSummary(validSummary);
    expect(isOperationalSummaryEmpty(parsed)).toBe(false);
    expect(isOperationalSummaryStale(parsed)).toBe(false);

    expect(
      isOperationalSummaryStale(
        parseOperationalSummary({
          ...validSummary,
          telemetry: { latestObservedAt: '2026-07-20T09:50:00.000Z' },
        }),
      ),
    ).toBe(true);

    expect(
      isOperationalSummaryEmpty(
        parseOperationalSummary({
          generatedAt: validSummary.generatedAt,
          staleThresholdSeconds: 300,
          devices: {
            total: 0,
            byStatus: {
              PROVISIONING: 0,
              PAIRED: 0,
              ACTIVE: 0,
              INACTIVE: 0,
              REVOKED: 0,
            },
            staleHeartbeat: 0,
            neverReportedHeartbeat: 0,
          },
          capabilities: { readable: 0, reportable: 0, writable: 0 },
          telemetry: { latestObservedAt: null },
          commands: {
            total: 0,
            byStatus: {
              PENDING: 0,
              SENT: 0,
              ACKNOWLEDGED: 0,
              FAILED: 0,
              TIMED_OUT: 0,
            },
          },
        }),
      ),
    ).toBe(true);
  });
});
