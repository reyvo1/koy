import { useCallback, useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View, useColorScheme } from 'react-native';

import {
  MobileAuthState,
  bootstrapMobileAuth,
  loginMobileAuth,
  logoutMobileAuth,
} from './src/app/mobile-auth-controller';
import {
  MobileDashboardState,
  loadMobileDashboardState,
} from './src/dashboard';
import type { MobileLoginCredentials } from './src/session';
import {
  reconcileMobileCommand,
  sendCapabilityCommand,
} from './src/device-control/mobile-device-client';
import { mobileSessionClient } from './src/session';
import {
  resolveMobileAppearance,
  type MobileAppearance,
} from './src/settings/mobile-settings-store';
import { mobileSettingsStore } from './src/settings/expo-secure-settings-store';
import { defaultMobileLocale, type MobileLocale } from './src/localization/messages';
import { MobileAuthenticatedShell } from './src/ui/mobile-authenticated-shell';
import { MobileBlockedScreen } from './src/ui/mobile-blocked-screen';
import { MobileLoginScreen } from './src/ui/mobile-login-screen';
import { MobileStateNotice } from './src/ui/mobile-state-notice';

/**
 * Name the code, not just the fact.
 *
 * A bare "could not save" leaves an operator with nothing to act on, and an unlabelled `UNKNOWN`
 * hides the difference between a full disk and a record this build cannot represent -- which are
 * different problems with different fixes.
 */
function settingsWriteFailedMessage(cause: { code?: string } | null): string {
  const code = cause?.code ?? 'UNKNOWN';
  return `MOBILE_SETTINGS_WRITE_FAILED: ${code}`;
}

