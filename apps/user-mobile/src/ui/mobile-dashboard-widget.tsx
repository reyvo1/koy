import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MobileLocationMap, type MobileMapLocation } from './mobile-location-map';
import { useState } from 'react';

import { MobileSeriesChart, type MobileSeriesPoint } from './mobile-series-chart';
import { chartTones, mobilePalette, stateTone } from './mobile-theme';
import { mobileMessages, type MobileLocale } from '../localization/messages';

import type {
  MobileResolvedWidget,
  MobileWidgetBindingData,
  MobileWidgetData,
} from '../dashboard';

/**
 * Copy for one widget, chosen by its caller rather than fixed at module load.
 *
 * A module-level constant is evaluated once, at import, which is exactly why it could never follow
 * an operator's language choice: the value was frozen before anyone tapped anything.
 */
export type DashboardCopy = (typeof mobileMessages)[MobileLocale]['dashboard'];

function dashboardCopyFor(locale: MobileLocale): DashboardCopy {
  return mobileMessages[locale].dashboard;
}

interface MobileDashboardWidgetCardProps {
  data: MobileWidgetData;
  isDark: boolean;
  locale: MobileLocale;
  resolution: MobileResolvedWidget;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
}

export function MobileDashboardWidgetCard({
  locale,
  data,
  isDark,
  resolution,
  onSendCommand,
}: MobileDashboardWidgetCardProps) {
  const dashboardCopy = dashboardCopyFor(locale);
  const palette = mobilePalette(isDark);
  const tone = stateTone(palette, data.state);
  return (
    <View
      accessibilityLabel={`${resolution.title}. ${stateLabel(dashboardCopy, data.state)}`}
      accessibilityRole="summary"
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: palette.muted }]}>
            {kindLabel(dashboardCopy, resolution.kind)}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: palette.textStrong }]}
          >
            {resolution.title}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
          <Text style={[styles.badgeText, { color: tone.color }]}>
            {stateLabel(dashboardCopy, data.state)}
          </Text>
        </View>
      </View>

      {renderWidget(dashboardCopy, resolution, data, isDark, onSendCommand)}

      <Text style={[styles.timestamp, { color: palette.muted }]}>
        {dashboardCopy.updatedPrefix} {formatDate(dashboardCopy, resolveTimestamp(data))}
      </Text>
    </View>
  );
}

function renderWidget(
  dashboardCopy: DashboardCopy,
  resolution: MobileResolvedWidget,
  data: MobileWidgetData,
  isDark: boolean,
  onSendCommand: (
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ) => Promise<{ commandId: string; status: string }>,
) {
  if (resolution.kind === 'SWITCH') {
    return (
      <SwitchControl
        dashboardCopy={dashboardCopy}
        isDark={isDark}
        onSendCommand={onSendCommand}
        resolution={resolution}
      />
    );
  }

  if (data.state === 'ERROR' || data.state === 'INVALID') {
    return <WidgetMessage isDark={isDark} text={dashboardCopy.invalidData} />;
  }

  if (data.state === 'UNSUPPORTED') {
    return (
      <WidgetMessage isDark={isDark} text={resolution.kind === 'MAP' ? dashboardCopy.mapUnsupported : dashboardCopy.unsupportedData} />
    );
  }

  if (data.state === 'EMPTY') {
    return <WidgetMessage isDark={isDark} text={dashboardCopy.emptyData} />;
  }

  if (resolution.kind === 'MAP') return <MobileLocationMap isDark={isDark} locations={data.bindings.filter((row) => row.data && (row.state === 'READY' || row.state === 'STALE')).map((row) => row.data as unknown as MobileMapLocation)} />;

  if (resolution.kind === 'GAUGE') {
    return (
      <GaugeValue
        dashboardCopy={dashboardCopy}
        binding={data.bindings[0]}
        isDark={isDark}
        resolution={resolution}
      />
    );
  }

  if (resolution.kind === 'CHART') {
    return <SeriesValues bindings={data.bindings} dashboardCopy={dashboardCopy} isDark={isDark} />;
  }

  return <BindingValues bindings={data.bindings} dashboardCopy={dashboardCopy} isDark={isDark} />;
}

