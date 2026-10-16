import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mobilePalette } from './mobile-theme';

export interface MobileSeriesPoint {
  at: string;
  value: number;
}

/**
 * Compact press-to-inspect column chart, built from plain Views so the app
 * keeps its no-native-dependency contract. One chart renders one series and
 * one unit; callers stack charts per binding instead of mixing units.
 */
export function MobileSeriesChart({
  accessibilityLabel,
  formatTime,
  formatValue,
  isDark,
  maxBars = 28,
  points,
  tone,
}: {
  accessibilityLabel?: string;
  formatTime(at: string): string;
  formatValue(value: number): string;
  isDark: boolean;
  maxBars?: number;
  points: MobileSeriesPoint[];
  tone?: string;
}) {
  const palette = mobilePalette(isDark);
  const [selected, setSelected] = useState<number | null>(null);
  const bars = downsample(points, maxBars);
  const activeIndex = selected ?? bars.length - 1;
  const active = bars[activeIndex];
  const min = Math.min(...bars.map((bar) => bar.value));
  const max = Math.max(...bars.map((bar) => bar.value));
  const span = max - min;
  const color = tone ?? palette.accent;

  if (bars.length === 0 || !active) return null;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={styles.wrap}
    >
      <View style={styles.readout}>
        <Text style={[styles.readoutValue, { color: palette.textStrong }]}>
          {formatValue(active.value)}
        </Text>
        <Text style={[styles.readoutTime, { color: palette.muted }]}>
          {formatTime(active.at)}
        </Text>
      </View>
      <View style={[styles.plot, { borderBottomColor: palette.border }]}>
        {bars.map((bar, index) => {
          const ratio = span <= 0 ? 0.5 : (bar.value - min) / span;
          const highlighted = index === activeIndex;
          return (
            <Pressable
              accessibilityLabel={`${formatTime(bar.at)}, ${formatValue(bar.value)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: highlighted }}
              key={`${bar.at}-${index}`}
              onPress={() => setSelected(index)}
              style={styles.barColumn}
            >
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: color,
                    height: Math.max(4, Math.round(6 + ratio * (PLOT_HEIGHT - 10))),
                    opacity: highlighted ? 1 : 0.45,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={[styles.axisLabel, { color: palette.subtle }]}>
          {formatTime(bars[0]!.at)}
        </Text>
        <Text style={[styles.axisLabel, { color: palette.subtle }]}>
          {formatTime(bars[bars.length - 1]!.at)}
        </Text>
      </View>
    </View>
  );
}

const PLOT_HEIGHT = 96;

function downsample(
  points: MobileSeriesPoint[],
  maxBars: number,
): MobileSeriesPoint[] {
  if (points.length <= maxBars) return points;
  const bucketSize = Math.ceil(points.length / maxBars);
  const buckets: MobileSeriesPoint[] = [];
  for (let start = 0; start < points.length; start += bucketSize) {
    const bucket = points.slice(start, start + bucketSize);
    const sum = bucket.reduce((total, point) => total + point.value, 0);
    const last = bucket[bucket.length - 1]!;
    buckets.push({
      at: last.at,
      value: sum / bucket.length,
    });
  }
  return buckets;
}

const styles = StyleSheet.create({
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  axisLabel: {
    fontSize: 11,
  },
  bar: {
    borderRadius: 3,
    width: '100%',
  },
  barColumn: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  plot: {
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: PLOT_HEIGHT,
  },
  readout: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    minHeight: 24,
  },
  readoutTime: {
    fontSize: 12,
  },
  readoutValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  wrap: {
    gap: 8,
  },
});
