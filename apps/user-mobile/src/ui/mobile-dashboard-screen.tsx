import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileMessages, type MobileLocale } from '../localization/messages';

import type {
  MobileDashboardExperience,
  MobileDashboardState,
  MobileResolvedWidget,
} from '../dashboard';
import type {
  MobileOutboxEntry,
  MobileOutboxSummary,
} from '../offline/mobile-command-outbox';
import { MobileDashboardWidgetCard, type DashboardCopy } from './mobile-dashboard-widget';
import { MobileStateNotice } from './mobile-state-notice';

interface MobileDashboardScreenProps {
  isDark: boolean;
  locale: MobileLocale;
  state: MobileDashboardState;
  outbox: MobileOutboxSummary;
  /**
   * The rows behind the counters and the directory's names for them. The rows are the operator's
   * only way to check what is actually queued while offline; without them "3 waiting" is a number
   * they have to trust instead of verify.
   */
  outboxEntries: MobileOutboxEntry[];
  deviceNames: Record<string, string>;
  onRefresh(selectedDashboardId: string | null): Promise<void>;
  onSelectDashboard(dashboardId: string): Promise<void>;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
  onFlushOutbox(): Promise<void>;
  onDiscardFailed(): Promise<void>;
  onRetryQueuedCommand(entryId: string): Promise<void>;
  onDiscardQueuedCommand(entryId: string): Promise<void>;
}

export function MobileDashboardScreen({
  locale,
  isDark,
  state,
  outbox,
  outboxEntries,
  deviceNames,
  onRefresh,
  onSelectDashboard,
  onSendCommand,
  onFlushOutbox,
  onDiscardFailed,
  onRetryQueuedCommand,
  onDiscardQueuedCommand,
}: MobileDashboardScreenProps) {
  const copy = mobileMessages[locale].dashboard;

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <View style={styles.section}>
        <SectionHeading
          isDark={isDark}
          title={copy.title}
          description={copy.loadingDescription}
        />
        <MobileStateNotice
          isDark={isDark}
          notice={{
            tone: 'offline',
            title: copy.loadingTitle,
            message: copy.loadingMessage,
            requestId: null,
          }}
        />
      </View>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <View style={styles.section}>
        <SectionHeading
          isDark={isDark}
          title={copy.title}
          description={copy.unavailableDescription}
        />
        <MobileStateNotice isDark={isDark} notice={state.notice} />
        <OutboxBanner
          copy={copy}
          deviceNames={deviceNames}
          entries={outboxEntries}
          isDark={isDark}
          onDiscardFailed={onDiscardFailed}
          onDiscardQueuedCommand={onDiscardQueuedCommand}
          onFlushOutbox={onFlushOutbox}
          onRetryQueuedCommand={onRetryQueuedCommand}
          outbox={outbox}
        />
        <ActionButton
          isDark={isDark}
          label={copy.retryAction}
          onPress={() => onRefresh(state.selectedDashboardId)}
        />
      </View>
    );
  }

  if (state.kind === 'session-expired') {
    return null;
  }

  const experience = state.experience;

  return (
    <View style={styles.section}>
      <SectionHeading
        isDark={isDark}
        title={copy.title}
        description={copy.readyDescription}
      />

      {state.cachedAt ? (
        <MobileStateNotice
          isDark={isDark}
          notice={{
            tone: 'offline',
            title: copy.offlineCachedTitle,
            message: `${copy.offlineCachedPrefix} ${formatCachedAt(state.cachedAt)}`,
            requestId: null,
          }}
        />
      ) : null}

      <OutboxBanner
        copy={copy}
        deviceNames={deviceNames}
        entries={outboxEntries}
        isDark={isDark}
        onDiscardFailed={onDiscardFailed}
        onDiscardQueuedCommand={onDiscardQueuedCommand}
        onFlushOutbox={onFlushOutbox}
        onRetryQueuedCommand={onRetryQueuedCommand}
        outbox={outbox}
      />

      <DashboardSelector
        copy={copy}
        experience={experience}
        isDark={isDark}
        onSelectDashboard={onSelectDashboard}
      />

      {state.kind === 'empty' ? (
        <View style={[styles.emptyCard, isDark && styles.cardDark]}>
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            {copy.emptyTitle}
          </Text>
          <Text style={[styles.emptyText, isDark && styles.textMutedDark]}>
            {copy.emptyMessage}
          </Text>
        </View>
      ) : (
        <DashboardContent
          locale={locale}
          experience={experience}
          isDark={isDark}
          onSendCommand={onSendCommand}
        />
      )}

      <ActionButton
        isDark={isDark}
        label={copy.refreshAction}
        onPress={() => onRefresh(experience.selectedDashboardId)}
      />
    </View>
  );
}

const OUTBOX_VISIBLE_ROWS = 6;

function formatOutboxValue(value: MobileOutboxEntry['value']): string {
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return String(value);
}

