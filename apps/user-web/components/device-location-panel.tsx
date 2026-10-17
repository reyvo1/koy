'use client';
import { useEffect, useState } from 'react';
import { GeoMap, type MapLocation } from '@iot-platform/design-system';
export function DeviceLocationPanel({ deviceId }: { deviceId: string }) {
  const [fixes, setFixes] = useState<MapLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setFixes(null);
    setError(null);
    fetch(`/api/devices/${encodeURIComponent(deviceId)}/location`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Lokasi tidak dapat dibaca.');
        const body = await response.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
        setFixes(body.latest ? [body.latest] : []);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [deviceId]);
  if (error) return <p role="alert">{error}</p>;
  return fixes ? (
    <GeoMap locations={fixes} />
  ) : (
    <div
      className="iot-skeleton"
      aria-label="Memuat lokasi"
      style={{ height: 120 }}
    />
  );
}
