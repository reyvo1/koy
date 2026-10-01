import { isMobileLocale, defaultMobileLocale } from '../localization/messages';

/**
 * Device display settings: the locale the copy is rendered in, and whether the app follows the
 * system colour scheme or pins one side.
 *
 * What this is **not**: a delivery preference. "Should this tenant get email at all" is a
 * per-membership question answered by the backend, and putting a channel switch here would place a
 * control for a subscription the phone does not own. That boundary is why this store is local to the
 * device and never calls the API.
 *
 * Stored beside the session in the same secure storage and separated only by key, which is why
 * {@link MOBILE_SETTINGS_KEY} is asserted to be distinct from the session's in the spec.
 */

export const MOBILE_SETTINGS_KEY = 'iot-platform.mobile.settings.v1';
const MOBILE_SETTINGS_VERSION = 1;

export type MobileAppearance = 'system' | 'light' | 'dark';

export interface MobileSettings {
  locale: string;
  appearance: MobileAppearance;
}

const APPEARANCES: ReadonlySet<string> = new Set<MobileAppearance>([
  'system',
  'light',
  'dark',
]);

/**
 * The slice of `expo-secure-store` this store needs.
 *
 * Declared here rather than imported so the store is testable in plain node; the Expo module is
 * supplied by the caller, exactly as `createMobileSecureSessionStore` is.
 */
export interface MobileSettingsStorePort {
  isAvailableAsync(): Promise<boolean>;
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface MobileSettingsStore {
  read(): Promise<MobileSettings>;
  replace(settings: MobileSettings): Promise<void>;
  /** Validate a record without writing it. Exposed so the UI can check before it commits. */
  accept(candidate: unknown): MobileSettings;
  clear(): Promise<void>;
}

export class MobileSettingsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MobileSettingsError';
  }
}

/** The settings a fresh install starts on. A record is only written once someone changes one. */
export function defaultMobileSettings(): MobileSettings {
  return { locale: defaultMobileLocale, appearance: 'system' };
}

/**
 * Validate an untrusted record.
 *
 * Unknown keys are tolerated deliberately: a record written by a newer build must not read as
 * corruption, or every added preference becomes a silent reset for whoever upgrades. What cannot be
 * tolerated is a known key holding a value the renderer cannot handle — an unknown locale would
 * otherwise crash the first screen that tries to read copy.
 */
export function parseMobileSettings(candidate: unknown): MobileSettings {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    throw new MobileSettingsError(
      'MOBILE_SETTINGS_INVALID_RECORD',
      'Stored mobile settings are not a settings record.',
    );
  }

  const record = candidate as Record<string, unknown>;

  if (
    typeof record.locale !== 'string' ||
    !isMobileLocale(record.locale)
  ) {
    throw new MobileSettingsError(
      'MOBILE_SETTINGS_INVALID_LOCALE',
      'Stored mobile settings name a locale this build has no copy for.',
    );
  }

  if (typeof record.appearance !== 'string' || !APPEARANCES.has(record.appearance)) {
    throw new MobileSettingsError(
      'MOBILE_SETTINGS_INVALID_APPEARANCE',
      'Stored mobile settings name an appearance this build cannot paint.',
    );
  }

  return { locale: record.locale, appearance: record.appearance as MobileAppearance };
}

/**
 * Resolve the stored choice against what the device reports.
 *
 * `systemColourIsDark` is passed in rather than read from `Appearance` here, so the decision is a
 * pure function and can be asserted without a renderer.
 */
export function resolveMobileAppearance(
  appearance: MobileAppearance,
  systemColourIsDark: boolean,
): boolean {
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  return systemColourIsDark;
}

export function createMobileSettingsStore(
  secureStore: MobileSettingsStorePort,
): MobileSettingsStore {
  async function assertAvailable(): Promise<void> {
    let available = false;
    try {
      available = await secureStore.isAvailableAsync();
    } catch {
      throw new MobileSettingsError(
        'MOBILE_SETTINGS_UNAVAILABLE',
        'Secure mobile settings storage is unavailable.',
      );
    }
    if (!available) {
      throw new MobileSettingsError(
        'MOBILE_SETTINGS_UNAVAILABLE',
        'Secure mobile settings storage is unavailable.',
      );
    }
  }

  async function discard(): Promise<void> {
    try {
      await secureStore.deleteItemAsync(MOBILE_SETTINGS_KEY);
    } catch {
      // The unreadable record is what the caller needs to hear about; a failure to clear it is
      // secondary and would otherwise mask that.
    }
  }

  return {
    async read(): Promise<MobileSettings> {
      await assertAvailable();

      let raw: string | null;
      try {
        raw = await secureStore.getItemAsync(MOBILE_SETTINGS_KEY);
      } catch {
        throw new MobileSettingsError(
          'MOBILE_SETTINGS_UNAVAILABLE',
          'Secure mobile settings storage could not be read.',
        );
      }

      if (raw === null) return defaultMobileSettings();

      try {
        return parseMobileSettings(JSON.parse(raw));
      } catch {
        // Clearing is the point. Left in place, every launch re-reads the same bad bytes and the
        // operator's choice silently stops surviving.
        await discard();
        return defaultMobileSettings();
      }
    },

    async replace(settings: MobileSettings): Promise<void> {
      // Validate before touching storage, so a refused write cannot half-apply.
      const validated = parseMobileSettings(settings);
      await assertAvailable();

      try {
        await secureStore.setItemAsync(
          MOBILE_SETTINGS_KEY,
          JSON.stringify({
            version: MOBILE_SETTINGS_VERSION,
            ...validated,
          }),
        );
      } catch {
        throw new MobileSettingsError(
          'MOBILE_SETTINGS_WRITE_FAILED',
          'Secure mobile settings storage could not be written.',
        );
      }
    },

    accept(candidate: unknown): MobileSettings {
      return parseMobileSettings(candidate);
    },

    async clear(): Promise<void> {
      await assertAvailable();
      await discard();
    },
  };
}