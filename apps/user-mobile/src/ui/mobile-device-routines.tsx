import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { mobileSessionClient } from '../session';
import type { MobileDeviceDetail } from '../device-control/mobile-device-client';
import { parseCapabilityValue } from '../../../../packages/sdk/src/capability-value';
import {
  MobileLocationMap,
  type MobileMapLocation,
} from './mobile-location-map';

type Scene = {
  id: string;
  name: string;
  enabled: boolean;
  actions: { deviceId: string }[];
};
type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  targetSceneId: string;
};
export function MobileDeviceRoutines({
  detail,
  isDark,
}: {
  detail: MobileDeviceDetail;
  isDark: boolean;
}) {
  const [scenes, setScenes] = useState<Scene[]>([]),
    [schedules, setSchedules] = useState<Schedule[]>([]),
    [locations, setLocations] = useState<MobileMapLocation[]>([]);
  const [error, setError] = useState(''),
    [locationError, setLocationError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(''),
    [capId, setCapId] = useState(''),
    [raw, setRaw] = useState('');
  const [scheduleName, setScheduleName] = useState(''),
    [targetId, setTargetId] = useState(''),
    [kind, setKind] = useState('COUNTDOWN'),
    [timing, setTiming] = useState('60'),
    [timezone, setTimezone] = useState('Asia/Makassar');
  const [history, setHistory] = useState<
      | {
          id?: string;
          status?: string;
          createdAt?: string;
          scheduledFor?: string;
        }[]
      | null
    >(null),
    [remove, setRemove] = useState<{ path: string; name: string } | null>(null);
  const caps = detail.capabilities.filter(
    (cap) =>
      cap.isWritable &&
      ['boolean', 'integer', 'number', 'string', 'enum'].includes(cap.dataType),
  );
  const cap = caps.find((row) => row.id === capId) ?? caps[0];
  const color = isDark ? '#e6e9f0' : '#1e293b',
    backgroundColor = isDark ? '#131722' : '#fff';
  const field = {
    color,
    backgroundColor,
    borderWidth: 1,
    borderColor: '#64748b',
    borderRadius: 8,
    padding: 10,
  };
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    setLocationError('');
    await Promise.all([
      (async () => {
        try {
          const result = await mobileSessionClient.requestJson<{
            latest: MobileMapLocation | null;
          }>(
            `/devices/${encodeURIComponent(detail.device.id)}/location?limit=1`,
          );
          setLocations(result.latest ? [result.latest] : []);
        } catch {
          setLocations([]);
          setLocationError('Lokasi gagal dibaca.');
        }
      })(),
      (async () => {
        try {
          const [allScenes, allSchedules] = await Promise.all([
            mobileSessionClient.requestJson<Scene[]>('/scenes'),
            mobileSessionClient.requestJson<Schedule[]>('/schedules'),
          ]);
          const visible = allScenes.filter((scene) =>
            scene.actions.some(
              (action) => action.deviceId === detail.device.id,
            ),
          );
          setScenes(visible);
          const ids = new Set(visible.map((scene) => scene.id));
          setSchedules(
            allSchedules.filter((schedule) => ids.has(schedule.targetSceneId)),
          );
        } catch {
          setError('Scene/jadwal gagal dibaca dari backend.');
        }
      })(),
    ]);
    setBusy(false);
  }, [detail.device.id]);
  useEffect(() => {
    setHistory(null);
    void load();
  }, [load]);
  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await mobileSessionClient.requestJson(path, {
        method,
        ...(body !== undefined
          ? {
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {}),
      });
      setRemove(null);
      await load();
      setNotice('Aksi diterima. Periksa riwayat untuk hasil eksekusi.');
    } catch {
      setError(
        'Aksi ditolak atau layanan belum tersedia. Pastikan CONTROL semua perangkat scene, scene aktif, dan runtime scheduler aktif.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function readHistory(path: string) {
    setBusy(true);
    setError('');
    try {
      setHistory(await mobileSessionClient.requestJson(`${path}?limit=20`));
    } catch {
      setError('Riwayat gagal dibaca.');
    } finally {
      setBusy(false);
    }
  }
  function button(label: string, action: () => void, disabled = false) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={busy || disabled}
        onPress={action}
        style={{
          padding: 10,
          borderWidth: 1,
          borderColor: '#64748b',
          borderRadius: 8,
          opacity: busy || disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ color }}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={{ backgroundColor, padding: 16, borderRadius: 14, gap: 12 }}>
      <MobileLocationMap locations={locations} isDark={isDark} />
      {locationError && (
        <Text accessibilityRole="alert" style={{ color: '#ef4444' }}>
          {locationError}
        </Text>
      )}
      <Text accessibilityRole="header" style={{ color, fontWeight: '700' }}>
        Scenes & Jadwal
      </Text>
      {error && (
        <Text accessibilityRole="alert" style={{ color: '#ef4444' }}>
          {error}
        </Text>
      )}
      {notice && <Text style={{ color }}>{notice}</Text>}
      {button(busy ? 'Memuat…' : 'Muat ulang rutinitas', () => void load())}
      {detail.device.canControl && cap && (
        <>
          <TextInput
            accessibilityLabel="Nama scene"
            placeholder="Nama scene"
            placeholderTextColor="#94a3b8"
            maxLength={120}
            value={name}
            onChangeText={setName}
            style={field}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {caps.map((row) => (
              <View key={row.id}>
                {button(`${row.id === cap.id ? '✓ ' : ''}${row.key}`, () => {
                  setCapId(row.id);
                  setRaw('');
                })}
              </View>
            ))}
          </View>
          <TextInput
            accessibilityLabel={`Nilai ${cap.dataType}`}
            placeholder={`Nilai ${cap.dataType} (boolean: true/false)`}
            placeholderTextColor="#94a3b8"
            value={raw}
            onChangeText={setRaw}
            style={field}
          />
          {button('Buat scene', () => {
            const parsed = parseCapabilityValue(raw, cap);
            if (!parsed.ok) {
              setError(parsed.error);
              return;
            }
            void act('/scenes', 'POST', {
              name,
              actions: [
                {
                  actionId: 'device-action',
                  deviceId: detail.device.id,
                  capabilityId: cap.id,
                  capabilityKey: cap.key,
                  value: parsed.value,
                },
              ],
            });
          })}
        </>
      )}
      {scenes.map((scene) => (
        <View
          key={scene.id}
          style={{
            gap: 8,
            borderTopWidth: 1,
            borderColor: '#64748b',
            paddingTop: 12,
          }}
        >
          <Text style={{ color }}>
            {scene.name} · {scene.enabled ? 'Aktif' : 'Nonaktif'}
          </Text>
          {button(
            'Riwayat scene',
            () => void readHistory(`/scenes/${scene.id}/executions`),
          )}
          {detail.device.canControl && (
            <>
              {button(
                scene.enabled ? 'Nonaktifkan scene' : 'Aktifkan scene',
                () =>
                  void act(`/scenes/${scene.id}`, 'PATCH', {
                    enabled: !scene.enabled,
                  }),
              )}
              {button(
                'Jalankan scene',
                () => void act(`/scenes/${scene.id}/run`, 'POST', {}),
                !scene.enabled,
              )}
              {button('Hapus scene', () =>
                setRemove({ path: `/scenes/${scene.id}`, name: scene.name }),
              )}
            </>
          )}
        </View>
      ))}
      {detail.device.canControl && scenes.length > 0 && (
        <>
          <TextInput
            accessibilityLabel="Nama jadwal"
            placeholder="Nama jadwal"
            placeholderTextColor="#94a3b8"
            maxLength={120}
            value={scheduleName}
            onChangeText={setScheduleName}
            style={field}
          />
          <View style={{ gap: 8 }}>
            {scenes.map((scene) => (
              <View key={scene.id}>
                {button(
                  `${(targetId || scenes[0].id) === scene.id ? '✓ ' : ''}${scene.name}`,
                  () => setTargetId(scene.id),
                )}
              </View>
            ))}
          </View>
          {button(kind === 'CRON' ? 'Jenis: Cron' : 'Jenis: Countdown', () => {
            setKind(kind === 'CRON' ? 'COUNTDOWN' : 'CRON');
            setTiming(kind === 'CRON' ? '60' : '0 7 * * *');
          })}
          <TextInput
            accessibilityLabel={
              kind === 'CRON' ? 'Ekspresi cron' : 'Countdown detik'
            }
            placeholder={kind === 'CRON' ? 'Ekspresi cron' : 'Countdown detik'}
            placeholderTextColor="#94a3b8"
            value={timing}
            onChangeText={setTiming}
            style={field}
          />
          <TextInput
            accessibilityLabel="Zona waktu"
            value={timezone}
            onChangeText={setTimezone}
            style={field}
          />
          {button(
            'Buat jadwal sekali (nonaktif)',
            () =>
              void act('/schedules', 'POST', {
                name: scheduleName,
                targetSceneId: targetId || scenes[0].id,
                kind,
                timezone,
                repeat: 'ONCE',
                ...(kind === 'CRON'
                  ? { expression: timing }
                  : { countdownSeconds: Number(timing) }),
              }),
          )}
        </>
      )}
      {schedules.map((schedule) => (
        <View key={schedule.id} style={{ gap: 8 }}>
          <Text style={{ color }}>
            {schedule.name} · {schedule.enabled ? 'Aktif' : 'Nonaktif'}
          </Text>
          {button(
            'Riwayat jadwal',
            () => void readHistory(`/schedules/${schedule.id}/runs`),
          )}
          {detail.device.canControl && (
            <>
              {button(
                schedule.enabled ? 'Nonaktifkan jadwal' : 'Aktifkan jadwal',
                () =>
                  void act(
                    `/schedules/${schedule.id}/${schedule.enabled ? 'disable' : 'enable'}`,
                    'POST',
                    {},
                  ),
              )}
              {button('Hapus jadwal', () =>
                setRemove({
                  path: `/schedules/${schedule.id}`,
                  name: schedule.name,
                }),
              )}
            </>
          )}
        </View>
      ))}
      {history && (
        <View style={{ gap: 8 }}>
          <Text style={{ color }}>Riwayat eksekusi</Text>
          {history.length ? (
            history.map((row, index) => (
              <Text key={row.id ?? index} style={{ color }}>
                {row.status ?? 'Unknown'} ·{' '}
                {row.createdAt ?? row.scheduledFor ?? 'Waktu tidak tersedia'}
              </Text>
            ))
          ) : (
            <Text style={{ color }}>Belum ada eksekusi.</Text>
          )}
        </View>
      )}
      <Modal
        transparent
        visible={Boolean(remove)}
        onRequestClose={() => {
          if (!busy) setRemove(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#000b',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            accessibilityViewIsModal
            style={{ padding: 20, borderRadius: 16, backgroundColor, gap: 16 }}
          >
            <Text style={{ color }}>
              Hapus {remove?.name}? Scene yang dipakai jadwal harus dilepas
              terlebih dahulu.
            </Text>
            {error ? (
              <Text accessibilityRole="alert" style={{ color: '#ef4444' }}>
                {error}
              </Text>
            ) : null}
            {button('Batal', () => setRemove(null))}
            {button('Konfirmasi hapus', () => {
              if (remove) void act(remove.path, 'DELETE');
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}
