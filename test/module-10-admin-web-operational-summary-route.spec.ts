jest.mock('server-only', () => ({}), { virtual: true });

const applySessionUpdate = jest.fn();
const clearSessionCookies = jest.fn();
const client = { applySessionUpdate };

jest.mock('../apps/admin-web/lib/session', () => ({
  AdminSessionBackendClient: {
    create: jest.fn(async () => client),
  },
  clearSessionCookies: (...args: unknown[]) => clearSessionCookies(...args),
}));

jest.mock('../apps/admin-web/lib/operational-summary-loader', () => ({
  loadOperationalSummary: jest.fn(),
}));

import { GET } from '../apps/admin-web/app/api/operational-summary/route';
import { BackendRequestError } from '../apps/admin-web/lib/backend';
import { loadOperationalSummary } from '../apps/admin-web/lib/operational-summary-loader';

const loaderMock = loadOperationalSummary as jest.MockedFunction<
  typeof loadOperationalSummary
>;

const summary = {
  generatedAt: '2026-07-20T10:00:00.000Z',
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
};

describe('Module 10 Admin Web operational summary route', () => {
  beforeEach(() => {
    loaderMock.mockReset();
    applySessionUpdate.mockReset();
    clearSessionCookies.mockReset();
  });

  it('returns only the normalized read-only summary and applies refresh cookies', async () => {
    loaderMock.mockResolvedValue(summary);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(applySessionUpdate).toHaveBeenCalledTimes(1);
  });

  it('maps backend 401 and 403 to one non-leaking unauthorized response', async () => {
    loaderMock.mockRejectedValue(
      new BackendRequestError(
        403,
        'ADMIN_ROLE_REQUIRED',
        'Role details must not reach the browser',
        'request-one',
      ),
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      state: 'unauthorized',
      message: 'Sesi admin tidak tersedia atau tidak lagi diotorisasi.',
      requestId: 'request-one',
    });
    expect(JSON.stringify(payload)).not.toContain('ADMIN_ROLE_REQUIRED');
    expect(clearSessionCookies).toHaveBeenCalledTimes(1);
  });

  it('returns a bounded offline state when the backend cannot be reached', async () => {
    loaderMock.mockRejectedValue(new TypeError('connect ECONNREFUSED'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      state: 'offline',
      message: 'IoT Platform API saat ini tidak dapat dijangkau.',
      requestId: null,
    });
  });
});
