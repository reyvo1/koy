import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileMessages, type MobileLocale } from '../localization/messages';

import type {
  MobileDashboardExperience,
  MobileDashboardState,
  MobileResolvedWidget,
} from '../dashboard';
import { MobileDashboardWidgetCard, type DashboardCopy } from './mobile-dashboard-widget';
import { MobileStateNotice } from './mobile-state-notice';

interface MobileDashboardScreenProps {
  isDark: boolean;
  locale: MobileLocale;
  state: MobileDashboardState;
  onRefresh(selectedDashboardId: string | null): Promise<void>;
  onSelectDashboard(dashboardId: string): Promise<void>;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
}

export function MobileDashboardScreen({
  locale,
  isDark,
  state,
  onRefresh,
  onSelectDashboard,
  onSendCommand,
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

const styles = StyleSheet.create({
  section: {
    gap: 16,
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
