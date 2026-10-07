import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
  const color = isDark ? '#e6e9f0' : '#1e293b';
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color }}>
        Peta koordinat · {valid.length} lokasi tersimpan
      </Text>
      <View
        style={{
          height: 180,
          backgroundColor: isDark ? '#0b0e14' : '#eff6ff',
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#475569',
        }}
      >
        {[25, 50, 75].map((percent) => (
          <View
            key={percent}
            style={{
              position: 'absolute',
              top: `${percent}%`,
              width: '100%',
              borderTopWidth: 1,
              borderColor: '#334155',
            }}
          />
        ))}
        {[25, 50, 75].map((percent) => (
          <View
            key={percent}
            style={{
              position: 'absolute',
              left: `${percent}%`,
              height: '100%',
              borderLeftWidth: 1,
              borderColor: '#334155',
            }}
          />
        ))}
        {valid.map((row) => {
          const left = ((row.longitude - centerLon) / (360 / zoom) + 0.5) * 100,
            top = (0.5 - (row.latitude - centerLat) / (180 / zoom)) * 100;
          if (left < 2 || left > 98 || top < 2 || top > 98) return null;
          return (
            <Pressable
              key={row.deviceId}
              accessibilityRole="button"
              accessibilityLabel={`${row.label ?? row.deviceId}, ${row.latitude}, ${row.longitude}`}
              onPress={() => setSelected(row.deviceId)}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: `${top}%`,
                marginLeft: -10,
                marginTop: -10,
                padding: 5,
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: '#2dd4bf',
                  borderWidth: 2,
                  borderColor: '#fff',
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        {[
          ['−', Math.max(1, zoom / 2)],
          ['+', Math.min(8, zoom * 2)],
        ].map(([label, next]) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={
              label === '+' ? 'Perbesar peta' : 'Perkecil peta'
            }
            onPress={() => setZoom(Number(next))}
            style={{ padding: 12 }}
          >
            <Text style={{ color }}>{label}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setSelected(null);
            setZoom(1);
          }}
          style={{ padding: 12 }}
        >
          <Text style={{ color }}>Reset</Text>
        </Pressable>
      </View>
      {valid.map((row) => (
        <Pressable
          key={row.deviceId}
          accessibilityRole="button"
          onPress={() => setSelected(row.deviceId)}
          style={{ padding: 8 }}
        >
          <Text style={{ color }}>
            {row.label ?? row.deviceId} · {row.latitude}, {row.longitude}
          </Text>
          <Text style={{ color, fontSize: 11 }}>
            {row.recordedAt ?? 'Waktu tidak tersedia'}
          </Text>
        </Pressable>
      ))}
      {!valid.length && (
        <Text style={{ color }}>Belum ada laporan lokasi.</Text>
      )}
    </View>
  );
}
