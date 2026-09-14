import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MobileAlertsPayload } from '../device-control/mobile-device-client';

export function MobileAlertsPanel({
  error,
  isDark,
  loading,
  payload,
  onRefresh,
}: {
  error: string | null;
  isDark: boolean;
  loading: boolean;
  payload: MobileAlertsPayload | null;
  onRefresh(): Promise<void>;
}) {
  return (
    <View style={styles.gap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.title, isDark && styles.textDark]}>Alerts Analitik</Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>WARNING/CRITICAL berasal dari Module 16 pada perangkat yang dapat dilihat akun ini. Ini bukan riwayat delivery notifikasi.</Text>
      </View>
      {error ? <View style={[styles.card, isDark && styles.cardDark]}><Text style={[styles.title, isDark && styles.textDark]}>Alerts tidak tersedia</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>{error}</Text></View> : null}
      {!loading && !error && payload && payload.items.length === 0 ? (
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.title, isDark && styles.textDark]}>Tidak ada finding WARNING/CRITICAL</Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Hanya berarti tidak ada finding pada hasil bounded saat ini; bukan jaminan all-clear di luar cakupan riwayat.</Text>
        </View>
      ) : null}
      {payload?.items.map((finding) => (
        <View key={finding.id} style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.severity, isDark && styles.textDark]}>{finding.severity}</Text>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>{formatDate(finding.createdAt)}</Text>
          </View>
          <Text style={[styles.title, isDark && styles.textDark]}>{finding.deviceName ?? finding.deviceId ?? 'Perangkat'}</Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>{finding.capabilityKey} · {finding.kind}</Text>
          <Text style={[styles.body, isDark && styles.textDark]}>{finding.summary}</Text>
        </View>
      ))}
      {payload?.deviceScopeTruncated ? (
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>Cakupan perangkat dibatasi {payload.maxDeviceScope}; hasil tidak boleh diperlakukan sebagai daftar lengkap.</Text>
      ) : null}
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void onRefresh()} style={[styles.button, isDark && styles.buttonDark, loading && styles.disabled]}>
        <Text style={[styles.buttonText, isDark && styles.textDark]}>{loading ? 'Memuat…' : 'Perbarui Alerts'}</Text>
      </Pressable>
    </View>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  card: { gap: 6, borderColor: '#dbe3ef', borderRadius: 16, borderWidth: 1, backgroundColor: '#ffffff', padding: 15 },
  cardDark: { borderColor: '#334155', backgroundColor: '#1e293b' },
  title: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  severity: { color: '#b45309', fontSize: 11, fontWeight: '900' },
  body: { color: '#0f172a', fontSize: 13, lineHeight: 19 },
  meta: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderColor: '#94a3b8', borderRadius: 12, borderWidth: 1, paddingHorizontal: 16 },
  buttonDark: { borderColor: '#64748b' },
  buttonText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  textDark: { color: '#f8fafc' },
  textMutedDark: { color: '#cbd5e1' },
});
