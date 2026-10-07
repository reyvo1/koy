'use client';
import { useState } from 'react';
export interface MapLocation {
  id: string;
  deviceId: string;
  latitude: number;
  longitude: number;
  label?: string | null;
  recordedAt: string;
  deviceName?: string;
  tenantName?: string;
}
/** Equirectangular coordinate map. Zero coordinates are valid; absent fixes never become pins. */
export function GeoMap({ locations }: { locations: MapLocation[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const points = locations.filter(
    (p) =>
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180,
  );
  const selected = points.find((point) => point.id === selectedId) ?? null;
  const x = selected ? selected.longitude + 180 : 180;
  const y = selected ? 90 - selected.latitude : 90;
  return (
    <section
      aria-label="Peta koordinat perangkat"
      style={{
        background: '#131722',
        color: '#e6e9f0',
        border: '1px solid #334155',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <strong>Lokasi perangkat</strong>
        <label style={{ fontSize: 12 }}>
          Zoom{' '}
          <input
            aria-label="Zoom peta"
            type="range"
            min="1"
            max="8"
            step="0.5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      <svg
        role="img"
        aria-label={`${points.length} koordinat tersimpan`}
        viewBox={`${Math.max(0, Math.min(360 - 360 / zoom, x - 180 / zoom))} ${Math.max(0, Math.min(180 - 180 / zoom, y - 90 / zoom))} ${360 / zoom} ${180 / zoom}`}
        style={{
          width: '100%',
          maxHeight: 360,
          background: '#0b0e14',
          marginTop: 12,
          borderRadius: 8,
        }}
      >
        {Array.from({ length: 13 }, (_, i) => (
          <line
            key={`lon-${i}`}
            x1={i * 30}
            x2={i * 30}
            y1={0}
            y2={180}
            stroke="#1e293b"
            strokeWidth="0.3"
          />
        ))}
        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`lat-${i}`}
            x1={0}
            x2={360}
            y1={i * 30}
            y2={i * 30}
            stroke="#1e293b"
            strokeWidth="0.3"
          />
        ))}
        {points.map((p) => (
          <g key={p.id} onClick={() => setSelectedId(p.id)}>
            <circle
              cx={p.longitude + 180}
              cy={90 - p.latitude}
              r={2.5 / zoom}
              fill={selected?.id === p.id ? '#f59e0b' : '#14b8a6'}
              stroke="#e6e9f0"
              strokeWidth={0.4 / zoom}
            >
              <title>
                {p.deviceName ?? p.deviceId}: {p.latitude}, {p.longitude}
              </title>
            </circle>
          </g>
        ))}
      </svg>
      {points.length === 0 ? (
        <p>Belum ada koordinat perangkat.</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            maxHeight: 160,
            overflow: 'auto',
            marginTop: 12,
          }}
        >
          {points.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              aria-pressed={selected?.id === p.id}
              style={{
                background: '#1e293b',
                color: '#e6e9f0',
                border: '1px solid #475569',
                borderRadius: 8,
                padding: 8,
                fontSize: 12,
              }}
            >
              {p.deviceName ?? p.deviceId}
              {p.tenantName ? ` · ${p.tenantName}` : ''}
            </button>
          ))}
        </div>
      )}
      {selected ? (
        <p role="status" style={{ fontSize: 13 }}>
          {selected.label ?? selected.deviceName ?? selected.deviceId} ·{' '}
          {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)} ·{' '}
          {new Date(selected.recordedAt).toLocaleString('id-ID')}
        </p>
      ) : null}
    </section>
  );
}
