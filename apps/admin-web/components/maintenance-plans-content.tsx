'use client';
import { useCallback, useEffect, useState } from 'react';
interface Plan {
  id: string;
  reason: string;
  intervalHours: number;
  nextDueAt: string;
  enabled: boolean;
  device: { name: string };
}
export function MaintenancePlansContent({
  devices,
}: {
  devices: Array<{ id: string; name: string }>;
}) {
  const [data, setData] = useState<{
    items: Plan[];
    runtimeEnabled: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/device-maintenance/plans', {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.message ?? body.error?.message ?? 'Jadwal tidak tersedia.',
        );
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Jadwal gagal dibaca.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function toggle(plan: Plan) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/device-maintenance/plans/${encodeURIComponent(plan.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !plan.enabled }),
        },
      );
      if (!r.ok) throw new Error('Jadwal gagal diubah.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal.');
    } finally {
      setBusy(false);
    }
  }
  const input =
    'mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100';
  return (
    <section className="mb-5 rounded-xl border border-slate-700 bg-[#131722] p-4">
      <h3 className="m-0 text-base font-bold text-slate-100">
        Jadwal maintenance otomatis
      </h3>
      <p className="text-xs text-slate-400">
        Setiap waktu jatuh tempo membuka jendela maintenance; jadwal tetap
        tersimpan setelah restart. Jendela yang masih terbuka tidak diduplikasi.
      </p>
      {data && !data.runtimeEnabled ? (
        <p className="text-xs text-amber-300">
          Worker belum diaktifkan operator. Jadwal baru tidak dapat diaktifkan.
        </p>
      ) : null}
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const values = new FormData(form);
          setBusy(true);
          setError(null);
          try {
            const response = await fetch(
              '/api/admin/device-maintenance/plans',
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  deviceId: values.get('deviceId'),
                  reason: values.get('reason'),
                  intervalHours: Number(values.get('intervalHours')),
                  nextDueAt: new Date(
                    String(values.get('nextDueAt')),
                  ).toISOString(),
                }),
              },
            );
            const body = await response.json();
            if (!response.ok)
              throw new Error(
                body.message ?? body.error?.message ?? 'Jadwal gagal dibuat.',
              );
            form.reset();
            await load();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : 'Jadwal gagal dibuat.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="text-xs text-slate-400">
          Perangkat
          <select required name="deviceId" className={input}>
            <option value="">Pilih perangkat</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Alasan
          <input required name="reason" maxLength={500} className={input} />
        </label>
        <label className="text-xs text-slate-400">
          Berulang setiap (jam)
          <input
            required
            type="number"
            name="intervalHours"
            min={1}
            max={8760}
            defaultValue={24}
            className={input}
          />
        </label>
        <label className="text-xs text-slate-400">
          Waktu pertama
          <input
            required
            type="datetime-local"
            name="nextDueAt"
            className={input}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !data?.runtimeEnabled}
          className="rounded-lg bg-teal-600 p-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Buat jadwal
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-2">
        {data?.items.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 p-3 text-xs text-slate-300"
          >
            <span className="flex-1">
              {p.device.name} · {p.reason} · {p.intervalHours} jam ·{' '}
              {new Date(p.nextDueAt).toLocaleString('id-ID')}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle(p)}
              className="rounded-lg border border-slate-600 px-3 py-2"
            >
              {p.enabled ? 'Nonaktifkan' : 'Aktifkan'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
