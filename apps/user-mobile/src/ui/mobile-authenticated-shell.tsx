import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MobileDashboardState } from '../dashboard';
import {
  loadLatestTelemetry,
  loadMobileAlerts,
  loadMobileDeviceDetail,
  loadMobileDevices,
  type MobileAlertsPayload,
  type MobileDeviceDetail,
  type MobileDeviceSummary,
  type MobileTelemetryPoint,
} from '../device-control/mobile-device-client';
import { isMobileOfflineError } from '../offline/mobile-offline-commands';
import {
  loadMobileNotificationHistory,
  loadMobileNotificationSummary,
  type MobileNotificationHistory,
  type MobileNotificationSummary,
} from '../device-control/mobile-notification-client';
import {
  mobileMessages,
  type MobileLocale,
} from '../localization/messages';
import type {
  MobileOutboxEntry,
  MobileOutboxSummary,
} from '../offline/mobile-command-outbox';
import type { MobileAppearance } from '../settings/mobile-settings-store';
import { mobileSessionClient } from '../session';
import {
  MobileDashboardScreen,
  formatCachedAt,
} from './mobile-dashboard-screen';
import type { DashboardCopy } from './mobile-dashboard-widget';
import { MobileStateNotice } from './mobile-state-notice';
import { MobileAlertsPanel } from './mobile-alerts-panel';
import { MobileDeviceDetailPanel } from './mobile-device-detail-panel';
import { MobileNotificationDeliveryPanel } from './mobile-notification-delivery-panel';
import { MobileSettingsPanel } from './mobile-settings-panel';

type MobileTab = 'home' | 'devices' | 'realtime' | 'alerts' | 'profile';

interface MobileAuthenticatedShellProps {
  dashboardState: MobileDashboardState;
  isDark: boolean;
  pending: boolean;
  tenantId: string;
  /** App owns the palette, so the resolved appearance comes in rather than being decided here. */
  appearance: MobileAppearance;
  locale: MobileLocale;
  /** App owns both display settings, so the shell asks rather than writes. */
  onSelectLocale(locale: MobileLocale): Promise<void>;
  /** App performs the write, so App reports its outcome. */
  settingsError: string | null;
  storageUnavailable: boolean;
  onSelectAppearance(appearance: MobileAppearance): Promise<void>;
  onLogout(): Promise<void>;
  onRefreshDashboard(dashboardId: string | null): Promise<void>;
  onSelectDashboard(dashboardId: string): Promise<void>;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: unknown,
  ): Promise<{ commandId: string; status: string }>;
  /** App owns the offline outbox, so the shell renders its summary and asks it to act. */
  outbox: MobileOutboxSummary;
  /** The readable queued rows behind the counters, oldest first, straight from the outbox. */
  outboxEntries: MobileOutboxEntry[];
  onFlushOutbox(): Promise<void>;
  onDiscardFailed(): Promise<void>;
  onDiscardQueuedCommand(entryId: string): Promise<void>;
  onRetryQueuedCommand(entryId: string): Promise<void>;
  /**
   * App owns the offline snapshot cache, so the shell asks it for the last-known directory and
   * alerts instead of touching storage itself. `onConnectivityProven` fires after any validated
   * network read, which is the queue's cue that replaying is worth a pass.
   */
  offline: MobileShellOfflineGateway;
}

interface MobileShellOfflineGateway {
  onConnectivityProven(): void;
  readAlerts(
    tenantId: string,
  ): Promise<{ alerts: MobileAlertsPayload; cachedAt: string } | null>;
  readDevices(
    tenantId: string,
  ): Promise<{ cachedAt: string; devices: MobileDeviceSummary[] } | null>;
  rememberAlerts(tenantId: string, alerts: MobileAlertsPayload): Promise<boolean>;
  rememberDevices(
    tenantId: string,
    devices: MobileDeviceSummary[],
  ): Promise<boolean>;
}

/**
 * Tab labels come from the active locale's copy.
 *
 * They were literal English strings while every screen below them rendered Indonesian, so a
 * default-locale operator saw a mixed-language shell. Deriving the labels keeps the chrome and the
 * body in the same language instead of fixing only the half that already had a translation.
 */
