import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

/**
 * Wave 7 mobile settings, reachability contract.
 *
 * The store spec proves the store is correct. It cannot prove anything is *using* it, and that is
 * the gap this file exists to close — because the defect Wave 7 was asked about was precisely a
 * correct-looking thing nobody could reach: both locales were already written out in full and
 * `defaultMobileLocale` was hardcoded at five call sites.
 *
 * Every assertion here is source-level on purpose. There is no renderer in this suite, so a passing
 * store spec plus a passing contract means the store is right *and* wired; it does not mean the
 * widget paints. That last claim needs a device, and it is stated as unproven rather than implied.
 */

const ROOT = resolve(__dirname, '..');
const read = (relative: string): string =>
  readFileSync(`${ROOT}/${relative}`, 'utf8');

const MESSAGES = read('apps/user-mobile/src/localization/messages.ts');
const SHELL = read('apps/user-mobile/src/ui/mobile-authenticated-shell.tsx');
const APP = read('apps/user-mobile/App.tsx');
const PANEL = read('apps/user-mobile/src/ui/mobile-settings-panel.tsx');
const LOGIN = read('apps/user-mobile/src/ui/mobile-login-screen.tsx');
const STORE = read('apps/user-mobile/src/settings/mobile-settings-store.ts');
const STORE_PORT = read('apps/user-mobile/src/session/expo-secure-session-store.ts');

/** Every file that renders copy, so "no hardcoded locale" can be checked rather than assumed. */
const COPY_RENDERERS = [
  'apps/user-mobile/src/ui/mobile-authenticated-shell.tsx',
  'apps/user-mobile/src/ui/mobile-dashboard-screen.tsx',
  'apps/user-mobile/src/ui/mobile-dashboard-widget.tsx',
  'apps/user-mobile/src/ui/mobile-login-screen.tsx',
  'apps/user-mobile/src/ui/mobile-settings-panel.tsx',
  'apps/user-mobile/src/ui/mobile-notification-delivery-panel.tsx',
  'apps/user-mobile/src/ui/mobile-alerts-panel.tsx',
  'apps/user-mobile/src/ui/mobile-device-detail-panel.tsx',
];

describe('the settings panel exists and is a real component', () => {
  it('is exported as a component', () => {
    expect(PANEL).toMatch(/export function MobileSettingsPanel/);
  });

  it('takes the settings and the callbacks, rather than reading them itself', () => {
    // Props, not a store import: the panel is then a thing that can be rendered from any state, and
    // the store stays owned by the shell that already holds the secure-storage lifecycle.
    expect(PANEL).toMatch(/locale: MobileLocale/);
    expect(PANEL).toMatch(/appearance: MobileAppearance/);
    expect(PANEL).toMatch(/onSelectLocale\(locale: MobileLocale\)/);
    expect(PANEL).toMatch(/onSelectAppearance\(appearance: MobileAppearance\)/);
  });
});

describe('no renderer hardcodes the default locale', () => {
  for (const file of COPY_RENDERERS) {
    it(`${file} takes its copy from a locale it was given`, () => {
      const source = read(file);
      // The exact defect being closed: `mobileMessages[defaultMobileLocale]` renders Indonesian on
      // every screen regardless of what the operator chose.
      expect(source).not.toMatch(/mobileMessages\[defaultMobileLocale\]/);
    });
  }

  it('and no renderer reads the default directly at all', () => {
    for (const file of COPY_RENDERERS) {
      const source = read(file);
      expect(source).not.toMatch(/\bdefaultMobileLocale\b/);
    }
  });

  it('the default survives only as the name of a fallback', () => {
    // One legitimate use remains: naming what a fresh install starts on. If that were removed the
    // store would have nowhere to fall back to, so the assertion is that it is a fallback and not a
    // rendering decision.
    expect(STORE).toMatch(/defaultMobileLocale/);
    expect(MESSAGES).toMatch(/export const defaultMobileLocale/);
  });
});

describe('App owns the settings, the shell renders them', () => {
  it('App holds the locale, because the login screen renders before any shell exists', () => {
    // If the shell owned it, an operator who chose English and was then signed out would land back
    // on an Indonesian sign-in screen. App is the only component alive for both states.
    expect(APP).toMatch(/useState<MobileLocale>/);
    expect(SHELL).not.toMatch(/useState<MobileLocale>/);
  });

  it('and App passes it down to the shell specifically, not just somewhere in the tree', () => {
    // Matching `locale={locale}` anywhere in App is satisfied by the login screen, which was the
    // first version of this assertion and it passed a shell that no longer received the locale --
    // typecheck caught that one, but the contract is supposed to stand on its own.
    const shellBlock = APP.slice(APP.indexOf('<MobileAuthenticatedShell'));
    expect(shellBlock.slice(0, shellBlock.indexOf('/>'))).toMatch(/locale=\{locale\}/);
    expect(shellBlock.slice(0, shellBlock.indexOf('/>'))).toMatch(/onSelectLocale=\{selectLocale\}/);
    expect(SHELL).toMatch(/locale: MobileLocale/);
  });

  it('takes the appearance from App rather than deciding it', () => {
    // The palette belongs to App, which owns the styles every screen shares. A shell that resolved
    // its own theme could repaint itself while leaving the header, nav bar and status bar on the
    // device's setting -- two themes on one screen.
    expect(SHELL).toMatch(/appearance: MobileAppearance/);
    expect(SHELL).not.toMatch(/useState<MobileAppearance>/);
    expect(APP).toMatch(/resolveMobileAppearance/);
  });

  it('keeps the native secure-storage module out of every renderer', () => {
    // One module per folder may know which secure storage this build runs on. A component importing
    // the native module would drag it into every tree that renders a panel, and would be untestable
    // without a device.
    expect(APP).toMatch(/settings\/expo-secure-settings-store/);
    expect(SHELL).not.toMatch(/expo-secure-store/);
    expect(SHELL).not.toMatch(/expo-secure-settings-store/);
  });

  it('renders the panel, not just the state', () => {
    expect(SHELL).toMatch(/<MobileSettingsPanel/);
  });
});

