import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mobilePalette } from './mobile-theme';

export interface MobileMapLocation {
  deviceId: string;
  latitude: number;
  longitude: number;
  label?: string;
  recordedAt?: string;
}
export function MobileLocationMap({
  locations,
  isDark,
}: {
  locations: MobileMapLocation[];
  isDark: boolean;
}) {
  const palette = mobilePalette(isDark);
  const [zoom, setZoom] = useState(1),
    [selected, setSelected] = useState<string | null>(null);
  const valid = locations.filter(
    (row) =>
      Number.isFinite(row.latitude) &&
      Number.isFinite(row.longitude) &&
      Math.abs(row.latitude) <= 90 &&
      Math.abs(row.longitude) <= 180,
  );
  const focus = valid.find((row) => row.deviceId === selected);
  const centerLon = focus?.longitude ?? 0,
    centerLat = focus?.latitude ?? 0;
  const zoomOut = Math.max(1, zoom / 2);
  const zoomIn = Math.min(8, zoom * 2);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.caption, { color: palette.text }]}>
        Peta koordinat · {valid.length} lokasi tersimpan
      </Text>
      <View
        style={[
          styles.canvas,
          { backgroundColor: palette.surfaceSubtle, borderColor: palette.border },
        ]}
      >
        {[25, 50, 75].map((percent) => (
          <View
            key={`h-${percent}`}
            style={[
              styles.gridHorizontal,
              { top: `${percent}%`, borderColor: palette.border },
            ]}
          />
        ))}
        {[25, 50, 75].map((percent) => (
          <View
            key={`v-${percent}`}
            style={[
              styles.gridVertical,
              { left: `${percent}%`, borderColor: palette.border },
            ]}
          />
        ))}
        {valid.map((row) => {
          const left = ((row.longitude - centerLon) / (360 / zoom) + 0.5) * 100,
            top = (0.5 - (row.latitude - centerLat) / (180 / zoom)) * 100;
          if (left < 2 || left > 98 || top < 2 || top > 98) return null;
          const isSelected = row.deviceId === selected;
          return (
            <Pressable
              key={row.deviceId}
              accessibilityRole="button"
              accessibilityLabel={`${row.label ?? row.deviceId}, ${row.latitude}, ${row.longitude}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelected(row.deviceId)}
              style={[
                styles.pinTouch,
                { left: `${left}%`, top: `${top}%` },
              ]}
            >
              <View
                style={[
                  styles.pin,
                  {
                    backgroundColor: isSelected
                      ? palette.accent
                      : palette.accentSoft,
                    borderColor: isSelected
                      ? palette.accentContrast
                      : palette.accent,
                    height: isSelected ? 16 : 11,
                    width: isSelected ? 16 : 11,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Perkecil peta"
          accessibilityState={{ disabled: zoom <= 1 }}
          disabled={zoom <= 1}
          onPress={() => setZoom(zoomOut)}
          style={({ pressed }) => [
            styles.controlButton,
            { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            zoom <= 1 && styles.controlDisabled,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={[styles.controlText, { color: palette.text }]}>−</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Perbesar peta"
          accessibilityState={{ disabled: zoom >= 8 }}
          disabled={zoom >= 8}
          onPress={() => setZoom(zoomIn)}
          style={({ pressed }) => [
            styles.controlButton,
            { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            zoom >= 8 && styles.controlDisabled,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={[styles.controlText, { color: palette.text }]}>+</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelected(null);
            setZoom(1);
          }}
          style={({ pressed }) => [
            styles.controlButton,
            styles.controlButtonWide,
            { backgroundColor: palette.surface, borderColor: palette.borderStrong },
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={[styles.controlLabel, { color: palette.text }]}>Reset</Text>
        </Pressable>
      </View>
      {valid.map((row) => {
        const isSelected = row.deviceId === selected;
        return (
          <Pressable
            key={row.deviceId}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => setSelected(row.deviceId)}
            style={[
              styles.locationRow,
              isSelected
                ? { backgroundColor: palette.accentSoft, borderColor: palette.accent }
                : { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.locationLabel, { color: palette.textStrong }]}>
              {row.label ?? row.deviceId}
            </Text>
            <Text style={[styles.locationMeta, { color: palette.muted }]}>
              {row.latitude}, {row.longitude} · {row.recordedAt ?? 'Waktu tidak tersedia'}
            </Text>
          </Pressable>
        );
      })}
      {!valid.length && (
        <Text style={[styles.caption, { color: palette.muted }]}>
          Belum ada laporan lokasi.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    borderWidth: 1,
    borderRadius: 14,
    height: 180,
    overflow: 'hidden',
  },
  caption: {
    fontSize: 13,
  },
  controlButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 10,
  },
  controlButtonWide: {
    paddingHorizontal: 16,
  },
  controlDisabled: {
    opacity: 0.4,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  controlPressed: {
    opacity: 0.7,
  },
  controlText: {
    fontSize: 18,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
  },
  gridHorizontal: {
    position: 'absolute',
    borderTopWidth: 1,
    opacity: 0.6,
    width: '100%',
  },
  gridVertical: {
    position: 'absolute',
    borderLeftWidth: 1,
    height: '100%',
    opacity: 0.6,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  locationMeta: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  locationRow: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pin: {
    borderRadius: 999,
    borderWidth: 2,
  },
  pinTouch: {
    marginLeft: -14,
    marginTop: -14,
    padding: 6,
    position: 'absolute',
  },
  wrap: {
    gap: 8,
  },
});
