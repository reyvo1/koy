'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  CapabilityValueInput,
  ConfirmationDialog,
} from '@iot-platform/design-system';
import { parseCapabilityValue } from '../../../packages/sdk/src/capability-value';
import type { UserDeviceCapability } from '../lib/contracts';

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
  kind: string;
  targetSceneId: string;
  expression?: string;
  countdownSeconds?: number;
  timezone?: string;
};
const endpoint = '/api/device-routines';
async function request(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`${endpoint}/${path}`, {
    method,
    cache: 'no-store',
    ...(body !== undefined
      ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message ?? 'Aksi gagal.');
  return payload;
}

export function DeviceRoutinesPanel({
  deviceId,
  capabilities,
  canControl,
}: {
  deviceId: string;
  capabilities: UserDeviceCapability[];
  canControl: boolean;
}) {
  const writable = capabilities.filter(
    (cap) =>
      cap.isWritable &&
      ['boolean', 'integer', 'number', 'string', 'enum'].includes(cap.dataType),
  );
  const [scenes, setScenes] = useState<Scene[]>([]),
    [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [name, setName] = useState(''),
    [capabilityId, setCapabilityId] = useState(''),
    [raw, setRaw] = useState('');
  const [scheduleName, setScheduleName] = useState(''),
    [target, setTarget] = useState(''),
    [kind, setKind] = useState('COUNTDOWN'),
    [expression, setExpression] = useState('0 7 * * *'),
    [timezone, setTimezone] = useState('Asia/Makassar'),
    [seconds, setSeconds] = useState('60'),
    [repeat, setRepeat] = useState('ONCE'),
    [maxRuns, setMaxRuns] = useState('1');
  const [history, setHistory] = useState<{
    title: string;
    rows: {
      id?: string;
      status?: string;
      createdAt?: string;
      startedAt?: string;
      scheduledFor?: string;
    }[];
  } | null>(null);
  const [remove, setRemove] = useState<{ path: string; name: string } | null>(
    null,
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allScenes, allSchedules] = await Promise.all([
        request('scenes'),
        request('schedules'),
      ]);
      const visible: Scene[] = (
        Array.isArray(allScenes) ? allScenes : (allScenes.items ?? [])
      ).filter((scene: Scene) =>
        scene.actions?.some((action) => action.deviceId === deviceId),
      );
      setScenes(visible);
      const ids = new Set(visible.map((scene) => scene.id));
      setSchedules(
        (Array.isArray(allSchedules)
          ? allSchedules
          : (allSchedules.items ?? [])
        ).filter((schedule: Schedule) => ids.has(schedule.targetSceneId)),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Rutinitas gagal dimuat.',
      );
    } finally {
      setLoading(false);
    }
  }, [deviceId]);
  useEffect(() => {
    setError('');
    setHistory(null);
    void load();
  }, [load]);
  const capability =
    writable.find((cap) => cap.id === capabilityId) ?? writable[0];
  async function act(
    path: string,
    method: string,
    body?: unknown,
    success = 'Perubahan tersimpan.',
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request(path, method, body);
      setNotice(success);
      await load();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi gagal.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function showHistory(path: string, title: string) {
    setBusy(true);
    setError('');
    try {
      const result = await request(path);
      setHistory({
        title,
        rows: Array.isArray(result) ? result : (result.items ?? []),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Riwayat gagal.');
    } finally {
      setBusy(false);
    }
  }
  const inputClass =
    'w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100';
  return (
    <section className="rounded-2xl border border-slate-700 bg-[#131722] p-5 text-slate-100">
      <h3 className="m-0 text-base font-bold">Scenes & Jadwal Perangkat</h3>
      <p className="text-sm text-slate-400">
        Scene dapat dijalankan manual atau oleh jadwal. Hasil eksekusi dan ACK
        perangkat diperiksa pada riwayat; klik tidak mengubah telemetry.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-teal-300">
          {notice}
        </p>
      )}
      <button
        type="button"
        className="iot-button"
        disabled={loading || busy}
        onClick={() => {
          setError('');
          void load();
        }}
      >
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      {canControl && writable.length > 0 && (
        <form
          className="mt-4 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!capability) return;
            const parsed = parseCapabilityValue(raw, capability);
            if (!parsed.ok) {
              setError(parsed.error);
              return;
            }
            void act(
              'scenes',
              'POST',
              {
                name,
                actions: [
                  {
                    actionId: 'device-action',
                    deviceId,
                    capabilityId: capability.id,
                    capabilityKey: capability.key,
                    value: parsed.value,
                  },
                ],
              },
              'Scene dibuat. Aktifkan untuk menjalankannya.',
            );
          }}
        >
          <label className="text-sm">
            Nama scene
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-sm">
            Capability
            <select
              value={capability?.id ?? ''}
              onChange={(e) => {
                setCapabilityId(e.target.value);
                setRaw('');
              }}
              className={inputClass}
            >
              {writable.map((cap) => (
                <option key={cap.id} value={cap.id}>
                  {cap.key} ({cap.dataType})
                </option>
              ))}
            </select>
          </label>
          {capability && (
            <label className="text-sm">
              Nilai target
              <CapabilityValueInput
                capability={capability}
                value={raw}
                onChange={setRaw}
                disabled={busy}
                className={inputClass}
              />
            </label>
          )}
          <button className="iot-button" disabled={busy} type="submit">
            Buat scene
          </button>
        </form>
      )}
      <div className="mt-5 space-y-3">
        {scenes.map((scene) => (
          <article
            key={scene.id}
            className="rounded-xl border border-slate-700 p-3"
          >
            <strong>{scene.name}</strong>
            <span className="ml-3 text-xs text-slate-400">
              {scene.enabled ? 'Aktif' : 'Nonaktif'}
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="iot-button"
                disabled={busy}
                type="button"
                onClick={() =>
                  void showHistory(`scenes/${scene.id}/executions`, scene.name)
                }
              >
                Riwayat scene
              </button>
              {canControl && (
                <>
                  <button
                    className="iot-button"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      void act(`scenes/${scene.id}`, 'PATCH', {
                        enabled: !scene.enabled,
                      })
                    }
                  >
                    {scene.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button
                    className="iot-button"
                    disabled={busy || !scene.enabled}
                    type="button"
                    onClick={() =>
                      void act(
                        `scenes/${scene.id}/run`,
                        'POST',
                        { requestId: crypto.randomUUID(), mode: 'ORDERED' },
                        'Eksekusi diterima. Periksa riwayat untuk hasil tiap command.',
                      )
                    }
                  >
                    Jalankan
                  </button>
                  <button
                    className="iot-button"
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      setRemove({
                        path: `scenes/${scene.id}`,
                        name: scene.name,
                      })
                    }
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        {!loading && !scenes.length && (
          <p className="text-sm text-slate-400">
            Belum ada scene terotorisasi untuk perangkat ini.
          </p>
        )}
      </div>
      {canControl && scenes.length > 0 && (
        <form
          className="mt-5 grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              'schedules',
              'POST',
              {
                name: scheduleName,
                targetSceneId: target || scenes[0].id,
                kind,
                timezone,
                repeat,
                ...(kind === 'CRON'
                  ? { expression }
                  : { countdownSeconds: Number(seconds) }),
                ...(repeat === 'LIMITED' ? { maxRuns: Number(maxRuns) } : {}),
              },
              'Jadwal tersimpan nonaktif. Aktifkan setelah memeriksa target scene.',
            );
          }}
        >
          <label className="text-sm">
            Nama jadwal
            <input
              required
              maxLength={120}
              className={inputClass}
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Scene target
            <select
              className={inputClass}
              value={target || scenes[0].id}
              onChange={(e) => setTarget(e.target.value)}
            >
              {scenes.map((scene) => (
                <option value={scene.id} key={scene.id}>
                  {scene.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Jenis
            <select
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="COUNTDOWN">Countdown</option>
              <option value="CRON">Cron</option>
            </select>
          </label>
          {kind === 'CRON' ? (
            <label className="text-sm">
              Ekspresi cron
              <input
                required
                className={inputClass}
                maxLength={128}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
              />
            </label>
          ) : (
            <label className="text-sm">
              Jeda detik (maksimum 30 hari)
              <input
                required
                type="number"
                min={1}
                max={2592000}
                className={inputClass}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
          )}
          <label className="text-sm">
            Zona waktu
            <input
              required
              className={inputClass}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Pengulangan
            <select
              className={inputClass}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            >
              <option value="ONCE">Sekali</option>
              <option value="INDEFINITE">Berulang</option>
              <option value="LIMITED">Jumlah terbatas</option>
            </select>
          </label>
          {repeat === 'LIMITED' && (
            <label className="text-sm">
              Jumlah eksekusi
              <input
                required
                min={1}
                type="number"
                className={inputClass}
                value={maxRuns}
                onChange={(e) => setMaxRuns(e.target.value)}
              />
            </label>
          )}
          <button className="iot-button" type="submit" disabled={busy}>
            Buat jadwal
          </button>
        </form>
      )}
      <div className="mt-4 space-y-3">
        {schedules.map((schedule) => (
          <article
            key={schedule.id}
            className="rounded-xl border border-slate-700 p-3"
          >
            <strong>{schedule.name}</strong>
            <p className="text-xs text-slate-400">
              {schedule.kind} ·{' '}
              {schedule.expression ?? `${schedule.countdownSeconds ?? 0} detik`}{' '}
              · {schedule.timezone} · {schedule.enabled ? 'Aktif' : 'Nonaktif'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="iot-button"
                disabled={busy}
                onClick={() =>
                  void showHistory(
                    `schedules/${schedule.id}/runs`,
                    schedule.name,
                  )
                }
              >
                Riwayat jadwal
              </button>
              {canControl && (
                <>
                  <button
                    type="button"
                    className="iot-button"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        `schedules/${schedule.id}/${schedule.enabled ? 'disable' : 'enable'}`,
                        'POST',
                        {},
                      )
                    }
                  >
                    {schedule.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button
                    type="button"
                    className="iot-button"
                    disabled={busy}
                    onClick={() =>
                      setRemove({
                        path: `schedules/${schedule.id}`,
                        name: schedule.name,
                      })
                    }
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {history && (
        <div className="mt-5">
          <h4>{history.title} — riwayat</h4>
          {history.rows.length ? (
            history.rows.map((row, index) => (
              <p key={row.id ?? index} className="text-sm">
                {row.status ?? 'Status tidak tersedia'} ·{' '}
                {row.createdAt ??
                  row.startedAt ??
                  row.scheduledFor ??
                  'Waktu tidak tersedia'}
              </p>
            ))
          ) : (
            <p className="text-sm text-slate-400">
              Belum ada eksekusi tersimpan.
            </p>
          )}
        </div>
      )}
      <ConfirmationDialog
        error={error}
        open={Boolean(remove)}
        busy={busy}
        title="Hapus rutinitas?"
        description={`Hapus ${remove?.name ?? ''}? Scene yang masih dipakai jadwal harus dilepas terlebih dahulu.`}
        confirmLabel="Hapus"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove)
            void act(remove.path, 'DELETE').then((result) => {
              if (result) setRemove(null);
            });
        }}
      />
    </section>
  );
}