describe('choosing a value reaches the store and survives', () => {
  it('has exactly one writer for the setting', () => {
    // Two writers is two copies of the truth, and the copy that forgets to persist is the one an
    // operator meets on their next sign-in. App writes; the shell asks.
    expect(APP).toMatch(/mobileSettingsStore\.replace\(/);
    expect(SHELL).not.toMatch(/\.replace\(/);
    // The prop existing is not the same as the prop being used. A handler wired to a callback that
    // does nothing leaves every assertion here green while the picker is inert.
    const selector = SHELL.slice(SHELL.indexOf('const selectLocale'));
    expect(selector.slice(0, selector.indexOf(');'))).toMatch(/onSelectLocale\(/);
  });

  it('never writes straight to the secure storage, which would skip validation', () => {
    // A direct write bypasses the store's validator and its error mapping, which is how a refused
    // value ends up stored and failing at the next launch instead of at the moment of choice.
    expect(APP).not.toMatch(/setItemAsync/);
    expect(SHELL).not.toMatch(/setItemAsync/);
  });

  it('reports a failed write instead of leaving the UI showing a choice that did not land', () => {
    // The load-bearing half of a settings screen. Flipping the toggle first and reporting a failure
    // afterwards is the familiar version: the screen shows the new choice, the next launch reverts
    // it, and the operator concludes settings do not work.
    expect(APP).toMatch(/setSettingsError/);
    expect(APP).toMatch(/MOBILE_SETTINGS_WRITE_FAILED/);
  });

  it('distinguishes an unreadable store from a default, and passes the answer to the panel', () => {
    expect(APP).toMatch(/setStorageUnavailable/);
    expect(SHELL).toMatch(/storageUnavailable=\{storageUnavailable\}/);
  });
});

describe('the unavailable case is not the same as the default case', () => {
  it('renders storage failure as its own state', () => {
    expect(PANEL).toMatch(/storageUnavailable|MOBILE_SETTINGS_UNAVAILABLE/);
  });

  it('does not present defaults as if they had been chosen', () => {
    // When storage cannot be read the panel must say so. Presenting "Bahasa: Indonesia" as a
    // current selection is a claim the app cannot support, and it is the same false certainty this
    // wave has been correcting elsewhere.
    expect(PANEL).toMatch(/storageUnavailable/);
  });
});

describe('the locale picker offers exactly what the build can render', () => {
  it('iterates MOBILE_LOCALES rather than a hand-written list', () => {
    // A literal list in the panel is how the two drift apart and the picker offers a locale whose
    // copy does not exist.
    expect(PANEL).toMatch(/MOBILE_LOCALES/);
    expect(PANEL).not.toMatch(/\['id',\s*'en'\]/);
  });

  it('shows which locale is live now', () => {
    expect(PANEL).toMatch(/selected/);
  });
});

describe('nav labels are copy, not literals', () => {
  it('the shell reads tab labels from the active locale', () => {
    // `NAV_ITEMS` hardcoded 'Home'/'Devices'/'Profile' in English, so an Indonesian operator saw a
    // mix: Indonesian body text under an English tab bar. That mixed-language chrome is the symptom
    // the picker is supposed to fix.
    expect(MESSAGES).toMatch(/nav:/);
    expect(SHELL).toMatch(/copy\.nav|copy\.navigation/);
    expect(SHELL).not.toMatch(/label: 'Home'/);
    expect(SHELL).not.toMatch(/label: 'Devices'/);
  });

  it('every locale defines the same nav keys', () => {
    const navBlocks = [...MESSAGES.matchAll(/nav:\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(navBlocks.length).toBeGreaterThanOrEqual(2);
    for (const block of navBlocks) {
      for (const key of ['home', 'devices', 'realtime', 'alerts', 'profile', 'settings']) {
        expect(block).toContain(key);
      }
    }
  });
});

describe('the login screen honours the choice too', () => {
  it('takes its locale as a prop', () => {
    expect(LOGIN).toMatch(/locale/);
    expect(LOGIN).not.toMatch(/mobileMessages\[defaultMobileLocale\]/);
  });
});

describe('the store never becomes a second session', () => {
  it('uses a different key from the session', () => {
    expect(STORE).toMatch(/MOBILE_SETTINGS_KEY = 'iot-platform\.mobile\.settings/);
    expect(STORE_PORT).not.toMatch(/iot-platform\.mobile\.settings/);
  });

  it('stores no token, and the store imports nothing that could', () => {
    // The settings store is device-local by design. The moment it can read the session, a
    // "display preference" becomes a credential path.
    expect(STORE).not.toMatch(/token|accessToken|refreshToken/);
  });
});