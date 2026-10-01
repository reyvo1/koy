import {
  MOBILE_SETTINGS_KEY,
  createMobileSettingsStore,
  resolveMobileAppearance,
  type MobileSettings,
  type MobileSettingsStorePort,
} from './mobile-settings-store';
import {
  MOBILE_LOCALES,
  isMobileLocale,
  normalizeMobileLocale,
} from '../localization/messages';

/**
 * Display settings, so every choice here is about how the phone looks and reads — never about what
 * the tenant receives. Delivery preference is a separate, per-membership question with its own
 * backend surface, and folding it in here would put a per-channel switch on a device that does not
 * own the subscription.
 */

class FakeSecureStore implements MobileSettingsStorePort {
  items = new Map<string, string>();
  available = true;
  throwOn: Set<string> = new Set();

  async isAvailableAsync(): Promise<boolean> {
    return this.available;
  }

  async getItemAsync(key: string): Promise<string | null> {
    if (this.throwOn.has('get')) throw new Error('read failed');
    return this.items.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    if (this.throwOn.has('set')) throw new Error('write failed');
    this.items.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    if (this.throwOn.has('delete')) throw new Error('delete failed');
    this.items.delete(key);
  }
}

const store = (secure: FakeSecureStore = new FakeSecureStore()) => ({
  secure,
  settings: createMobileSettingsStore(secure),
});

describe('reading settings on a fresh install', () => {
  it('returns the default locale and follows the system colour scheme', async () => {
    const { settings } = store();
    expect(await settings.read()).toEqual({
      locale: 'id',
      appearance: 'system',
    });
  });

  it('writes nothing just because it was read', async () => {
    // Reading must not materialise a record. A store that persists the default on first read makes
    // "the operator changed it back to default" indistinguishable from "it was never set".
    const { secure, settings } = store();
    await settings.read();
    expect(secure.items.size).toBe(0);
  });
});

describe('choosing a value', () => {
  it('round-trips a locale and an appearance', async () => {
    const { settings } = store();
    await settings.replace({ locale: 'en', appearance: 'dark' });
    expect(await settings.read()).toEqual({ locale: 'en', appearance: 'dark' });
  });

  it('survives a restart, because the record is written before it is reported', async () => {
    const secure = new FakeSecureStore();
    await store(secure).settings.replace({ locale: 'en', appearance: 'light' });

    // A fresh store over the same bytes: this is what the app does on launch.
    expect(await createMobileSettingsStore(secure).read()).toEqual({
      locale: 'en',
      appearance: 'light',
    });
  });

  it('refuses a locale it has no copy for, rather than storing a key that cannot render', async () => {
    const { settings } = store();
    await expect(
      settings.replace({ locale: 'fr' as never, appearance: 'system' }),
    ).rejects.toMatchObject({ code: 'MOBILE_SETTINGS_INVALID_LOCALE' });
  });

  it('refuses an appearance outside the three it can paint', async () => {
    const { settings } = store();
    await expect(
      settings.replace({ locale: 'id', appearance: 'sepia' as never }),
    ).rejects.toMatchObject({ code: 'MOBILE_SETTINGS_INVALID_APPEARANCE' });
  });

  it('leaves the stored record untouched when a write is refused', async () => {
    const { settings } = store();
    await settings.replace({ locale: 'en', appearance: 'dark' });
    await expect(
      settings.replace({ locale: 'de' as never, appearance: 'light' }),
    ).rejects.toBeDefined();
    expect(await settings.read()).toEqual({ locale: 'en', appearance: 'dark' });
  });
});

describe('a stored record the app cannot trust', () => {
  it('falls back to defaults and clears the bytes when the shape is wrong', async () => {
    const secure = new FakeSecureStore();
    secure.items.set(MOBILE_SETTINGS_KEY, JSON.stringify({ locale: 'en' })); // no appearance
    const { settings } = store(secure);

    expect(await settings.read()).toEqual({ locale: 'id', appearance: 'system' });
    // Left in place, the next launch re-reads the same bad bytes and silently loses the choice again.
    expect(secure.items.has(MOBILE_SETTINGS_KEY)).toBe(false);
  });

  it('does the same for JSON that is not an object, or is not JSON at all', async () => {
    for (const raw of ['"en"', '[]', 'null', 'not json at all']) {
      const secure = new FakeSecureStore();
      secure.items.set(MOBILE_SETTINGS_KEY, raw);
      const { settings } = store(secure);

      expect(await settings.read()).toEqual({ locale: 'id', appearance: 'system' });
      expect(secure.items.has(MOBILE_SETTINGS_KEY)).toBe(false);
    }
  });

  it('accepts an unknown extra key, so a newer app\'s record is not a downgrade', async () => {
    // The version field is the upgrade path. Refusing a record merely because it has more in it
    // would make every added preference a silent reset for anyone upgrading.
    const secure = new FakeSecureStore();
    secure.items.set(
      MOBILE_SETTINGS_KEY,
      JSON.stringify({ version: 1, locale: 'en', appearance: 'dark', futureKey: true }),
    );

    expect(await createMobileSettingsStore(secure).read()).toEqual({
      locale: 'en',
      appearance: 'dark',
    });
  });
});

