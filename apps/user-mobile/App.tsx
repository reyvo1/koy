import { useEffect, useState } from 'react';
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
  sendBooleanCapabilityCommand,
} from './src/device-control/mobile-device-client';
import { mobileSessionClient } from './src/session';
import { MobileAuthenticatedShell } from './src/ui/mobile-authenticated-shell';
import { MobileBlockedScreen } from './src/ui/mobile-blocked-screen';
import { MobileLoginScreen } from './src/ui/mobile-login-screen';
import { MobileStateNotice } from './src/ui/mobile-state-notice';

export default function App() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
    value: boolean,
  ) {
    const accepted = await sendBooleanCapabilityCommand(
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
          isDark={isDark}
          notice={state.notice}
          onSubmit={login}
          pending={state.kind === 'authenticating'}
        />
      ) : null}

      {state.kind === 'authenticated' || state.kind === 'logging-out' ? (
        <MobileAuthenticatedShell
          dashboardState={dashboardState}
          isDark={isDark}
          onLogout={() => logout(state.tenantId)}
          onRefreshDashboard={loadDashboard}
          onSelectDashboard={loadDashboard}
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
