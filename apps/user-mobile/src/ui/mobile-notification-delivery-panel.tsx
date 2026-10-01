import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  MobileNotificationDelivery,
  MobileNotificationHistory,
  MobileNotificationSummary,
} from '../device-control/mobile-notification-client';

/**
 * The delivery half of the alerts screen.
 *
 * Two surfaces live side by side here and they answer different questions. The analytics findings
 * above say "what did the detector notice"; this says "did the message actually leave". Before this
 * panel the mobile app had only the first, and its own type said so —
 * `MobileAlertsPayload.notificationDeliveryHistory: false` — so a tenant's phone could not answer
 * the delivery question at all.
 *
 * Four things are rendered deliberately rather than for looks:
 *
 *  - **A read that failed says so.** An outage renders an error line, never an empty list. An empty
 *    list is a claim about the world and the phone is frequently not talking to anything.
 *  - **No destination.** The list route omits it because it is PII, so the panel says the address
 *    is not listed here instead of leaving an empty box where an address should be.
 *  - **`wasSent`, not the status label.** The client derives it from the timestamp, and the panel
 *    reads that. A `DELIVERING` row carrying a stale `sentAt` is a row whose transport never
 *    confirmed delivery, and a status label would call it sent.
 *  - **Both counts.** `total` is the server's count of matching rows; `droppedRows` is what this
 *    client could not render. Showing one number hides whichever is the wrong one.
 */
export function MobileNotificationDeliveryPanel({
  error,
  history,
  isDark,
  loading,
  onRefresh,
  summary,
}: {
  error: string | null;
  history: MobileNotificationHistory | null;
  isDark: boolean;
  loading: boolean;
  onRefresh(): Promise<void>;
  summary: MobileNotificationSummary | null;
}) {
  return (
    <View style={styles.gap}>
      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          Riwayat Pengiriman Notifikasi
        </Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>
          Berasal dari delivery log backend, bukan dari analytics findings. Menjawab "apakah
          notifikasi benar-benar terkirim", bukan "apa yang ditemukan detektor".
        </Text>
      </View>

      {summary ? (
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.title, isDark && styles.textDark]}>Ringkasan status</Text>
          <View style={styles.rowBetween}>
            <Text style={[styles.meta, isDark && styles.textMutedDark]}>Total tercatat</Text>
            <Text style={[styles.count, isDark && styles.textDark]}>{summary.total}</Text>
          </View>
          {(Object.keys(summary.byStatus) as Array<keyof MobileNotificationSummary['byStatus']>).map(
            (status) => (
              <View key={status} style={styles.rowBetween}>
                <Text style={[styles.meta, isDark && styles.textMutedDark]}>{status}</Text>
                <Text style={[styles.count, isDark && styles.textDark]}>
                  {summary.byStatus[status]}
                </Text>
              </View>
            ),
          )}
        </View>
      ) : null}

      {error ? (
        <View style={[styles.card, isDark && styles.errorCardDark]}>
          <Text style={[styles.errorTitle, isDark && styles.errorText]}>
            Riwayat pengiriman tidak dapat dibaca
          </Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>{error}</Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>
            Ini bukan berarti tidak ada notifikasi — log-nya belum terbaca.
          </Text>
        </View>
      ) : null}

      {!loading && !error && history && history.items.length === 0 ? (
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            Tidak ada catatan pengiriman
          </Text>
          <Text style={[styles.meta, isDark && styles.textMutedDark]}>
            {history.appliedStatus
              ? `Log terbaca dan tidak berisi baris berstatus ${history.appliedStatus}.`
              : 'Log terbaca dan kosong untuk tenant ini.'}
          </Text>
        </View>
      ) : null}

      {history && history.droppedRows > 0 ? (
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>
          {history.droppedRows} baris tidak dapat ditampilkan karena bentuknya tidak dikenal;
          hitungan server tetap {history.total}.
        </Text>
      ) : null}

      {history?.items.map((row) => (
        <DeliveryRow key={row.id} isDark={isDark} row={row} />
      ))}

      {history ? (
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>
          {history.appliedStatus
            ? `Disaring status ${history.appliedStatus}. `
            : 'Tanpa filter status. '}
          Alamat tujuan tidak ditampilkan di daftar; buka satu catatan di konsol web untuk melihatnya.
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={loading}
        onPress={() => void onRefresh()}
        style={[styles.button, isDark && styles.buttonDark, loading && styles.disabled]}
      >
        <Text style={[styles.buttonText, isDark && styles.textDark]}>
          {loading ? 'Memuat…' : 'Perbarui Riwayat'}
        </Text>
      </Pressable>
    </View>
  );
}

function DeliveryRow({
  isDark,
  row,
}: {
  isDark: boolean;
  row: MobileNotificationDelivery;
}) {
  // Read the derived flag, never `row.status === 'SENT'`. The client derives `wasSent` from the
  // timestamp precisely because a status label can be stale in the other direction.
  const sent = row.wasSent;
  const failed = row.status === 'FAILED' || row.status === 'EXHAUSTED';

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <View style={styles.rowBetween}>
        <Text
          style={[
            failed ? styles.errorText : styles.title,
            isDark && (failed ? styles.errorText : styles.textDark),
          ]}
        >
          {row.status}
        </Text>
        <Text style={[styles.meta, isDark && styles.textMutedDark]}>
          {formatDate(row.createdAt)}
        </Text>
      </View>
      <Text style={[styles.body, isDark && styles.textDark]}>
        {row.subject ?? row.templateKey ?? row.channel}
      </Text>
      <Text style={[styles.meta, isDark && styles.textMutedDark]}>
        {row.channel} · percobaan {row.attemptCount} ·{' '}
        {sent ? `terkirim ${formatDate(row.sentAt)}` : 'belum terkirim'}
      </Text>
      {row.lastErrorCode ? (
        <Text style={[styles.errorText, styles.meta]}>{row.lastErrorCode}</Text>
      ) : null}
    </View>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  card: { gap: 6, borderColor: '#dbe3ef', borderRadius: 16, borderWidth: 1, backgroundColor: '#ffffff', padding: 15 },
  cardDark: { borderColor: '#334155', backgroundColor: '#1e293b' },
  errorCardDark: { borderColor: '#7f1d1d', backgroundColor: '#2a1416' },
  title: { color: '#0f172a', fontSize: 15, fontWeight: '800' },
  body: { color: '#0f172a', fontSize: 13, lineHeight: 19 },
  meta: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  count: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  errorTitle: { color: '#b91c1c', fontSize: 14, fontWeight: '800' },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  button: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderColor: '#94a3b8', borderRadius: 12, borderWidth: 1, paddingHorizontal: 16 },
  buttonDark: { borderColor: '#64748b' },
  buttonText: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  textDark: { color: '#f8fafc' },
  textMutedDark: { color: '#cbd5e1' },
});