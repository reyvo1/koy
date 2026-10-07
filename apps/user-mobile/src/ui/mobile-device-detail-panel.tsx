import { MobileDeviceRoutines } from './mobile-device-routines';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { parseCapabilityValue, readCapabilityConstraints } from '../../../../packages/sdk/src/capability-value';
import type { MobileDeviceDetail, MobileDeviceCapability } from '../device-control/mobile-device-client';

interface Props {
  detail: MobileDeviceDetail | null;
  error: string | null;
  isDark: boolean;
  loading: boolean;
  onBack(): void;
  onRefresh(): Promise<void>;
  onSendCommand(
    deviceId: string,
    capabilityKey: string,
    value: unknown,
  ): Promise<{ commandId: string; status: string }>;
}

export function MobileDeviceDetailPanel({
  detail,
  error,
  isDark,
  loading,
  onBack,
  onRefresh,
  onSendCommand,
}: Props) {
  const [busyCapability, setBusyCapability] = useState<string | null>(null);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);

  if (loading && !detail) {
    return <PanelCard isDark={isDark} title="Memuat Device Detail" description="Capability, telemetry, command history, update evidence, dan findings dibaca dari backend." />;
  }
  if (error && !detail) {
    return (
      <View style={styles.gap}>
        <PanelCard isDark={isDark} title="Device Detail tidak tersedia" description={error} />
        <DetailButton isDark={isDark} label="Kembali" onPress={async () => onBack()} />
      </View>
    );
  }
  if (!detail) return null;

  const deviceId = detail.device.id;
  const booleanWritable = detail.capabilities.filter((capability) => capability.isWritable);

  return (
    <View style={styles.gap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.rowBetween}>
          <View style={styles.flexOne}>
            <Text style={[styles.title, isDark && styles.textDark]}>{detail.device.name}</Text>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>{detail.device.roomPath ?? 'Belum ditempatkan ke ROOM'}</Text>
          </View>
          <Text style={[styles.pill, isDark && styles.pillDark]}>{detail.device.canControl ? 'VIEW + CONTROL' : 'VIEW'}</Text>
        </View>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>Status: {detail.device.status} · Heartbeat: {detail.device.lastHeartbeatAt ?? 'belum tersedia'}</Text>
      </View>

      <MobileDeviceRoutines key={detail.device.id} detail={detail} isDark={isDark} />
      <PanelCard
        isDark={isDark}
        title="Settings / Technical Identity"
        description={`Current firmware: ${detail.technicalHistory.firmware.currentVersion ?? 'unavailable by contract'}\nProtocol/adapter: ${detail.technicalHistory.protocol.name ?? 'unavailable by contract'}\nTidak ada mutation settings end-user yang dibuka tanpa kontrak backend nyata.`}
      />

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Telemetry Terbaru</Text>
        {detail.telemetry.length === 0 ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Belum ada telemetry terbaru.</Text>
        ) : detail.telemetry.map((point) => (
          <View key={point.capabilityKey} style={styles.rowBetween}>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>{point.capabilityKey}</Text>
            <Text style={[styles.value, isDark && styles.textDark]}>{String(point.value)}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Capabilities & Commands</Text>
        {!detail.device.canControl ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Akses VIEW-only. Backend tidak mengizinkan command.</Text>
        ) : booleanWritable.length === 0 ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Tidak ada capability writable.</Text>
        ) : booleanWritable.map((capability) => (
          <View key={capability.id} style={[styles.commandRow, isDark && styles.commandRowDark]}>
            <View style={styles.flexOne}>
              <Text style={[styles.cardTitle, isDark && styles.textDark]}>{capability.semanticType || capability.key}</Text>
              <Text style={[styles.meta, isDark && styles.textMutedDark]}>{capability.key}</Text>
            </View>
            {capability.dataType.toLowerCase() === 'boolean' ? <View style={styles.actionRow}>
              <SmallButton label="ON" disabled={busyCapability !== null} onPress={() => send(capability.key, true)} />
              <SmallButton label="OFF" disabled={busyCapability !== null} onPress={() => send(capability.key, false)} />
            </View> : <MobileTypedValue capability={capability} busy={busyCapability !== null} onSend={(value) => send(capability.key, value)} />}

          </View>
        ))}
        {commandNotice ? <Text style={[styles.meta, isDark && styles.textMutedDark]}>{commandNotice}</Text> : null}
      </View>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>History</Text>
        <Text style={[styles.subheading, isDark && styles.textDark]}>Command</Text>
        {detail.commandHistory.length === 0 ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Belum ada command.</Text>
        ) : detail.commandHistory.slice(0, 10).map((command) => (
          <Text key={command.id} style={[styles.meta, isDark && styles.textMutedDark]}>{command.status} · {formatDate(command.createdAt)} · {JSON.stringify(command.payload)}</Text>
        ))}
        <Text style={[styles.subheading, isDark && styles.textDark]}>OTA evidence</Text>
        {detail.technicalHistory.updateHistory.length === 0 ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Belum ada rollout yang menarget perangkat ini.</Text>
        ) : detail.technicalHistory.updateHistory.map((update) => (
          <Text key={update.rolloutId} style={[styles.meta, isDark && styles.textMutedDark]}>Firmware {update.firmware.version} · {update.evidenceState} · {update.rolloutStatus}</Text>
        ))}
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>Rollout state bukan bukti instalasi firmware fisik pada hardware.</Text>
      </View>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Temuan Analitik</Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>Module 16 findings; bukan delivery notifikasi.</Text>
        {detail.technicalHistory.analyticsFindings.length === 0 ? (
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>Tidak ada finding pada riwayat bounded; bukan jaminan all-clear.</Text>
        ) : detail.technicalHistory.analyticsFindings.slice(0, 10).map((finding) => (
          <Text key={finding.id} style={[styles.meta, isDark && styles.textMutedDark]}>{finding.severity} · {finding.capabilityKey} · {finding.summary}</Text>
        ))}
      </View>

      <View style={styles.actionRow}>
        <DetailButton isDark={isDark} label="Kembali" onPress={async () => onBack()} />
        <DetailButton isDark={isDark} label={loading ? 'Memuat…' : 'Perbarui'} onPress={onRefresh} disabled={loading} />
      </View>
    </View>
  );

  async function send(capabilityKey: string, value: unknown) {
    setBusyCapability(capabilityKey);
    setCommandNotice('Command dikirim; state fisik tetap menunggu ACK/telemetry.');
    try {
      const result = await onSendCommand(deviceId, capabilityKey, value);
      setCommandNotice(`Status command: ${result.status}. State perangkat tidak diasumsikan dari klik.`);
      await onRefresh();
    } catch {
      setCommandNotice('Command gagal dikirim atau tidak diotorisasi backend.');
    } finally {
      setBusyCapability(null);
    }
  }
}