const NAV_ITEMS: ReadonlyArray<{ key: MobileTab; labelKey: keyof typeof mobileMessages['en']['nav'] }> = [
  { key: 'home', labelKey: 'home' },
  { key: 'devices', labelKey: 'devices' },
  { key: 'realtime', labelKey: 'realtime' },
  { key: 'alerts', labelKey: 'alerts' },
  { key: 'profile', labelKey: 'profile' },
];

export function MobileAuthenticatedShell({
  dashboardState,
  appearance,
  isDark,
  locale,
  onSelectAppearance,
  onSelectLocale,
  pending,
  settingsError,
  storageUnavailable,
  tenantId,
  onLogout,
  onRefreshDashboard,
  onSelectDashboard,
  onSendCommand,
  outbox,
  outboxEntries,
  onFlushOutbox,
  onDiscardFailed,
  onDiscardQueuedCommand,
  onRetryQueuedCommand,
  offline,
}: MobileAuthenticatedShellProps) {
  // The locale drives every string below, so it is read from the device before the first render of
  // copy. Until it resolves the default is used, which is the same thing the store falls back to on
  // a fresh install -- so there is no flash of a language the operator did not choose.


  const copy = mobileMessages[locale];
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MobileTab>('home');
  const [devices, setDevices] = useState<MobileDeviceSummary[]>([]);
  // Queue rows name their device the way the directory does. When the roster has not loaded (first
  // offline start on a fresh cache) the row falls back to the raw id rather than inventing a label.
  const deviceNames = useMemo(
    () =>
      Object.fromEntries(devices.map((device) => [device.id, device.name])),
    [devices],
  );
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryCachedAt, setInventoryCachedAt] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<MobileTelemetryPoint[]>([]);
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [detailDeviceId, setDetailDeviceId] = useState<string | null>(null);
  const [deviceDetail, setDeviceDetail] = useState<MobileDeviceDetail | null>(null);
  const [deviceDetailLoading, setDeviceDetailLoading] = useState(false);
  const [deviceDetailError, setDeviceDetailError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<MobileAlertsPayload | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsCachedAt, setAlertsCachedAt] = useState<string | null>(null);
  // `null`, not `[]`: the history has not been read yet until a request has actually answered, and
  // a first render must be distinguishable from a render after an outage.
  const [notificationHistory, setNotificationHistory] =
    useState<MobileNotificationHistory | null>(null);
  const [notificationSummary, setNotificationSummary] =
    useState<MobileNotificationSummary | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationHistoryError, setNotificationHistoryError] = useState<
    string | null
  >(null);

  const applyDeviceRows = useCallback((rows: MobileDeviceSummary[]) => {
    setDevices(rows);
    setSelectedDeviceId((current) =>
      current && rows.some((device) => device.id === current)
        ? current
        : rows[0]?.id ?? null,
    );
    setDetailDeviceId((current) =>
      current && rows.some((device) => device.id === current) ? current : null,
    );
  }, []);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const rows = await loadMobileDevices(mobileSessionClient);
      applyDeviceRows(rows);
      setInventoryCachedAt(null);
      offline.onConnectivityProven();
      void offline.rememberDevices(tenantId, rows);
    } catch (cause) {
      // A connectivity outage serves the last directory this device validated; any other failure
      // (rejected session, permissions) is an answer and must render as itself.
      const cached = isMobileOfflineError(cause)
        ? await offline.readDevices(tenantId)
        : null;
      if (cached) {
        applyDeviceRows(cached.devices);
        setInventoryCachedAt(cached.cachedAt);
      } else {
        setDevices([]);
        setSelectedDeviceId(null);
        setInventoryCachedAt(null);
        setInventoryError('Daftar perangkat belum dapat dimuat dari API tenant.');
      }
    } finally {
      setInventoryLoading(false);
    }
  }, [applyDeviceRows, offline, tenantId]);

  const loadTelemetry = useCallback(async (deviceId: string | null) => {
    if (!deviceId) {
      setTelemetry([]);
      setTelemetryError(null);
      return;
    }

    setTelemetryLoading(true);
    setTelemetryError(null);
    try {
      setTelemetry(await loadLatestTelemetry(mobileSessionClient, deviceId));
    } catch {
      setTelemetry([]);
      setTelemetryError('Telemetry terbaru belum dapat dibaca untuk perangkat ini.');
    } finally {
      setTelemetryLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (deviceId: string) => {
    const summary = devices.find((device) => device.id === deviceId);
    if (!summary) {
      setDeviceDetail(null);
      setDeviceDetailError('Perangkat tidak lagi tersedia pada workspace user.');
      return;
    }

    setDeviceDetailLoading(true);
    setDeviceDetailError(null);
    try {
      setDeviceDetail(await loadMobileDeviceDetail(mobileSessionClient, summary));
    } catch {
      setDeviceDetail(null);
      setDeviceDetailError('Device Detail belum dapat dimuat dari backend.');
    } finally {
      setDeviceDetailLoading(false);
    }
  }, [devices]);

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const payload = await loadMobileAlerts(mobileSessionClient);
      setAlerts(payload);
      setAlertsCachedAt(null);
      offline.onConnectivityProven();
      void offline.rememberAlerts(tenantId, payload);
    } catch (cause) {
      const cached = isMobileOfflineError(cause)
        ? await offline.readAlerts(tenantId)
        : null;
      if (cached) {
        setAlerts(cached.alerts);
        setAlertsCachedAt(cached.cachedAt);
      } else {
        setAlerts(null);
        setAlertsCachedAt(null);
        setAlertsError('Alerts analitik belum dapat dimuat dari backend.');
      }
    } finally {
      setAlertsLoading(false);
    }
  }, [offline, tenantId]);

  /**
   * Load the delivery log and its summary together.
   *
   * The summary is a convenience and the history is the point, so a failed summary does not blank
   * the rows: they are two requests answering two questions, and one of them failing is not a
   * reason to report the other as unread.
   */
  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    setNotificationHistoryError(null);
    try {
      const [history, summary] = await Promise.all([
        loadMobileNotificationHistory(mobileSessionClient),
        loadMobileNotificationSummary(mobileSessionClient).catch(() => null),
      ]);
      setNotificationHistory(history);
      setNotificationSummary(summary);
    } catch (cause) {
      // Both cleared, so a stale list from a previous read cannot sit under an error line.
      setNotificationHistory(null);
      setNotificationSummary(null);
      setNotificationHistoryError(
        cause instanceof Error
          ? cause.message
          : 'Riwayat pengiriman notifikasi belum dapat dimuat dari backend.',
      );
    } finally {
      setNotificationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'alerts') {
      void loadNotifications();
    }
  }, [tab, loadNotifications]);

  useEffect(() => {
    if (tab === 'devices' || tab === 'realtime') {
      void loadInventory();
    }
  }, [tab, loadInventory]);

  useEffect(() => {
    if (tab === 'realtime') {
      void loadTelemetry(selectedDeviceId);
    }
  }, [tab, selectedDeviceId, loadTelemetry]);

  useEffect(() => {
    if (tab === 'devices' && detailDeviceId) {
      void loadDetail(detailDeviceId);
    }
  }, [tab, detailDeviceId, loadDetail]);

  useEffect(() => {
    if (tab === 'alerts') {
      void loadAlerts();
    }
  }, [tab, loadAlerts]);

  /**
   * Read the device's display settings once, on mount.
   *
   * A failure here sets `storageUnavailable` rather than falling back silently. The difference
   * matters to the profile screen: "you are on defaults" is a fact about the operator's choice,
   * "I cannot read what you chose" is a fact about the phone, and showing the first while the second
   * is true is a claim the app cannot support.
   */
  /**
   * Choose a locale by asking App, which owns the setting.
   *
   * The shell does not write it. Two writers for one setting is two copies of the truth, and the
   * one that forgets is the one an operator meets on their next sign-in.
   */
  const selectLocale = useCallback(
    (next: MobileLocale) => {
      void onSelectLocale(next);
    },
    [onSelectLocale],
  );

  const selectAppearance = useCallback(
    (next: MobileAppearance) => {
      void onSelectAppearance(next);
    },
    [onSelectAppearance],
  );

  return (
    <View style={[styles.shell, isDark && styles.shellDark]}>
      <View
        style={[
          styles.header,
          isDark && styles.cardDark,
          { paddingTop: 18 + insets.top },
        ]}
      >
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, isDark && styles.textMutedDark]}>
            {copy.authenticated.eyebrow}
          </Text>
          <Text accessibilityRole="header" style={[styles.title, isDark && styles.textDark]}>
            {copy.appName}
          </Text>
          <Text style={[styles.description, isDark && styles.textMutedDark]}>
            {activeTabDescription(tab)}
          </Text>
        </View>
        <View
          accessibilityLabel={`${copy.authenticated.tenantLabel}: ${tenantId}`}
          accessibilityRole="summary"
          style={[styles.tenantBadge, isDark && styles.tenantBadgeDark]}
        >
          <Text style={[styles.tenantLabel, isDark && styles.textMutedDark]}>
            {copy.authenticated.tenantLabel}
          </Text>
          <Text selectable style={[styles.tenantId, isDark && styles.textDark]}>
            {tenantId}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'home' ? (
          <MobileDashboardScreen
            deviceNames={deviceNames}
            isDark={isDark}
            locale={locale}
            onDiscardFailed={onDiscardFailed}
            onDiscardQueuedCommand={onDiscardQueuedCommand}
            onFlushOutbox={onFlushOutbox}
            onRefresh={onRefreshDashboard}
            onRetryQueuedCommand={onRetryQueuedCommand}
            onSelectDashboard={onSelectDashboard}
            onSendCommand={onSendCommand}
            outbox={outbox}
            outboxEntries={outboxEntries}
            state={dashboardState}
          />
        ) : null}

        {tab === 'devices' ? (
          detailDeviceId ? (
            <MobileDeviceDetailPanel
              detail={deviceDetail}
              error={deviceDetailError}
              isDark={isDark}
              loading={deviceDetailLoading}
              onBack={() => { setDetailDeviceId(null); setDeviceDetail(null); setDeviceDetailError(null); }}
              onRefresh={() => loadDetail(detailDeviceId)}
              onSendCommand={onSendCommand}
            />
          ) : (
            <View style={styles.sectionGap}>
              <CachedSurfaceBanner
                cachedAt={inventoryCachedAt}
                copy={copy.dashboard}
                isDark={isDark}
              />
              <DeviceDirectory
                devices={devices}
                error={inventoryError}
                isDark={isDark}
                loading={inventoryLoading}
                onOpenDevice={setDetailDeviceId}
                onRefresh={loadInventory}
              />
            </View>
          )
        ) : null}

        {tab === 'realtime' ? (
          <View style={styles.sectionGap}>
            <CachedSurfaceBanner
              cachedAt={inventoryCachedAt}
              copy={copy.dashboard}
              isDark={isDark}
            />
            <RealtimePanel
              devices={devices}
              inventoryError={inventoryError}
              inventoryLoading={inventoryLoading}
              isDark={isDark}
              onRefreshInventory={loadInventory}
              onRefreshTelemetry={() => loadTelemetry(selectedDeviceId)}
              onSelectDevice={setSelectedDeviceId}
              selectedDeviceId={selectedDeviceId}
              telemetry={telemetry}
              telemetryError={telemetryError}
              telemetryLoading={telemetryLoading}
            />
          </View>
        ) : null}

        {tab === 'alerts' ? (
          <View style={styles.sectionGap}>
            <CachedSurfaceBanner
              cachedAt={alertsCachedAt}
              copy={copy.dashboard}
              isDark={isDark}
            />
            <MobileAlertsPanel
              error={alertsError}
              isDark={isDark}
              loading={alertsLoading}
              onRefresh={loadAlerts}
              payload={alerts}
            />
            {/* The delivery half. It sits under the analytics findings rather than on its own tab
                because the two are read together: a finding is what the detector noticed, a delivery
                row is whether the message about it left the building. */}
            <MobileNotificationDeliveryPanel
              error={notificationHistoryError}
              history={notificationHistory}
              isDark={isDark}
              loading={notificationLoading}
              onRefresh={loadNotifications}
              summary={notificationSummary}
            />
          </View>
        ) : null}

        {tab === 'profile' ? (
          <View style={styles.sectionGap}>
            <InfoCard
              isDark={isDark}
              title={copy.authenticated.statusTitle}
              description={copy.authenticated.statusDescription}
            />
            <InfoCard
              isDark={isDark}
              title={copy.authenticated.tenantLabel}
              description={tenantId}
            />
            <MobileSettingsPanel
              appearance={appearance}
              error={settingsError}
              isDark={isDark}
              locale={locale}
              onSelectAppearance={selectAppearance}
              onSelectLocale={selectLocale}
              storageUnavailable={storageUnavailable}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: pending, disabled: pending }}
              disabled={pending}
              onPress={() => void onLogout()}
              style={({ pressed }) => [
                styles.actionButton,
                isDark && styles.actionButtonDark,
                pending && styles.buttonDisabled,
                pressed && !pending && styles.buttonPressed,
              ]}
            >
              <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
                {pending
                  ? copy.authenticated.pendingLogoutAction
                  : copy.authenticated.logoutAction}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View
        accessibilityLabel="Navigasi utama mobile"
        accessibilityRole="tablist"
        style={[
          styles.navBar,
          isDark && styles.navBarDark,
          { paddingBottom: 8 + insets.bottom },
        ]}
      >
        {NAV_ITEMS.map((item) => {
          const selected = item.key === tab;
          const label = copy.nav[item.labelKey];
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={item.key}
              onPress={() => setTab(item.key)}
              style={({ pressed }) => [
                styles.navItem,
                isDark && styles.navItemDark,
                selected &&
                  (isDark ? styles.navItemSelectedDark : styles.navItemSelected),
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                style={[
                  styles.navLabel,
                  isDark && styles.textDark,
                  selected &&
                    (isDark ? styles.navLabelSelectedDark : styles.navLabelSelected),
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The cached-mode banner for the directory surfaces. It reuses the dashboard's offline copy on
 * purpose: "offline mode, data stored at <time>" states the same fact on every surface, and one
 * wording means the translation cannot drift between tabs.
 */
function CachedSurfaceBanner({
  cachedAt,
  copy,
  isDark,
}: {
  cachedAt: string | null;
  copy: DashboardCopy;
  isDark: boolean;
}) {
  if (!cachedAt) return null;
  return (
    <MobileStateNotice
      isDark={isDark}
      notice={{
        tone: 'offline',
        title: copy.offlineCachedTitle,
        message: `${copy.offlineCachedPrefix} ${formatCachedAt(cachedAt)}`,
        requestId: null,
      }}
    />
  );
}

function DeviceDirectory({
  devices,
  error,
  isDark,
  loading,
  onOpenDevice,
  onRefresh,
}: {
  devices: MobileDeviceSummary[];
  error: string | null;
  isDark: boolean;
  loading: boolean;
  onOpenDevice(deviceId: string): void;
  onRefresh(): Promise<void>;
}) {
  return (
    <View style={styles.sectionGap}>
      <SectionHeading
        isDark={isDark}
        title="Perangkat Saya"
        description="Hanya perangkat yang dimiliki atau dibagikan ke akun ini yang dikirim oleh API."
      />
      {error ? <InfoCard isDark={isDark} title="Perangkat tidak tersedia" description={error} /> : null}
      {!loading && !error && devices.length === 0 ? (
        <InfoCard
          isDark={isDark}
          title="Belum ada perangkat"
          description="Tidak ada perangkat yang dapat dilihat oleh akun ini."
        />
      ) : null}
      {devices.map((device) => (
        <View key={device.id} style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.rowBetween}>
            <View style={styles.flexOne}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>{device.name}</Text>
              <Text style={[styles.cardMeta, isDark && styles.textMutedDark]}>
                {device.type ?? 'Perangkat'} · {device.status}
              </Text>
            </View>
            <Text style={[styles.statusPill, isDark && styles.statusPillDark]}>{device.status}</Text>
          </View>
          <Text style={[styles.cardMeta, isDark && styles.textMutedDark]}>
            Heartbeat: {device.lastHeartbeatAt ?? 'belum tersedia'}
          </Text>
          <Text style={[styles.cardMeta, isDark && styles.textMutedDark]}>
            {device.roomPath ?? 'Belum ditempatkan ke ROOM'} · {device.canControl ? 'VIEW + CONTROL' : 'VIEW'}
          </Text>
          <ActionButton compact isDark={isDark} label="Buka Device Detail" onPress={async () => onOpenDevice(device.id)} />
        </View>
      ))}
      <ActionButton
        isDark={isDark}
        label={loading ? 'Memuat perangkat…' : 'Perbarui perangkat'}
        onPress={onRefresh}
        disabled={loading}
      />
    </View>
  );
}

function RealtimePanel({
  devices,
  inventoryError,
  inventoryLoading,
  isDark,
  onRefreshInventory,
  onRefreshTelemetry,
  onSelectDevice,
  selectedDeviceId,
  telemetry,
  telemetryError,
  telemetryLoading,
}: {
  devices: MobileDeviceSummary[];
  inventoryError: string | null;
  inventoryLoading: boolean;
  isDark: boolean;
  onRefreshInventory(): Promise<void>;
  onRefreshTelemetry(): Promise<void>;
  onSelectDevice(deviceId: string): void;
  selectedDeviceId: string | null;
  telemetry: MobileTelemetryPoint[];
  telemetryError: string | null;
  telemetryLoading: boolean;
}) {
  return (
    <View style={styles.sectionGap}>
      <SectionHeading
        isDark={isDark}
        title="Realtime Telemetry"
        description="Nilai berasal dari endpoint telemetry terbaru untuk perangkat yang dapat dilihat akun ini."
      />
      {inventoryError ? (
        <InfoCard isDark={isDark} title="Daftar perangkat tidak tersedia" description={inventoryError} />
      ) : null}
      <ScrollView
        contentContainerStyle={styles.deviceSelector}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {devices.map((device) => {
          const selected = device.id === selectedDeviceId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={device.id}
              onPress={() => onSelectDevice(device.id)}
              style={[
                styles.deviceChip,
                isDark && styles.deviceChipDark,
                selected && styles.deviceChipSelected,
              ]}
            >
              <Text style={[styles.deviceChipText, isDark && styles.textDark]}>{device.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!inventoryLoading && !inventoryError && devices.length === 0 ? (
        <InfoCard
          isDark={isDark}
          title="Belum ada perangkat"
          description="Telemetry tidak dapat dipilih karena akun ini belum memiliki perangkat yang dapat dilihat."
        />
      ) : null}
      {telemetryError ? (
        <InfoCard isDark={isDark} title="Telemetry tidak tersedia" description={telemetryError} />
      ) : null}
      {!telemetryLoading && !telemetryError && selectedDeviceId && telemetry.length === 0 ? (
        <InfoCard
          isDark={isDark}
          title="Belum ada telemetry"
          description="Perangkat belum memiliki telemetry terbaru yang dapat ditampilkan."
        />
      ) : null}
      {telemetry.map((point) => (
        <View key={point.capabilityKey} style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.telemetryValue, isDark && styles.textDark]}>{String(point.value)}</Text>
          <Text style={[styles.cardTitle, isDark && styles.textDark]}>{point.capabilityKey}</Text>
          <Text style={[styles.cardMeta, isDark && styles.textMutedDark]}>
            {point.recordedAt || 'waktu belum tersedia'}
          </Text>
        </View>
      ))}
      <View style={styles.actionRow}>
        <ActionButton
          compact
          disabled={inventoryLoading}
          isDark={isDark}
          label={inventoryLoading ? 'Memuat…' : 'Perangkat'}
          onPress={onRefreshInventory}
        />
        <ActionButton
          compact
          disabled={telemetryLoading || !selectedDeviceId}
          isDark={isDark}
          label={telemetryLoading ? 'Memuat…' : 'Telemetry'}
          onPress={onRefreshTelemetry}
        />
      </View>
    </View>
  );
}

function SectionHeading({
  description,
  isDark,
  title,
}: {
  description: string;
  isDark: boolean;
  title: string;
}) {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, isDark && styles.textDark]}>{title}</Text>
      <Text style={[styles.description, isDark && styles.textMutedDark]}>{description}</Text>
    </View>
  );
}

function InfoCard({
  description,
  isDark,
  title,
}: {
  description: string;
  isDark: boolean;
  title: string;
}) {
  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.cardTitle, isDark && styles.textDark]}>{title}</Text>
      <Text style={[styles.description, isDark && styles.textMutedDark]}>{description}</Text>
    </View>
  );
}

function ActionButton({
  compact = false,
  disabled = false,
  isDark,
  label,
  onPress,
}: {
  compact?: boolean;
  disabled?: boolean;
  isDark: boolean;
  label: string;
  onPress(): Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.actionButton,
        compact && styles.actionButtonCompact,
        isDark && styles.actionButtonDark,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.actionButtonText, isDark && styles.textDark]}>{label}</Text>
    </Pressable>
  );
}

