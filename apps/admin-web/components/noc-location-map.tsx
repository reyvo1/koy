'use client';
import { useEffect, useState } from 'react';
import { GeoMap, type MapLocation } from '@iot-platform/design-system';
export function NocLocationMap() {
  const [data, setData] = useState<{
    items: MapLocation[];
    truncated: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/super/device-locations', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Lokasi platform gagal dibaca.');
        setData(await r.json());
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  return (
    <div>
      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : data ? (
        <>
          <GeoMap locations={data.items} />
          {data.truncated ? (
            <p className="text-amber-300">
              Menampilkan batas 200 perangkat. Gunakan detail tenant untuk
              lokasi lainnya.
            </p>
          ) : null}
        </>
      ) : (
        <div className="iot-skeleton h-40" />
      )}
    </div>
  );
}