function PanelCard({ isDark, title, description }: { isDark: boolean; title: string; description: string }) {
  return <View style={[styles.card, isDark && styles.cardDark]}><Text style={[styles.sectionTitle, isDark && styles.textDark]}>{title}</Text><Text style={[styles.meta, isDark && styles.textMutedDark]}>{description}</Text></View>;
}

function DetailButton({ isDark, label, onPress, disabled = false }: { isDark: boolean; label: string; onPress(): Promise<void>; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void onPress()} style={[styles.button, isDark && styles.buttonDark, disabled && styles.disabled]}><Text style={[styles.buttonText, isDark && styles.textDark]}>{label}</Text></Pressable>;
}

function SmallButton({ label, onPress, disabled }: { label: string; onPress(): Promise<void>; disabled: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void onPress()} style={[styles.smallButton, disabled && styles.disabled]}><Text style={styles.smallButtonText}>{label}</Text></Pressable>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  card: { gap: 8, borderColor: '#dbe3ef', borderRadius: 16, borderWidth: 1, backgroundColor: '#ffffff', padding: 15 },
  cardDark: { borderColor: '#334155', backgroundColor: '#1e293b' },
  title: { color: '#0f172a', fontSize: 21, fontWeight: '800' },
  sectionTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  subheading: { color: '#0f172a', fontSize: 13, fontWeight: '800', marginTop: 6 },
  cardTitle: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  meta: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  value: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', gap: 10, justifyContent: 'space-between', alignItems: 'center' },
  flexOne: { flex: 1, gap: 2 },
  pill: { borderRadius: 999, backgroundColor: '#e2e8f0', color: '#334155', fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4 },
  pillDark: { backgroundColor: '#334155', color: '#e2e8f0' },
  commandRow: { flexDirection: 'row', gap: 10, alignItems: 'center', borderColor: '#e2e8f0', borderTopWidth: 1, paddingTop: 10 },
  commandRowDark: { borderColor: '#334155' },
  actionRow: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderColor: '#94a3b8', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  buttonDark: { borderColor: '#64748b' },
  buttonText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  smallButton: { borderRadius: 10, backgroundColor: '#0f766e', paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  textDark: { color: '#f8fafc' },
  textMutedDark: { color: '#cbd5e1' },
});

function MobileTypedValue({ capability, busy, onSend }: { capability: MobileDeviceCapability; busy: boolean; onSend(value: unknown): Promise<void> }) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const options = readCapabilityConstraints(capability.constraints).enumValues ?? [];
  return <View style={{ gap: 8, flex: 1 }}>
    {capability.dataType === 'enum' ? <View style={styles.actionRow}>{options.map((value, index) => <Pressable key={index} disabled={busy} accessibilityRole="button" onPress={() => setRaw(String(value))}><Text style={{ color: '#0d9488', padding: 8 }}>{raw === String(value) ? '● ' : ''}{String(value)}</Text></Pressable>)}</View> :
      <TextInput accessibilityLabel={`Nilai ${capability.key}`} editable={!busy} value={raw} onChangeText={setRaw} placeholder={`Nilai ${capability.unit ?? capability.dataType}`} style={{ borderWidth: 1, borderColor: '#64748b', borderRadius: 8, padding: 10, color: '#0d9488' }} />}
    <SmallButton label="Kirim" disabled={busy} onPress={async () => { const parsed = parseCapabilityValue(raw, capability); if (!parsed.ok) { setError(parsed.error); return; } setError(null); await onSend(parsed.value); }} />
    {error ? <Text accessibilityRole="alert" style={{ color: '#ef4444' }}>{error}</Text> : null}
  </View>;
}