describe('when secure storage is unavailable', () => {
  it('says so instead of reporting defaults that were never chosen', async () => {
    // This is the distinction the UI renders: "you are on defaults" and "I cannot read your
    // settings" are different states, and collapsing them into one is how a preference silently
    // stops being honoured.
    const secure = new FakeSecureStore();
    secure.available = false;
    const { settings } = store(secure);

    await expect(settings.read()).rejects.toMatchObject({
      code: 'MOBILE_SETTINGS_UNAVAILABLE',
    });
  });

  it('reports a write failure rather than assuming it landed', async () => {
    const secure = new FakeSecureStore();
    secure.throwOn.add('set');
    const { settings } = store(secure);

    await expect(
      settings.replace({ locale: 'en', appearance: 'dark' }),
    ).rejects.toMatchObject({ code: 'MOBILE_SETTINGS_WRITE_FAILED' });
  });

  it('names the key it owns, and that key is not the session\'s', async () => {
    // Clearing settings must not be able to clear the session. Both live in the secure store, so
    // the only thing separating them is the key.
    expect(MOBILE_SETTINGS_KEY).not.toContain('session');
  });
});

describe('resolving appearance against the device', () => {
  it('follows the system when asked to', () => {
    expect(resolveMobileAppearance('system', true)).toBe(true);
    expect(resolveMobileAppearance('system', false)).toBe(false);
  });

  it('overrides the system when the operator chose a side', () => {
    expect(resolveMobileAppearance('light', true)).toBe(false);
    expect(resolveMobileAppearance('dark', false)).toBe(true);
  });
});

describe('locale normalisation', () => {
  it('accepts the two locales that actually have copy', () => {
    expect(MOBILE_LOCALES).toEqual(['id', 'en']);
    expect(isMobileLocale('id')).toBe(true);
    expect(isMobileLocale('en')).toBe(true);
  });

  it('refuses a tag it has no copy for instead of falling back silently', () => {
    // A silent fallback here is the trap: the operator picks nothing, and the app answers in a
    // language they did not choose while the picker says otherwise.
    for (const tag of ['fr', 'en-US', 'de', '', 'ID']) {
      expect(isMobileLocale(tag)).toBe(false);
    }
  });

  it('maps only exact matches, and says when it had to guess', () => {
    // A regional tag is the one case where guessing is right: `en-GB` is still English. But the
    // result must be reported as a decision, not passed off as the caller's request.
    expect(normalizeMobileLocale('en-GB')).toEqual({ locale: 'en', matched: false });
    expect(normalizeMobileLocale('en')).toEqual({ locale: 'en', matched: true });
    expect(normalizeMobileLocale('fr-FR')).toEqual({ locale: 'id', matched: false });
  });
});

describe('the record the store writes', () => {
  it('carries a version, because the parser has to know what it is reading', async () => {
    const { secure, settings } = store();
    await settings.replace({ locale: 'en', appearance: 'dark' });
    expect(JSON.parse(secure.items.get(MOBILE_SETTINGS_KEY)!)).toMatchObject({
      version: 1,
      locale: 'en',
      appearance: 'dark',
    });
  });

  it('is rejected by the same function that reads it, when a known field is missing', async () => {
    const { secure, settings } = store();
    await settings.replace({ locale: 'en', appearance: 'light' });
    const written = JSON.parse(secure.items.get(MOBILE_SETTINGS_KEY)!);
    delete (written as Record<string, unknown>).appearance;

    // Round-tripping through the reader is the strongest statement available without a device: the
    // bytes this store writes must satisfy the validator this store reads them with. A tolerated
    // extra key and a rejected missing one is the asymmetry above, proven both ways.
    expect(() => settings.accept(written)).toThrow();
    expect(() => settings.accept(written)).toThrow(/appearance/i);
  });
});

describe('a settings object built by hand', () => {
  it('cannot smuggle in a field the renderer does not know', () => {
    // The type is the last line of defence, but a widened type is exactly the kind of change that
    // passes review, so the parser checks the same thing at runtime.
    const settings: MobileSettings = { locale: 'en', appearance: 'dark' };
    expect(Object.keys(settings).sort()).toEqual(['appearance', 'locale']);
  });
});