function SwitchControl({
  dashboardCopy,
  isDark,
  onSendCommand,
  resolution,
}: {
  dashboardCopy: DashboardCopy;
  isDark: boolean;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
  resolution: MobileResolvedWidget;
}) {
  const palette = mobilePalette(isDark);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const binding = resolution.bindings[0];
  const capability = binding?.capability;
  const controllable =
    resolution.state === 'READY' &&
    Boolean(binding?.device?.id) &&
    capability?.dataType === 'boolean' &&
    capability.access.writable;

  if (!controllable || !binding?.device || !capability) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.switchDisabled} />
    );
  }

  async function send(value: boolean) {
    setPending(true);
    setFeedback(null);
    try {
      const result = await onSendCommand(
        binding.device!.id,
        capability!.key,
        value,
      );
      setFeedback(commandFeedback(dashboardCopy, result.status));
    } catch {
      setFeedback(dashboardCopy.switchFailed);
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.switchControl}>
      <View style={styles.switchActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={() => void send(true)}
          style={({ pressed }) => [
            styles.switchButton,
            { backgroundColor: palette.accent, borderColor: palette.accent },
            pressed && !pending && styles.switchButtonPressed,
            pending && styles.switchButtonDisabled,
          ]}
        >
          <Text style={[styles.switchButtonText, { color: palette.accentContrast }]}>
            {dashboardCopy.switchOnAction}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: pending, disabled: pending }}
          disabled={pending}
          onPress={() => void send(false)}
          style={({ pressed }) => [
            styles.switchButton,
            { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            pressed && !pending && styles.switchButtonPressed,
            pending && styles.switchButtonDisabled,
          ]}
        >
          <Text style={[styles.switchButtonText, { color: palette.text }]}>
            {dashboardCopy.switchOffAction}
          </Text>
        </Pressable>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.message, { color: palette.muted }]}
      >
        {pending
          ? dashboardCopy.switchPending
          : feedback ?? dashboardCopy.switchReady}
      </Text>
    </View>
  );
}


function commandFeedback(dashboardCopy: DashboardCopy, status: string): string {
  switch (status) {
    case 'ACKNOWLEDGED':
      return dashboardCopy.switchAcknowledged;
    case 'FAILED':
      return dashboardCopy.switchRejected;
    case 'TIMED_OUT':
      return dashboardCopy.switchTimedOut;
    case 'SENT':
    case 'PENDING':
      return dashboardCopy.switchAwaitingAck;
    default:
      return dashboardCopy.switchSent;
  }
}