export default function App() {
  const colorScheme = useColorScheme();
  // The palette is an app-level concern, so the appearance choice is resolved here rather than in a
  // component that could only repaint itself. `system` follows the device; `light`/`dark` override
  // it, and that override is the whole reason the store exists.
  const [appearance, setAppearance] = useState<MobileAppearance>('system');
  // The locale is held here rather than in the shell because the login screen renders before any
  // authenticated shell exists -- an Indonesian operator would otherwise see the sign-in screen in
  // Indonesian, tap English on the profile tab, and be signed back out to Indonesian.
  const [locale, setLocale] = useState<MobileLocale>(defaultMobileLocale);
  // A failed write must be stated, not swallowed. A screen that shows the new choice and silently
  // reverts on the next launch is indistinguishable from settings that do not work.
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const isDark = resolveMobileAppearance(appearance, colorScheme === 'dark');

  useEffect(() => {
    let active = true;
    void mobileSettingsStore
      .read()
      .then((stored) => {
        if (!active) return;
        setAppearance(stored.appearance);
        setLocale(stored.locale as MobileLocale);
      })
      .catch(() => {
        // Unreadable settings leave the app on `system`, which is the device's own answer. Failing
        // loudly here would block the whole app on a preference, so the profile screen reports the
        // storage failure instead of the app refusing to start.
        setStorageUnavailable(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Persist an appearance choice.
   *
   * The palette follows the write rather than the tap: switching first and reporting a failure after
   * would leave the screen showing a theme that does not survive a restart.
   */
  /**
   * Persist a locale choice.
   *
   * App owns this rather than the shell because the login screen renders before the shell exists.
   * Two owners of one setting is two copies of the truth, and the copy that forgets to write is the
   * one an operator discovers on their next sign-in.
   */
  const selectLocale = useCallback(async (next: MobileLocale) => {
    try {
      const current = await mobileSettingsStore.read();
      await mobileSettingsStore.replace({ ...current, locale: next });
      setLocale(next);
      setSettingsError(null);
      setStorageUnavailable(false);
    } catch (cause) {
      setSettingsError(settingsWriteFailedMessage(cause as { code?: string } | null));
    }
  }, []);

  const selectAppearance = useCallback(async (next: MobileAppearance) => {
    try {
      const current = await mobileSettingsStore.read();
      await mobileSettingsStore.replace({ ...current, appearance: next });
      setAppearance(next);
    } catch {
      // Reported by the shell's settings panel, which owns the error surface for this screen.
    }
  }, []);
  const [state, setState] = useState<MobileAuthState>({ kind: 'booting' });
  const [dashboardState, setDashboardState] = useState<MobileDashboardState>({
    kind: 'idle',
  });

  const authenticatedTenantId =
    state.kind === 'authenticated' ? state.tenantId : null;

  useEffect(() => {
    let active = true;

    void bootstrapMobileAuth(mobileSessionClient).then((nextState) => {
      if (active) setState(nextState);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!authenticatedTenantId) {
      setDashboardState({ kind: 'idle' });
      return;
    }

    let active = true;
    setDashboardState({ kind: 'loading', selectedDashboardId: null });

    void loadMobileDashboardState(mobileSessionClient, null).then(
      (nextState) => {
        if (active) applyDashboardState(nextState);
      },
    );

    return () => {
      active = false;
    };
  }, [authenticatedTenantId]);

  async function login(credentials: MobileLoginCredentials) {
    setState({ kind: 'authenticating', notice: null });
    setState(await loginMobileAuth(mobileSessionClient, credentials));
  }

  async function logout(tenantId: string) {
    setState({ kind: 'logging-out', tenantId });
    setDashboardState({ kind: 'idle' });
    setState(await logoutMobileAuth(mobileSessionClient));
  }

  async function retryBootstrap() {
    setState({ kind: 'booting' });
    setDashboardState({ kind: 'idle' });
    setState(await bootstrapMobileAuth(mobileSessionClient));
  }

  async function loadDashboard(selectedDashboardId: string | null) {
    setDashboardState({ kind: 'loading', selectedDashboardId });
    applyDashboardState(
      await loadMobileDashboardState(mobileSessionClient, selectedDashboardId),
    );
  }

  async function sendDashboardCommand(
    deviceId: string,
    capabilityKey: string,
    value: unknown,
  ) {
    const accepted = await sendCapabilityCommand(
      mobileSessionClient,
      deviceId,
      capabilityKey,
      value,
    );

    if (!accepted.commandId) return accepted;

    const settled = await reconcileMobileCommand(
      mobileSessionClient,
      deviceId,
      accepted.commandId,
    ).catch(() => ({
      commandId: accepted.commandId,
      status: accepted.status,
      terminal: false,
    }));

    if (settled.terminal) {
      const selectedDashboardId =
        dashboardState.kind === 'ready' || dashboardState.kind === 'empty'
          ? dashboardState.experience.selectedDashboardId
          : null;
      await loadDashboard(selectedDashboardId);
    }

    return {
      commandId: settled.commandId,
      status: settled.status,
    };
  }

  function applyDashboardState(nextState: MobileDashboardState) {
    if (nextState.kind === 'session-expired') {
      setDashboardState({ kind: 'idle' });
      setState({
        kind: 'unauthenticated',
        notice: nextState.notice,
      });
      return;
    }

    setDashboardState(nextState);
  }

  return (
    <View style={[styles.screen, isDark && styles.screenDark]}>
      {state.kind === 'booting' ? (
        <View style={styles.centered}>
          <MobileStateNotice
            isDark={isDark}
            notice={{
              tone: 'offline',
              title: 'Memeriksa sesi aman',
              message: 'Aplikasi sedang membaca sesi perangkat.',
              requestId: null,
            }}
          />
        </View>
      ) : null}

      {state.kind === 'unauthenticated' || state.kind === 'authenticating' ? (
        <MobileLoginScreen
          locale={locale}
          isDark={isDark}
          notice={state.notice}
          onSubmit={login}
          pending={state.kind === 'authenticating'}
        />
      ) : null}

      {state.kind === 'authenticated' || state.kind === 'logging-out' ? (
        <MobileAuthenticatedShell
          appearance={appearance}
          dashboardState={dashboardState}
          isDark={isDark}
          onLogout={() => logout(state.tenantId)}
          onSelectAppearance={selectAppearance}
          onRefreshDashboard={loadDashboard}
          onSelectDashboard={loadDashboard}
          locale={locale}
          onSelectLocale={selectLocale}
          settingsError={settingsError}
          storageUnavailable={storageUnavailable}
          onSendCommand={sendDashboardCommand}
          pending={state.kind === 'logging-out'}
          tenantId={state.tenantId}
        />
      ) : null}

      {state.kind === 'blocked' ? (
        <View style={styles.centered}>
          <MobileBlockedScreen
            isDark={isDark}
            notice={state.notice}
            onRetry={retryBootstrap}
          />
        </View>
      ) : null}

      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  screenDark: {
    backgroundColor: '#111827',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
});
