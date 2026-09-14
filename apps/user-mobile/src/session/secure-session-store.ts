import {
  MobileSessionRecord,
  MobileSessionValidationError,
  parseMobileSessionRecord,
} from './session-model';

export const MOBILE_SECURE_SESSION_KEY = 'iot-platform.mobile.session.v1';
const MOBILE_SECURE_SESSION_VERSION = 1;

interface StoredMobileSession extends MobileSessionRecord {
  version: typeof MOBILE_SECURE_SESSION_VERSION;
}

export interface SecureStorePort {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface MobileSecureSessionStore {
  read(): Promise<MobileSessionRecord | null>;
  replace(session: MobileSessionRecord): Promise<void>;
  clear(): Promise<void>;
}

export class MobileSecureStorageError extends Error {
  constructor(readonly code: string) {
    super('Secure mobile session storage is unavailable.');
    this.name = 'MobileSecureStorageError';
  }
}

export function createMobileSecureSessionStore(
  secureStore: SecureStorePort,
): MobileSecureSessionStore {
  async function assertAvailable(): Promise<void> {
    let available = false;

    try {
      available = await secureStore.isAvailableAsync();
    } catch {
      throw new MobileSecureStorageError('MOBILE_SECURE_STORAGE_UNAVAILABLE');
    }

    if (!available) {
      throw new MobileSecureStorageError('MOBILE_SECURE_STORAGE_UNAVAILABLE');
    }
  }

  async function clear(): Promise<void> {
    await assertAvailable();

    try {
      await secureStore.deleteItemAsync(MOBILE_SECURE_SESSION_KEY);
    } catch {
      throw new MobileSecureStorageError('MOBILE_SECURE_STORAGE_CLEAR_FAILED');
    }
  }

  return {
    async read(): Promise<MobileSessionRecord | null> {
      await assertAvailable();

      let raw: string | null;
      try {
        raw = await secureStore.getItemAsync(MOBILE_SECURE_SESSION_KEY);
      } catch {
        throw new MobileSecureStorageError('MOBILE_SECURE_STORAGE_READ_FAILED');
      }

      if (raw === null) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed !== 'object' ||
          parsed === null ||
          Array.isArray(parsed) ||
          (parsed as Record<string, unknown>).version !==
            MOBILE_SECURE_SESSION_VERSION
        ) {
          throw new MobileSessionValidationError();
        }

        return parseMobileSessionRecord(parsed);
      } catch {
        await clear();
        return null;
      }
    },

    async replace(session: MobileSessionRecord): Promise<void> {
      await assertAvailable();
      const validated = parseMobileSessionRecord(session);
      const stored: StoredMobileSession = {
        version: MOBILE_SECURE_SESSION_VERSION,
        ...validated,
      };

      try {
        await secureStore.setItemAsync(
          MOBILE_SECURE_SESSION_KEY,
          JSON.stringify(stored),
        );
      } catch {
        try {
          await secureStore.deleteItemAsync(MOBILE_SECURE_SESSION_KEY);
        } catch {
          // The original storage failure remains authoritative.
        }
        throw new MobileSecureStorageError(
          'MOBILE_SECURE_STORAGE_REPLACE_FAILED',
        );
      }
    },

    clear,
  };
}
