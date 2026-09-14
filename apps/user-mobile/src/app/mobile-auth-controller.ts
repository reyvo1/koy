import { MobileApiError } from '../session/mobile-session-client';
import type {
  MobileLoginCredentials,
  MobileSessionSummary,
} from '../session/session-model';

export interface MobileSessionGateway {
  getSession(): Promise<MobileSessionSummary | null>;
  login(credentials: MobileLoginCredentials): Promise<MobileSessionSummary>;
  logout(): Promise<void>;
}

export interface MobileAuthNotice {
  tone: 'error' | 'offline' | 'warning';
  title: string;
  message: string;
  requestId: string | null;
}

export type MobileAuthState =
  | { kind: 'booting' }
  | { kind: 'unauthenticated'; notice: MobileAuthNotice | null }
  | { kind: 'authenticating'; notice: null }
  | { kind: 'authenticated'; tenantId: string }
  | { kind: 'logging-out'; tenantId: string }
  | { kind: 'blocked'; notice: MobileAuthNotice };

export async function bootstrapMobileAuth(
  gateway: MobileSessionGateway,
): Promise<MobileAuthState> {
  try {
    const session = await gateway.getSession();
    return session
      ? { kind: 'authenticated', tenantId: session.tenantId }
      : { kind: 'unauthenticated', notice: null };
  } catch (error) {
    return { kind: 'blocked', notice: mapBlockingFailure(error) };
  }
}

export async function loginMobileAuth(
  gateway: MobileSessionGateway,
  credentials: MobileLoginCredentials,
): Promise<MobileAuthState> {
  try {
    const session = await gateway.login(credentials);
    return { kind: 'authenticated', tenantId: session.tenantId };
  } catch (error) {
    const notice = mapLoginFailure(error);
    return notice.blocking
      ? { kind: 'blocked', notice: notice.value }
      : { kind: 'unauthenticated', notice: notice.value };
  }
}

export async function logoutMobileAuth(
  gateway: MobileSessionGateway,
): Promise<MobileAuthState> {
  try {
    await gateway.logout();
    return { kind: 'unauthenticated', notice: null };
  } catch (error) {
    return { kind: 'blocked', notice: mapBlockingFailure(error) };
  }
}

function mapLoginFailure(error: unknown): {
  blocking: boolean;
  value: MobileAuthNotice;
} {
  if (error instanceof MobileApiError) {
    if (error.code.startsWith('MOBILE_SECURE_STORAGE_')) {
      return { blocking: true, value: secureStorageNotice() };
    }

    if (error.code === 'MOBILE_API_UNREACHABLE' || error.status === 0) {
      return {
        blocking: false,
        value: {
          tone: 'offline',
          title: 'Layanan tidak terhubung',
          message: 'Periksa koneksi dan alamat API, lalu coba masuk kembali.',
          requestId: error.requestId,
        },
      };
    }

    if (error.code === 'MOBILE_LOGIN_INPUT_INVALID' || error.status === 400) {
      return {
        blocking: false,
        value: {
          tone: 'error',
          title: 'Data masuk belum lengkap',
          message: 'Isi tenant ID, email, dan password dengan benar.',
          requestId: error.requestId,
        },
      };
    }

    if (error.status === 401) {
      return {
        blocking: false,
        value: {
          tone: 'error',
          title: 'Tidak dapat masuk',
          message: 'Email, password, atau tenant tidak dapat diverifikasi.',
          requestId: error.requestId,
        },
      };
    }

    if (error.status === 429) {
      return {
        blocking: false,
        value: {
          tone: 'warning',
          title: 'Terlalu banyak percobaan',
          message: 'Tunggu beberapa saat sebelum mencoba kembali.',
          requestId: error.requestId,
        },
      };
    }

    return {
      blocking: false,
      value: {
        tone: 'error',
        title: 'Proses masuk gagal',
        message: 'IoT Platform belum dapat memproses permintaan masuk.',
        requestId: error.requestId,
      },
    };
  }

  return {
    blocking: false,
    value: {
      tone: 'error',
      title: 'Proses masuk gagal',
      message: 'Terjadi kesalahan yang tidak terduga. Coba kembali.',
      requestId: null,
    },
  };
}

function mapBlockingFailure(error: unknown): MobileAuthNotice {
  if (
    error instanceof MobileApiError &&
    error.code.startsWith('MOBILE_SECURE_STORAGE_')
  ) {
    return secureStorageNotice();
  }

  return {
    tone: 'error',
    title: 'Sesi aman tidak dapat dibuka',
    message:
      'Aplikasi tidak dapat memverifikasi penyimpanan sesi. Tutup dan buka kembali aplikasi, lalu coba lagi.',
    requestId: error instanceof MobileApiError ? error.requestId : null,
  };
}

function secureStorageNotice(): MobileAuthNotice {
  return {
    tone: 'error',
    title: 'Penyimpanan aman tidak tersedia',
    message:
      'Perangkat tidak menyediakan penyimpanan aman yang dibutuhkan untuk sesi IoT Platform.',
    requestId: null,
  };
}