function OutboxBanner({
  copy,
  deviceNames,
  entries,
  isDark,
  outbox,
  onFlushOutbox,
  onDiscardFailed,
  onRetryQueuedCommand,
  onDiscardQueuedCommand,
}: {
  copy: DashboardCopy;
  deviceNames: Record<string, string>;
  entries: MobileOutboxEntry[];
  isDark: boolean;
  outbox: MobileOutboxSummary;
  onFlushOutbox(): Promise<void>;
  onDiscardFailed(): Promise<void>;
  onRetryQueuedCommand(entryId: string): Promise<void>;
  onDiscardQueuedCommand(entryId: string): Promise<void>;
}) {
  if (outbox.pending === 0 && outbox.failed === 0) return null;

  const parts: string[] = [];
  if (outbox.pending > 0) parts.push(`${copy.outboxPendingPrefix} ${outbox.pending}`);
  if (outbox.failed > 0) parts.push(`${copy.outboxFailedPrefix} ${outbox.failed}`);
  const hiddenRows = entries.length - OUTBOX_VISIBLE_ROWS;

  return (
    <View>
      <MobileStateNotice
        isDark={isDark}
        notice={{
          tone: 'offline',
          title: copy.outboxPendingTitle,
          message: parts.join(' · '),
          requestId: null,
        }}
      />
      {entries.length > 0 ? (
        <View style={[styles.outboxList, isDark && styles.cardDark]}>
          {entries.slice(0, OUTBOX_VISIBLE_ROWS).map((entry) => (
            <View key={entry.id} style={styles.outboxRow}>
              <View style={styles.outboxRowInfo}>
                <Text
                  numberOfLines={1}
                  style={[styles.outboxRowTitle, isDark && styles.textDark]}
                >
                  {deviceNames[entry.deviceId] ?? entry.deviceId}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.outboxRowMeta, isDark && styles.textMutedDark]}
                >
                  {[
                    entry.capabilityKey,
                    formatOutboxValue(entry.value),
                    entry.status === 'failed'
                      ? copy.outboxRowFailed
                      : copy.outboxRowQueued,
                    formatCachedAt(entry.enqueuedAt),
                  ].join(' · ')}
                </Text>
              </View>
              <View style={styles.outboxRowActions}>
                {entry.status === 'failed' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void onRetryQueuedCommand(entry.id)}
                    style={({ pressed }) => [
                      styles.outboxRowButton,
                      isDark && styles.outboxRowButtonDark,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text
                      style={[styles.outboxRowButtonText, isDark && styles.textDark]}
                    >
                      {copy.outboxRowRetryAction}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void onDiscardQueuedCommand(entry.id)}
                  style={({ pressed }) => [
                    styles.outboxRowButton,
                    isDark && styles.outboxRowButtonDark,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text
                    style={[styles.outboxRowButtonText, isDark && styles.textDark]}
                  >
                    {copy.outboxRowDiscardAction}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
          {hiddenRows > 0 ? (
            <Text
              numberOfLines={1}
              style={[styles.outboxRowMeta, isDark && styles.textMutedDark]}
            >
              {`+${hiddenRows} ${copy.outboxMoreLabel}`}
            </Text>
          ) : null}
        </View>
      ) : null}
      <ActionButton
        isDark={isDark}
        label={copy.outboxFlushAction}
        onPress={onFlushOutbox}
      />
      {outbox.failed > 0 ? (
        <ActionButton
          isDark={isDark}
          label={copy.outboxDiscardAction}
          onPress={onDiscardFailed}
        />
      ) : null}
    </View>
  );
}

function DashboardSelector({
  copy,
  experience,
  isDark,
  onSelectDashboard,
}: {
  copy: DashboardCopy;
  experience: MobileDashboardExperience;
  isDark: boolean;
  onSelectDashboard(dashboardId: string): Promise<void>;
}) {
  if (experience.dashboards.length <= 1) return null;

  return (
    <View style={styles.selectorSection}>
      <Text style={[styles.selectorLabel, isDark && styles.textDark]}>
        {copy.selectorLabel}
      </Text>
      <ScrollView
        accessibilityLabel={
          copy.selectorAccessibilityLabel
        }
        contentContainerStyle={styles.selector}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {experience.dashboards.map((dashboard) => {
          const selected = dashboard.id === experience.selectedDashboardId;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={dashboard.id}
              onPress={() => void onSelectDashboard(dashboard.id)}
              style={({ pressed }) => [
                styles.selectorButton,
                isDark && styles.selectorButtonDark,
                selected && styles.selectorButtonSelected,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text
                style={[
                  styles.selectorButtonText,
                  isDark && styles.textDark,
                  selected && styles.selectorButtonTextSelected,
                ]}
              >
                {dashboard.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DashboardContent({
  experience,
  isDark,
  locale,
  onSendCommand,
}: {
  experience: MobileDashboardExperience;
  isDark: boolean;
  locale: MobileLocale;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
}) {
  const selected = experience.dashboards.find(
    (dashboard) => dashboard.id === experience.selectedDashboardId,
  );
  const orderedWidgets = orderWidgets(experience);

  return (
    <View style={styles.dashboardContent}>
      <View>
        <Text
          accessibilityRole="header"
          style={[styles.dashboardTitle, isDark && styles.textDark]}
        >
          {selected?.name ?? 'Dashboard tenant'}
        </Text>
        {selected?.description ? (
          <Text
            style={[
              styles.dashboardDescription,
              isDark && styles.textMutedDark,
            ]}
          >
            {selected.description}
          </Text>
        ) : null}
      </View>

      {orderedWidgets.length === 0 ? (
        <View style={[styles.emptyCard, isDark && styles.cardDark]}>
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            Dashboard belum memiliki widget
          </Text>
          <Text style={[styles.emptyText, isDark && styles.textMutedDark]}>
            Layout dapat dibaca, tetapi belum ada widget untuk ditampilkan.
          </Text>
        </View>
      ) : (
        orderedWidgets.map(({ data, resolution }) => (
          <MobileDashboardWidgetCard
            locale={locale}
            data={data}
            isDark={isDark}
            key={resolution.id}
            onSendCommand={onSendCommand}
            resolution={resolution}
          />
        ))
      )}
    </View>
  );
}

function orderWidgets(experience: MobileDashboardExperience): Array<{
  data: NonNullable<MobileDashboardExperience['widgetData'][string]>;
  resolution: MobileResolvedWidget;
}> {
  if (!experience.dashboard || !experience.resolution) return [];

  const resolutionById = new Map(
    experience.resolution.widgets.map((widget) => [widget.id, widget]),
  );
  const mobileLayout =
    experience.dashboard.layouts.find(
      (layout) => layout.breakpoint === 'MOBILE',
    ) ??
    experience.dashboard.layouts[0] ??
    null;

  const orderedIds = mobileLayout
    ? [...mobileLayout.items]
        .sort((left, right) =>
          left.y === right.y ? left.x - right.x : left.y - right.y,
        )
        .map((item) => item.widgetId)
    : experience.resolution.widgets.map((widget) => widget.id);

  return [...new Set(orderedIds)].flatMap((widgetId) => {
    const resolution = resolutionById.get(widgetId);
    const data = experience.widgetData[widgetId];
    return resolution && data ? [{ resolution, data }] : [];
  });
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
      <Text
        accessibilityRole="header"
        style={[styles.sectionTitle, isDark && styles.textDark]}
      >
        {title}
      </Text>
      <Text style={[styles.sectionDescription, isDark && styles.textMutedDark]}>
        {description}
      </Text>
    </View>
  );
}

function ActionButton({
  isDark,
  label,
  onPress,
}: {
  isDark: boolean;
  label: string;
  onPress(): Promise<void>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.actionButton,
        isDark && styles.actionButtonDark,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.actionButtonText, isDark && styles.textDark]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function formatCachedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

const styles = StyleSheet.create({
  section: {
    gap: 16,
  },
  outboxList: {
    gap: 10,
    marginBottom: 12,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#f8fafc',
    padding: 14,
  },
  outboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  outboxRowInfo: {
    flex: 1,
    gap: 2,
  },
  outboxRowTitle: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  outboxRowMeta: {
    color: '#475569',
    fontSize: 12,
  },
  outboxRowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  outboxRowButton: {
    borderColor: '#cbd5e1',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  outboxRowButtonDark: {
    borderColor: '#475569',
    backgroundColor: '#1e293b',
  },
  outboxRowButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  heading: {
    gap: 4,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 24,
    fontWeight: '800',
  },
  sectionDescription: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  selectorSection: {
    gap: 8,
  },
  selectorLabel: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  selector: {
    gap: 8,
    paddingRight: 12,
  },
  selectorButton: {
    borderColor: '#cbd5e1',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectorButtonDark: {
    borderColor: '#475569',
    backgroundColor: '#1e293b',
  },
  selectorButtonSelected: {
    borderColor: '#0f766e',
    backgroundColor: '#ccfbf1',
  },
  selectorButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  selectorButtonTextSelected: {
    color: '#0f766e',
  },
  dashboardContent: {
    gap: 14,
  },
  dashboardTitle: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '800',
  },
  dashboardDescription: {
    marginTop: 4,
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  emptyCard: {
    gap: 5,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#f8fafc',
    padding: 18,
  },
  cardDark: {
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  emptyTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  actionButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#94a3b8',
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  actionButtonDark: {
    borderColor: '#64748b',
    backgroundColor: '#1e293b',
  },
  actionButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.75,
  },
  textDark: {
    color: '#f8fafc',
  },
  textMutedDark: {
    color: '#cbd5e1',
  },
});
