import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { defaultMobileLocale, mobileMessages } from '../localization/messages';

import type {
  MobileResolvedWidget,
  MobileWidgetBindingData,
  MobileWidgetData,
} from '../dashboard';

const dashboardCopy = mobileMessages[defaultMobileLocale].dashboard;

interface MobileDashboardWidgetCardProps {
  data: MobileWidgetData;
  isDark: boolean;
  resolution: MobileResolvedWidget;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
}

export function MobileDashboardWidgetCard({
  data,
  isDark,
  resolution,
  onSendCommand,
}: MobileDashboardWidgetCardProps) {
  return (
    <View
      accessibilityLabel={`${resolution.title}. ${stateLabel(data.state)}`}
      accessibilityRole="summary"
      style={[styles.card, isDark && styles.cardDark]}
    >
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, isDark && styles.textMutedDark]}>
            {kindLabel(resolution.kind)}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, isDark && styles.textDark]}
          >
            {resolution.title}
          </Text>
        </View>
        <View style={[styles.badge, isDark && styles.badgeDark]}>
          <Text style={[styles.badgeText, isDark && styles.textDark]}>
            {stateLabel(data.state)}
          </Text>
        </View>
      </View>

      {renderWidget(resolution, data, isDark, onSendCommand)}

      <Text style={[styles.timestamp, isDark && styles.textMutedDark]}>
        {dashboardCopy.updatedPrefix} {formatDate(resolveTimestamp(data))}
      </Text>
    </View>
  );
}

function renderWidget(
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
        isDark={isDark}
        onSendCommand={onSendCommand}
        resolution={resolution}
      />
    );
  }

  if (resolution.kind === 'MAP') {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.mapUnsupported} />
    );
  }

  if (data.state === 'ERROR' || data.state === 'INVALID') {
    return <WidgetMessage isDark={isDark} text={dashboardCopy.invalidData} />;
  }

  if (data.state === 'UNSUPPORTED') {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.unsupportedData} />
    );
  }

  if (data.state === 'EMPTY') {
    return <WidgetMessage isDark={isDark} text={dashboardCopy.emptyData} />;
  }

  if (resolution.kind === 'GAUGE') {
    return (
      <GaugeValue
        binding={data.bindings[0]}
        isDark={isDark}
        resolution={resolution}
      />
    );
  }

  if (resolution.kind === 'CHART') {
    return <SeriesValues bindings={data.bindings} isDark={isDark} />;
  }

  return <BindingValues bindings={data.bindings} isDark={isDark} />;
}

function SwitchControl({
  isDark,
  onSendCommand,
  resolution,
}: {
  isDark: boolean;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: boolean,
  ): Promise<{ commandId: string; status: string }>;
  resolution: MobileResolvedWidget;
}) {
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
      setFeedback(commandFeedback(result.status));
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
            styles.switchButtonPrimary,
            pressed && !pending && styles.switchButtonPressed,
            pending && styles.switchButtonDisabled,
          ]}
        >
          <Text style={styles.switchButtonPrimaryText}>
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
            isDark && styles.switchButtonDark,
            pressed && !pending && styles.switchButtonPressed,
            pending && styles.switchButtonDisabled,
          ]}
        >
          <Text style={[styles.switchButtonText, isDark && styles.textDark]}>
            {dashboardCopy.switchOffAction}
          </Text>
        </Pressable>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.message, isDark && styles.textMutedDark]}
      >
        {pending
          ? dashboardCopy.switchPending
          : feedback ?? dashboardCopy.switchReady}
      </Text>
    </View>
  );
}


