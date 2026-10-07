'use client';
import { useCallback, useEffect, useState } from 'react';
import { GeoMap, type MapLocation } from '@iot-platform/design-system';
import { useAdminSessionRole } from './use-admin-session-role';
export function DeviceLocationEditor({ deviceId }: { deviceId: string }) {
  const role = useAdminSessionRole(); // UX hint only; backend repeats CONTROL authorization.
  const [latest, setLatest] = useState<MapLocation | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const endpoint = `/api/devices/${encodeURIComponent(deviceId)}/location`;
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error('Lokasi gagal dibaca.');
      setLatest(body.latest ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lokasi gagal dibaca.');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  useEffect(() => {
    setLatest(null);
    setError('');
    void load();
  }, [load]);
  const field =
    'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-slate-100';
  return (
    <section className="mt-5 rounded-xl border border-slate-800 bg-[#131722] p-5">
      <h3 className="m-0 mb-3 text-base font-bold text-slate-100">
        Koordinat perangkat
      </h3>
      {loading ? (
        <p role="status" className="text-sm text-slate-400">
          Memuat lokasi…
        </p>
      ) : (
        <GeoMap locations={latest ? [latest] : []} />
      )}
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
        className="iot-button"
        type="button"
        disabled={busy || loading}
        onClick={() => {
          setError('');
          void load();
        }}
      >
        Muat ulang lokasi
      </button>
      {(role === 'ADMIN' || role === 'PLATFORM_ADMIN') && (
        <details className="mt-4 text-slate-300">
          <summary className="cursor-pointer text-sm font-semibold">
            Catat koordinat dari operator
          </summary>
          <p className="text-xs text-slate-400">
            Posisi ini dicatat sebagai input operator. Riwayat sebelumnya tetap
            tersimpan; tidak menggantikan bukti GPS fisik.
          </p>
          <form
            className="mt-3 grid gap-3 md:grid-cols-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const response = await fetch(endpoint, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    latitude: Number(values.get('latitude')),
                    longitude: Number(values.get('longitude')),
                    label: `Operator: ${String(values.get('label') ?? '').slice(0, 110)}`,
                  }),
                });
                if (!response.ok)
                  throw new Error(
                    response.status === 403
                      ? 'Izin CONTROL perangkat diperlukan.'
                      : 'Koordinat gagal disimpan.',
                  );
                await load();
                setNotice('Koordinat tersimpan di riwayat backend.');
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : 'Gagal menyimpan.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="text-xs">
              Latitude
              <input
                required
                type="number"
                name="latitude"
                min={-90}
                max={90}
                step="any"
                className={field}
              />
            </label>
            <label className="text-xs">
              Longitude
              <input
                required
                type="number"
                name="longitude"
                min={-180}
                max={180}
                step="any"
                className={field}
              />
            </label>
            <label className="text-xs">
              Label input operator
              <input name="label" maxLength={110} className={field} />
            </label>
            <button
              className="iot-button"
              disabled={busy || loading}
              type="submit"
            >
              Simpan koordinat
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