function activeTabDescription(tab: MobileTab): string {
  switch (tab) {
    case 'home':
      return 'Dashboard capability-driven dan kontrol perangkat yang telah diotorisasi.';
    case 'devices':
      return 'Direktori room-aware dengan Device Detail, history, settings evidence, dan kontrol terotorisasi.';
    case 'realtime':
      return 'Telemetry terbaru dari perangkat yang dapat dilihat akun ini.';
    case 'alerts':
      return 'WARNING/CRITICAL Module 16 untuk perangkat yang dapat dilihat; bukan notification-delivery history.';
    case 'profile':
      return 'Identitas tenant dan kontrol sesi aman perangkat.';
  }
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#f5f7fb' },
  shellDark: { backgroundColor: '#111827' },
  header: {
    gap: 14,
    borderBottomColor: '#dbe3ef',
    borderBottomWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingBottom: 14,
    paddingTop: 18,
  },
  headerCopy: { gap: 3 },
  eyebrow: { color: '#475569', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '800' },
  description: { color: '#475569', fontSize: 14, lineHeight: 21 },
  tenantBadge: { alignSelf: 'flex-start', borderColor: '#99f6e4', borderRadius: 10, borderWidth: 1, backgroundColor: '#ccfbf1', paddingHorizontal: 12, paddingVertical: 8 },
  tenantBadgeDark: { borderColor: '#0f766e', backgroundColor: 'rgba(45, 212, 191, 0.14)' },
  tenantLabel: { color: '#475569', fontSize: 11, fontWeight: '600' },
  tenantId: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  content: { gap: 16, paddingHorizontal: 16, paddingVertical: 18, paddingBottom: 28 },
  sectionGap: { gap: 12 },
  heading: { gap: 4 },
  sectionTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  card: { gap: 8, borderColor: '#dbe3ef', borderRadius: 16, borderWidth: 1, backgroundColor: '#ffffff', padding: 15 },
  cardDark: { borderColor: '#334155', backgroundColor: '#1e293b' },
  cardTitle: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  cardMeta: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  flexOne: { flex: 1, gap: 3 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#e2e8f0', color: '#334155', fontSize: 11, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4 },
  statusPillDark: { backgroundColor: '#334155', color: '#e2e8f0' },
  telemetryValue: { color: '#0f766e', fontSize: 30, fontWeight: '800' },
  deviceSelector: { gap: 8, paddingVertical: 2 },
  deviceChip: { borderColor: '#cbd5e1', borderRadius: 999, borderWidth: 1, backgroundColor: '#ffffff', paddingHorizontal: 13, paddingVertical: 8 },
  deviceChipDark: { borderColor: '#475569', backgroundColor: '#1e293b' },
  deviceChipSelected: { borderColor: '#14b8a6', backgroundColor: '#ccfbf1' },
  deviceChipText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderColor: '#94a3b8', borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  actionButtonCompact: { flex: 1, minHeight: 42 },
  actionButtonDark: { borderColor: '#64748b' },
  actionButtonText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  buttonDisabled: { opacity: 0.55 },
  buttonPressed: { opacity: 0.78 },
  navBar: { flexDirection: 'row', borderTopColor: '#dbe3ef', borderTopWidth: 1, backgroundColor: '#ffffff', paddingBottom: 8, paddingHorizontal: 6, paddingTop: 8 },
  navBarDark: { borderTopColor: '#334155', backgroundColor: '#1e293b' },
  navItem: { flex: 1, alignItems: 'center', borderRadius: 10, paddingHorizontal: 4, paddingVertical: 9 },
  navItemDark: { backgroundColor: 'transparent' },
  navItemSelected: { backgroundColor: '#ccfbf1' },
  navItemSelectedDark: { backgroundColor: 'rgba(45, 212, 191, 0.16)' },
  navLabel: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  navLabelSelected: { color: '#0f766e' },
  navLabelSelectedDark: { color: '#2dd4bf' },
  textDark: { color: '#f8fafc' },
  textMutedDark: { color: '#cbd5e1' },
});
