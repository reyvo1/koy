import { MobileApiError } from '../session/mobile-session-client';
import { MobileDashboardGateway } from './mobile-dashboard-client';
import {
  loadMobileDashboardState,
  mobileDashboardSessionExpiredNotice,
} from './mobile-dashboard-controller';

function gatewayWith(value: unknown | Error): MobileDashboardGateway {
  return {
    async requestJson<T>(): Promise<T> {
      if (value instanceof Error) throw value;
      return value as T;
    },
  };
}

describe('mobile dashboard controller', () => {
  it('returns an empty state when the tenant has no dashboard', async () => {
    await expect(
      loadMobileDashboardState(gatewayWith({ items: [], limit: 50 }), null),
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'empty',
        experience: expect.objectContaining({
          selectedDashboardId: null,
        }),
      }),
    );
  });

  it('returns a bounded offline notice without leaking backend details', async () => {
    const state = await loadMobileDashboardState(
      gatewayWith(
        new MobileApiError(
          0,
          'MOBILE_API_UNREACHABLE',
          'socket address and secret details',
          null,
        ),
      ),
      null,
    );

    expect(state).toEqual({
      kind: 'unavailable',
      notice: {
        tone: 'offline',
        title: 'Dashboard sedang offline',
        message: 'Periksa koneksi perangkat, lalu muat ulang dashboard.',
        requestId: null,
      },
      selectedDashboardId: null,
    });
    expect(JSON.stringify(state)).not.toContain('socket address');
  });

  it('keeps 403 within the authenticated dashboard boundary', async () => {
    const state = await loadMobileDashboardState(
      gatewayWith(
        new MobileApiError(
          403,
          'FORBIDDEN',
          'raw authorization detail',
          'request-403',
        ),
      ),
      'dashboard-1',
    );

    expect(state).toEqual(
      expect.objectContaining({
        kind: 'unavailable',
        selectedDashboardId: 'dashboard-1',
        notice: expect.objectContaining({
          title: 'Dashboard tidak diizinkan',
          requestId: 'request-403',
        }),
      }),
    );
  });

  it('returns session-expired after authoritative 401', async () => {
    const state = await loadMobileDashboardState(
      gatewayWith(
        new MobileApiError(
          401,
          'AUTH_EXPIRED',
          'raw token detail',
          'request-401',
        ),
      ),
      null,
    );

    expect(state).toEqual({
      kind: 'session-expired',
      notice: {
        ...mobileDashboardSessionExpiredNotice(),
        requestId: 'request-401',
      },
    });
    expect(JSON.stringify(state)).not.toContain('raw token detail');
  });
});
