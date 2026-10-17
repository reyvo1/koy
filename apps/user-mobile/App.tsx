import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  StatusBar,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
  type MobileAlertsPayload,
  type MobileDeviceSummary,
} from './src/device-control/mobile-device-client';
import { mobileSessionClient } from './src/session';
import {
  resolveMobileAppearance,
  type MobileAppearance,
} from './src/settings/mobile-settings-store';
import { mobileSettingsStore } from './src/settings/expo-secure-settings-store';
import { mobileSnapshotCache } from './src/offline/expo-sqlite-snapshot-cache';
import { mobileCommandOutboxStore } from './src/offline/expo-sqlite-outbox-store';
import type {
  MobileOutboxEntry,
  MobileOutboxSummary,
} from './src/offline/mobile-command-outbox';
import {
  connectMobileCommandOutbox,
  isMobileOfflineError,
} from './src/offline/mobile-offline-commands';
import { createMobileOutboxDrainScheduler } from './src/offline/mobile-outbox-drain-scheduler';
import {
  connectMobileOfflineDashboard,
  shouldServeCachedDashboard,
} from './src/offline/mobile-offline-dashboard';
import {
  connectMobileOfflineAlerts,
  connectMobileOfflineDevices,
} from './src/offline/mobile-offline-surfaces';
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
  // One per server origin: the cache is namespaced by origin, so a build pointed at a second
  // server can never read the first server's snapshot.
  const offlineDashboard = useMemo(
    () =>
      connectMobileOfflineDashboard({
        apiOrigin: mobileSessionClient.origin,
        cache: mobileSnapshotCache,
      }),
    [],
  );
  // Same origin rule as the snapshot cache: a build pointed at a second server replays its commands
  // against that server only, never the first one.
  const offlineOutbox = useMemo(
    () =>
      connectMobileCommandOutbox({
        apiOrigin: mobileSessionClient.origin,
        store: mobileCommandOutboxStore,
        send: (entry) =>
          sendCapabilityCommand(
            mobileSessionClient,
            entry.deviceId,
            entry.capabilityKey,
            entry.value,
            entry.idempotencyKey,
          ),
      }),
    [],
  );
  const [outboxSummary, setOutboxSummary] = useState<MobileOutboxSummary>({
    failed: 0,
    pending: 0,
  });
  // The summary drives the banner counters; this holds the readable per-command rows the operator
  // needs offline, when "3 waiting" is not enough to know what is actually waiting.
  const [outboxEntries, setOutboxEntries] = useState<MobileOutboxEntry[]>([]);
  // Both directory surfaces share the one origin-namespaced snapshot cache with the dashboard.
  const offlineSurfaces = useMemo(
    () => ({
      alerts: connectMobileOfflineAlerts({
        apiOrigin: mobileSessionClient.origin,
        cache: mobileSnapshotCache,
      }),
      devices: connectMobileOfflineDevices({
        apiOrigin: mobileSessionClient.origin,
        cache: mobileSnapshotCache,
      }),
    }),
    [],
  );
  // A stable gateway object keeps the shell's load callbacks stable; the connectivity trigger is
  // routed through a ref so it always sees the latest session and dashboard selection.
  const connectivityProvenRef = useRef<() => void>(() => {});
  useEffect(() => {
    connectivityProvenRef.current = () => {
      if (!authenticatedTenantId) return;
      const selectedDashboardId =
        dashboardState.kind === 'ready' || dashboardState.kind === 'empty'
          ? dashboardState.experience.selectedDashboardId
          : null;
      void flushOutbox(authenticatedTenantId, selectedDashboardId);
    };
  });
  const offlineGateway = useMemo(
    () => ({
      onConnectivityProven: () => connectivityProvenRef.current(),
      readAlerts: (tenantId: string) => offlineSurfaces.alerts.read(tenantId),
      readDevices: (tenantId: string) => offlineSurfaces.devices.read(tenantId),
      rememberAlerts: (tenantId: string, alerts: MobileAlertsPayload) =>
        offlineSurfaces.alerts.remember(tenantId, alerts),
      rememberDevices: (tenantId: string, devices: MobileDeviceSummary[]) =>
        offlineSurfaces.devices.remember(tenantId, devices),
    }),
    [offlineSurfaces],
  );
  // The drain scheduler reads the latest flush through a ref for the same reason the connectivity
  // trigger does: the timer outlives any single render's closure. Its cadence runs only while
  // entries are waiting, and every app resume gets one attempt regardless.
  const flushOutboxNowRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushOutboxNowRef.current = () => {
      void flushOutboxNow();
    };
  });
  const outboxDrainScheduler = useMemo(
    () =>
      createMobileOutboxDrainScheduler({
        flush: () => flushOutboxNowRef.current(),
      }),
    [],
  );
  useEffect(() => {
    outboxDrainScheduler.setPending(outboxSummary.pending > 0);
  }, [outboxDrainScheduler, outboxSummary.pending]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') outboxDrainScheduler.onAppActive();
    });
    return () => {
      subscription.remove();
      outboxDrainScheduler.dispose();
    };
  }, [outboxDrainScheduler]);

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
    void refreshOutboxSummary(authenticatedTenantId);

    void loadMobileDashboardState(mobileSessionClient, null).then(
      (nextState) => {
        if (active) void settleDashboardState(nextState, null);
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
    // The cached snapshot and the pending command queue belong to the session that is ending; a
    // shared phone must neither offer the previous operator's dashboard nor replay their commands
    // under the next operator's session.
    void offlineDashboard.forget();
    void offlineOutbox.forget();
    setOutboxSummary({ failed: 0, pending: 0 });
    setOutboxEntries([]);
    setState(await logoutMobileAuth(mobileSessionClient));
  }

  async function retryBootstrap() {
    setState({ kind: 'booting' });
    setDashboardState({ kind: 'idle' });
    setState(await bootstrapMobileAuth(mobileSessionClient));
  }

  async function loadDashboard(selectedDashboardId: string | null) {
    setDashboardState({ kind: 'loading', selectedDashboardId });
    const nextState = await loadMobileDashboardState(
      mobileSessionClient,
      selectedDashboardId,
    );
    await settleDashboardState(nextState, selectedDashboardId);
  }

  /**
   * The one place where a network dashboard load is allowed to fall back to the offline snapshot.
   * `shouldServeCachedDashboard` restricts that to connectivity outages, so a rejected session or a
   * permission answer still renders as itself. Successful loads refresh the snapshot.
   */
  async function settleDashboardState(
    nextState: MobileDashboardState,
    selectedDashboardId: string | null,
  ) {
    if (authenticatedTenantId && shouldServeCachedDashboard(nextState)) {
      const cached = await offlineDashboard.read(
        authenticatedTenantId,
        selectedDashboardId,
      );
      if (cached) {
        setDashboardState({
          kind: cached.experience.selectedDashboardId ? 'ready' : 'empty',
          experience: cached.experience,
          cachedAt: cached.cachedAt,
        });
        return;
      }
    }

    applyDashboardState(nextState);

    if (authenticatedTenantId) {
      void offlineDashboard.remember(authenticatedTenantId, nextState);
      // A network answer proves connectivity is back, which is the only trigger the queue trusts:
      // a pass that sends something refreshes the dashboard so the UI shows acknowledged work
      // rather than the pre-queue state.
      if (nextState.kind === 'ready' || nextState.kind === 'empty') {
        void flushOutbox(authenticatedTenantId, selectedDashboardId);
      }
    }
  }

  async function refreshOutboxSummary(tenantId: string) {
    setOutboxSummary(await offlineOutbox.summary(tenantId));
    setOutboxEntries(await offlineOutbox.list(tenantId));
  }

  async function flushOutbox(
    tenantId: string,
    selectedDashboardId: string | null,
  ) {
    const sent = await offlineOutbox.flush(tenantId);
    await refreshOutboxSummary(tenantId);
    // Loading after a successful flush settles back into this function with an empty queue, so the
    // refresh cannot loop.
    if (sent > 0) await loadDashboard(selectedDashboardId);
  }

  async function flushOutboxNow() {
    if (!authenticatedTenantId) return;
    const selectedDashboardId =
      dashboardState.kind === 'ready' || dashboardState.kind === 'empty'
        ? dashboardState.experience.selectedDashboardId
        : null;
    const sent = await offlineOutbox.retryFailed(authenticatedTenantId);
    await refreshOutboxSummary(authenticatedTenantId);
    if (sent > 0) await loadDashboard(selectedDashboardId);
  }

  async function discardFailedCommands() {
    if (!authenticatedTenantId) return;
    await offlineOutbox.discardFailed(authenticatedTenantId);
    await refreshOutboxSummary(authenticatedTenantId);
  }

  async function retryQueuedCommand(entryId: string) {
    if (!authenticatedTenantId) return;
    const selectedDashboardId =
      dashboardState.kind === 'ready' || dashboardState.kind === 'empty'
        ? dashboardState.experience.selectedDashboardId
        : null;
    const sent = await offlineOutbox.retry(authenticatedTenantId, entryId);
    await refreshOutboxSummary(authenticatedTenantId);
    if (sent > 0) await loadDashboard(selectedDashboardId);
  }

  async function discardQueuedCommand(entryId: string) {
    if (!authenticatedTenantId) return;
    await offlineOutbox.discard(authenticatedTenantId, [entryId]);
    await refreshOutboxSummary(authenticatedTenantId);
  }

  async function sendDashboardCommand(
    deviceId: string,
    capabilityKey: string,
    value: unknown,
  ) {
    let accepted: { commandId: string; status: string };
    try {
      accepted = await sendCapabilityCommand(
        mobileSessionClient,
        deviceId,
        capabilityKey,
        value,
      );
    } catch (cause) {
      // Only an unreachable API queues: any other failure is a server verdict the operator must
      // see. A queued command reuses its stored idempotency key on every replay, so a response
      // lost in flight cannot execute twice.
      if (!authenticatedTenantId || !isMobileOfflineError(cause)) throw cause;
      const queued = await offlineOutbox.enqueue(authenticatedTenantId, {
        capabilityKey,
        deviceId,
        value,
      });
      if (!queued.ok) throw cause;
      void refreshOutboxSummary(authenticatedTenantId);
      return { commandId: queued.entry.id, status: 'QUEUED_OFFLINE' };
    }

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

    const selectedDashboardId =
      dashboardState.kind === 'ready' || dashboardState.kind === 'empty'
        ? dashboardState.experience.selectedDashboardId
        : null;
    // A successful send proves connectivity, so this is the cheapest honest moment to drain
    // anything the queue held while offline; one reload then covers both outcomes.
    const flushed = authenticatedTenantId
      ? await offlineOutbox.flush(authenticatedTenantId)
      : 0;
    if (authenticatedTenantId && flushed > 0) {
      await refreshOutboxSummary(authenticatedTenantId);
    }

    if (settled.terminal) {
      await loadDashboard(selectedDashboardId);
    } else if (flushed > 0) {
      // A drained queue changed server state too, so the dashboard refreshes from authorized data
      // even when this command has not reached a terminal result yet.
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
    <SafeAreaProvider>
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
          onDiscardFailed={discardFailedCommands}
          onDiscardQueuedCommand={discardQueuedCommand}
          onFlushOutbox={flushOutboxNow}
          onRetryQueuedCommand={retryQueuedCommand}
          offline={offlineGateway}
          outbox={outboxSummary}
          outboxEntries={outboxEntries}
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
    </SafeAreaProvider>
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
