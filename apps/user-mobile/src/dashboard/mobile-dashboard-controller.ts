import { MobileApiError } from '../session/mobile-session-client';
import {
  MobileDashboardExperience,
  MobileDashboardValidationError,
} from './mobile-dashboard-model';
import {
  MobileDashboardGateway,
  loadMobileDashboardExperience,
} from './mobile-dashboard-client';

export interface MobileDashboardNotice {
  tone: 'error' | 'offline' | 'warning';
  title: string;
  message: string;
  requestId: string | null;
}

export type MobileDashboardState =
  | { kind: 'idle' }
  | { kind: 'loading'; selectedDashboardId: string | null }
  | { kind: 'ready'; experience: MobileDashboardExperience }
  | { kind: 'empty'; experience: MobileDashboardExperience }
  | {
      kind: 'unavailable';
      notice: MobileDashboardNotice;
      selectedDashboardId: string | null;
    }
  | { kind: 'session-expired'; notice: MobileDashboardNotice };

export async function loadMobileDashboardState(
  gateway: MobileDashboardGateway,
  selectedDashboardId: string | null,
): Promise<MobileDashboardState> {
  try {
    const experience = await loadMobileDashboardExperience(
      gateway,
      selectedDashboardId,
    );
    return experience.selectedDashboardId
      ? { kind: 'ready', experience }
      : { kind: 'empty', experience };
  } catch (error) {
    return mapDashboardFailure(error, selectedDashboardId);
  }
}

export function mobileDashboardSessionExpiredNotice(): MobileDashboardNotice {
  return {
    tone: 'warning',
    title: 'Sesi telah berakhir',
    message: 'Masuk kembali untuk membuka dashboard tenant.',
    requestId: null,
  };
}

function mapDashboardFailure(
  error: unknown,
  selectedDashboardId: string | null,
): MobileDashboardState {
  if (error instanceof MobileApiError) {
    if (error.status === 401 || error.code === 'MOBILE_SESSION_MISSING') {
      return {
        kind: 'session-expired',
        notice: {
          ...mobileDashboardSessionExpiredNotice(),
          requestId: error.requestId,
        },
      };
    }

    if (error.status === 403) {
      return {
        kind: 'unavailable',
        notice: {
          tone: 'warning',
          title: 'Dashboard tidak diizinkan',
          message:
            'Tenant aktif tidak memiliki izin membaca dashboard yang dipilih.',
          requestId: error.requestId,
        },
        selectedDashboardId,
      };
    }

    if (error.status === 0 || error.code === 'MOBILE_API_UNREACHABLE') {
      return {
        kind: 'unavailable',
        notice: {
          tone: 'offline',
          title: 'Dashboard sedang offline',
          message: 'Periksa koneksi perangkat, lalu muat ulang dashboard.',
          requestId: error.requestId,
        },
        selectedDashboardId,
      };
    }

    return {
      kind: 'unavailable',
      notice: {
        tone: 'error',
        title: 'Dashboard belum dapat dimuat',
        message: 'IoT Platform tidak dapat memuat data dashboard saat ini.',
        requestId: error.requestId,
      },
      selectedDashboardId,
    };
  }

  if (error instanceof MobileDashboardValidationError) {
    return {
      kind: 'unavailable',
      notice: {
        tone: 'error',
        title: 'Respons dashboard tidak valid',
        message: 'Data dashboard ditolak karena tidak sesuai kontrak aplikasi.',
        requestId: null,
      },
      selectedDashboardId,
    };
  }

  return {
    kind: 'unavailable',
    notice: {
      tone: 'error',
      title: 'Dashboard belum dapat dimuat',
      message: 'Terjadi kesalahan tak terduga saat membaca dashboard.',
      requestId: null,
    },
    selectedDashboardId,
  };
}