function BindingValues({
  dashboardCopy,
  bindings,
  isDark,
}: {
  dashboardCopy: DashboardCopy;
  bindings: MobileWidgetBindingData[];
  isDark: boolean;
}) {
  const palette = mobilePalette(isDark);

  if (bindings.length === 0) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.unavailableData} />
    );
  }

  return (
    <View style={styles.values}>
      {bindings.slice(0, 8).map((binding) => (
        <View key={binding.id} style={styles.valueRow}>
          <Text style={[styles.valueLabel, { color: palette.muted }]}>
            {binding.alias}
          </Text>
          <Text style={[styles.value, { color: palette.textStrong }]}>
            {formatBindingValue(dashboardCopy, binding)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function GaugeValue({
  dashboardCopy,
  binding,
  isDark,
  resolution,
}: {
  dashboardCopy: DashboardCopy;
  binding: MobileWidgetBindingData | undefined;
  isDark: boolean;
  resolution: MobileResolvedWidget;
}) {
  const palette = mobilePalette(isDark);
  const value = numericValue(binding?.data?.value);
  const capability = resolution.bindings[0]?.capability;
  const min =
    numberFrom(resolution.presentation.min) ?? capability?.constraints.min ?? 0;
  const max =
    numberFrom(resolution.presentation.max) ??
    capability?.constraints.max ??
    100;
  const progress =
    value === null || max <= min
      ? 0
      : Math.min(Math.max((value - min) / (max - min), 0), 1);

  if (value === null) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.numericUnavailable} />
    );
  }

  const filled = Math.round(progress * GAUGE_SEGMENTS);

  return (
    <View style={styles.gauge}>
      <View style={styles.gaugeValueRow}>
        <Text style={[styles.gaugeValue, { color: palette.textStrong }]}>
          {formatNumber(value, capability?.constraints.precision)}
        </Text>
        {capability?.unit ? (
          <Text style={[styles.gaugeUnit, { color: palette.muted }]}>
            {capability.unit}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityLabel={`Rentang ${min} sampai ${max}, nilai ${value}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min, max, now: value }}
        style={styles.gaugeTrack}
      >
        {Array.from({ length: GAUGE_SEGMENTS }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.gaugeSegment,
              {
                backgroundColor:
                  index < filled ? palette.accent : palette.track,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.gaugeRangeRow}>
        <Text style={[styles.range, { color: palette.subtle }]}>
          {formatNumber(min)}
        </Text>
        <Text style={[styles.range, { color: palette.subtle }]}>
          {formatNumber(max)}
        </Text>
      </View>
    </View>
  );
}

const GAUGE_SEGMENTS = 24;

function SeriesValues({
  dashboardCopy,
  bindings,
  isDark,
}: {
  dashboardCopy: DashboardCopy;
  bindings: MobileWidgetBindingData[];
  isDark: boolean;
}) {
  const palette = mobilePalette(isDark);
  const tones = chartTones(palette);
  const sections = bindings
    .map((binding) => ({
      alias: binding.alias,
      points: numericSeries(binding),
    }))
    .filter((section) => section.points.length > 0)
    .slice(0, 4);

  if (sections.length === 0) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.seriesUnavailable} />
    );
  }

  return (
    <View
      accessibilityLabel={dashboardCopy.seriesAccessibilityLabel}
      style={styles.series}
    >
      {sections.map((section, index) => {
        const latest = section.points[section.points.length - 1]!;
        return (
          <View key={`${section.alias}-${index}`} style={styles.seriesSection}>
            <View style={styles.seriesHeader}>
              <Text style={[styles.seriesAlias, { color: palette.muted }]}>
                {section.alias}
              </Text>
              <Text style={[styles.seriesValue, { color: palette.textStrong }]}>
                {formatNumber(latest.value)}
              </Text>
            </View>
            <MobileSeriesChart
              accessibilityLabel={`${section.alias}. ${dashboardCopy.seriesAccessibilityLabel}`}
              formatTime={(at) => formatDate(dashboardCopy, at)}
              formatValue={(value) => formatNumber(value)}
              isDark={isDark}
              points={section.points}
              tone={tones[index % tones.length]}
            />
          </View>
        );
      })}
    </View>
  );
}

function WidgetMessage({ isDark, text }: { isDark: boolean; text: string }) {
  return (
    <Text style={[styles.message, { color: mobilePalette(isDark).muted }]}>
      {text}
    </Text>
  );
}

function resolveTimestamp(data: MobileWidgetData): string {
  return (
    data.bindings.find((binding) => binding.observedAt)?.observedAt ??
    data.generatedAt
  );
}

function formatBindingValue(
  dashboardCopy: DashboardCopy,
  binding: MobileWidgetBindingData,
): string {
  if (!binding.data) return stateLabel(dashboardCopy, binding.state);
  if ('value' in binding.data) return formatUnknown(dashboardCopy, binding.data.value);
  if ('status' in binding.data) return formatUnknown(dashboardCopy, binding.data.status);
  const series = extractSeries(binding);
  return series.length > 0
    ? formatUnknown(dashboardCopy, series[series.length - 1]?.value)
    : stateLabel(dashboardCopy, binding.state);
}

function extractSeries(binding: MobileWidgetBindingData) {
  const candidates = binding.data?.points ?? binding.data?.buckets;
  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const row = candidate as Record<string, unknown>;
    const observedAt = row.observedAt ?? row.end ?? row.start;
    const value = row.value ?? row.avg ?? row.average ?? row.max ?? row.min;
    return typeof observedAt === 'string' && value !== undefined
      ? [{ observedAt, value }]
      : [];
  });
}

function numericSeries(binding: MobileWidgetBindingData): MobileSeriesPoint[] {
  return extractSeries(binding).flatMap((point) =>
    typeof point.value === 'number' && Number.isFinite(point.value)
      ? [{ at: point.observedAt, value: point.value }]
      : [],
  );
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number, precision = 2): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: precision,
  }).format(value);
}

function formatUnknown(dashboardCopy: DashboardCopy, value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean')
    return value ? dashboardCopy.activeValue : dashboardCopy.inactiveValue;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined)
    return dashboardCopy.valueUnavailable;
  return dashboardCopy.valueAvailable;
}

function formatDate(dashboardCopy: DashboardCopy, value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? dashboardCopy.unknownTime
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function stateLabel(dashboardCopy: DashboardCopy, state: string): string {
  return (dashboardCopy.stateLabels as Record<string, string>)[state] ?? state;
}

function kindLabel(dashboardCopy: DashboardCopy, kind: string): string {
  return (dashboardCopy.kindLabels as Record<string, string>)[kind] ?? kind;
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  values: {
    gap: 10,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  valueLabel: {
    flex: 1,
    fontSize: 14,
  },
  value: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  gauge: {
    gap: 10,
  },
  gaugeValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  gaugeValue: {
    fontSize: 34,
    fontWeight: '800',
  },
  gaugeUnit: {
    fontSize: 16,
    fontWeight: '600',
  },
  gaugeTrack: {
    flexDirection: 'row',
    gap: 3,
    height: 12,
  },
  gaugeSegment: {
    flex: 1,
    borderRadius: 4,
  },
  gaugeRangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  range: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  series: {
    gap: 16,
  },
  seriesSection: {
    gap: 8,
  },
  seriesHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  seriesAlias: {
    flex: 1,
    fontSize: 13,
  },
  seriesValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
  },

  switchControl: {
    gap: 10,
  },
  switchActions: {
    flexDirection: 'row',
    gap: 10,
  },
  switchButton: {
    minHeight: 42,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchButtonPressed: {
    opacity: 0.8,
  },
  switchButtonDisabled: {
    opacity: 0.55,
  },
  switchButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  timestamp: {
    fontSize: 12,
  },
});