function commandFeedback(status: string): string {
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
  bindings,
  isDark,
}: {
  bindings: MobileWidgetBindingData[];
  isDark: boolean;
}) {
  if (bindings.length === 0) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.unavailableData} />
    );
  }

  return (
    <View style={styles.values}>
      {bindings.slice(0, 8).map((binding) => (
        <View key={binding.id} style={styles.valueRow}>
          <Text style={[styles.valueLabel, isDark && styles.textMutedDark]}>
            {binding.alias}
          </Text>
          <Text style={[styles.value, isDark && styles.textDark]}>
            {formatBindingValue(binding)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function GaugeValue({
  binding,
  isDark,
  resolution,
}: {
  binding: MobileWidgetBindingData | undefined;
  isDark: boolean;
  resolution: MobileResolvedWidget;
}) {
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

  return (
    <View style={styles.gauge}>
      <View style={styles.gaugeValueRow}>
        <Text style={[styles.gaugeValue, isDark && styles.textDark]}>
          {formatNumber(value, capability?.constraints.precision)}
        </Text>
        {capability?.unit ? (
          <Text style={[styles.gaugeUnit, isDark && styles.textMutedDark]}>
            {capability.unit}
          </Text>
        ) : null}
      </View>
      <View
        accessibilityLabel={`Rentang ${min} sampai ${max}, nilai ${value}`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min, max, now: value }}
        style={[styles.track, isDark && styles.trackDark]}
      >
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={[styles.range, isDark && styles.textMutedDark]}>
        {formatNumber(min)} – {formatNumber(max)}
      </Text>
    </View>
  );
}

function SeriesValues({
  bindings,
  isDark,
}: {
  bindings: MobileWidgetBindingData[];
  isDark: boolean;
}) {
  const points = bindings.flatMap((binding) =>
    extractSeries(binding).map((point) => ({
      ...point,
      alias: binding.alias,
    })),
  );

  if (points.length === 0) {
    return (
      <WidgetMessage isDark={isDark} text={dashboardCopy.seriesUnavailable} />
    );
  }

  return (
    <View
      accessibilityLabel={dashboardCopy.seriesAccessibilityLabel}
      style={styles.series}
    >
      {points.slice(-6).map((point, index) => (
        <View
          key={`${point.alias}-${point.observedAt}-${index}`}
          style={styles.seriesRow}
        >
          <Text style={[styles.seriesAlias, isDark && styles.textMutedDark]}>
            {point.alias}
          </Text>
          <Text style={[styles.seriesValue, isDark && styles.textDark]}>
            {formatUnknown(point.value)}
          </Text>
          <Text style={[styles.seriesTime, isDark && styles.textMutedDark]}>
            {formatDate(point.observedAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WidgetMessage({ isDark, text }: { isDark: boolean; text: string }) {
  return (
    <Text style={[styles.message, isDark && styles.textMutedDark]}>{text}</Text>
  );
}

function resolveTimestamp(data: MobileWidgetData): string {
  return (
    data.bindings.find((binding) => binding.observedAt)?.observedAt ??
    data.generatedAt
  );
}

function formatBindingValue(binding: MobileWidgetBindingData): string {
  if (!binding.data) return stateLabel(binding.state);
  if ('value' in binding.data) return formatUnknown(binding.data.value);
  if ('status' in binding.data) return formatUnknown(binding.data.status);
  const series = extractSeries(binding);
  return series.length > 0
    ? formatUnknown(series[series.length - 1]?.value)
    : stateLabel(binding.state);
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

function formatUnknown(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean')
    return value ? dashboardCopy.activeValue : dashboardCopy.inactiveValue;
  if (typeof value === 'string') return value;
  if (value === null || value === undefined)
    return dashboardCopy.valueUnavailable;
  return dashboardCopy.valueAvailable;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? dashboardCopy.unknownTime
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function stateLabel(state: string): string {
  return (dashboardCopy.stateLabels as Record<string, string>)[state] ?? state;
}

function kindLabel(kind: string): string {
  return (dashboardCopy.kindLabels as Record<string, string>)[kind] ?? kind;
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    borderColor: '#dbe3ef',
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    padding: 18,
  },
  cardDark: {
    borderColor: '#334155',
    backgroundColor: '#1e293b',
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
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  badge: {
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeDark: {
    backgroundColor: '#334155',
  },
  badgeText: {
    color: '#334155',
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
    color: '#64748b',
    fontSize: 14,
  },
  value: {
    color: '#0f172a',
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
    color: '#0f172a',
    fontSize: 34,
    fontWeight: '800',
  },
  gaugeUnit: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  track: {
    height: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  trackDark: {
    backgroundColor: '#334155',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  range: {
    color: '#64748b',
    fontSize: 12,
  },
  series: {
    gap: 8,
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  seriesAlias: {
    flex: 1,
    color: '#64748b',
    fontSize: 13,
  },
  seriesValue: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '700',
  },
  seriesTime: {
    color: '#64748b',
    fontSize: 11,
  },
  message: {
    color: '#475569',
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
    borderColor: '#94a3b8',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchButtonPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  switchButtonDark: {
    borderColor: '#64748b',
    backgroundColor: '#0f172a',
  },
  switchButtonPressed: {
    opacity: 0.8,
  },
  switchButtonDisabled: {
    opacity: 0.55,
  },
  switchButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  switchButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  timestamp: {
    color: '#64748b',
    fontSize: 12,
  },
  textDark: {
    color: '#f8fafc',
  },
  textMutedDark: {
    color: '#cbd5e1',
  },
});
