'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TenantShell } from '@/components/tenant-shell';
import { CountUp, FadeIn, shadow } from '@/components/ui-polish';
import {
  RadioTower,
  Wifi,
  Clapperboard,
  Sofa,
  MapPin,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface DeviceRow {
  id: string;
  name?: string;
  status?: string;
  lastHeartbeatAt?: string | null;
}

interface SpaceNode {
  id: string;
  name: string;
  kind: 'SITE' | 'BUILDING' | 'FLOOR' | 'ROOM';
  path?: string;
}

interface SceneRow {
  id: string;
  enabled?: boolean;
}

function isOnline(device: DeviceRow): boolean {
  const status = (device.status ?? '').toUpperCase();
  return (status === 'ACTIVE' || status === 'ONLINE') && Boolean(device.lastHeartbeatAt);
}

function smoothPath(values: number[], w: number, h: number): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((value, index) => ({
    x: (index / (values.length - 1)) * (w - 12) + 6,
    y: h - 14 - ((value - min) / span) * (h - 30),
  }));
  let path = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let index = 0; index < pts.length - 1; index += 1) {
    const p0 = pts[Math.max(0, index - 1)];
    const p1 = pts[index];
    const p2 = pts[index + 1];
    const p3 = pts[Math.min(pts.length - 1, index + 2)];
    path += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(
      p2.x -
      (p3.x - p1.x) / 6
    ).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

function TelemetrySparkline() {
  const [points, setPoints] = useState<number[] | null>(null);
  const [rangeLabel, setRangeLabel] = useState('24 jam terakhir');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let hadSuccessfulResponse = false;
      setError(null);
      const ranges: Array<[number, string]> = [
        [24, '24 jam terakhir'],
        [168, '7 hari terakhir'],
        [744, '31 hari terakhir'],
      ];
      for (const [hours, label] of ranges) {
        try {
          const response = await fetch(`/api/admin/telemetry-chart?hours=${hours}`);
          if (!response.ok) continue;
          hadSuccessfulResponse = true;
          const body = (await response.json()) as {
            buckets?: Array<{ avg?: number | null }>;
          };
          const values = (body.buckets ?? [])
            .map((bucket) => (typeof bucket.avg === 'number' ? bucket.avg : null))
            .filter((value): value is number => value !== null);
          if (values.length >= 2) {
            if (!cancelled) {
              setPoints(values);
              setRangeLabel(label);
            }
            return;
          }
        } catch {
          // Try the next bounded range.
        }
      }
      if (!cancelled) {
        setPoints([]);
        if (!hadSuccessfulResponse) {
          setError('Telemetri tidak dapat dimuat dari backend saat ini.');
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const width = 640;
  const height = 120;
  const path = points && points.length >= 2 ? smoothPath(points, width, height) : null;
  const last = points && points.length > 0 ? points[points.length - 1] : null;

  return (
    <div className="iot2-panel mb-8" style={{ padding: '18px 22px' }}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[13.5px] font-bold text-slate-100">Telemetri</div>
          <div className="text-[11.5px]" style={{ color: 'var(--iot-text-muted)' }}>
            rata-rata per jam · {rangeLabel}
          </div>
        </div>
        {last !== null ? (
          <div className="text-[20px] font-extrabold text-teal-300">{last.toFixed(1)}</div>
        ) : null}
      </div>
      {points === null ? (
        <div className="h-[120px] animate-pulse rounded-xl bg-slate-800/50" />
      ) : error ? (
        <div role="alert" className="grid h-[120px] place-items-center rounded-xl border border-red-500/25 bg-red-500/5 px-4 text-center text-[12.5px] text-red-300">
          {error}
        </div>
      ) : path ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[120px] w-full"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Grafik telemetri ${rangeLabel}`}
        >
          <defs>
            <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${width - 4},${height} L4,${height} Z`} fill="url(#spark)" stroke="none" />
          <path d={path} fill="none" stroke="#2dd4bf" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <div className="grid h-[120px] place-items-center rounded-xl border border-dashed border-slate-700/60 px-4 text-center text-[12.5px] text-slate-500">
          Belum ada data telemetri. Grafik akan muncul setelah perangkat mengirim data.
        </div>
      )}
    </div>
  );
}

export default function TenantDashboardPage() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [rooms, setRooms] = useState<SpaceNode[] | null>(null);
  const [activeScenes, setActiveScenes] = useState<number | null>(null);
  const [deviceError, setDeviceError] = useState(false);
  const [roomError, setRoomError] = useState(false);
  const [sceneError, setSceneError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setDeviceError(false);
      setRoomError(false);
      setSceneError(false);
      const [deviceResult, spaceResult, sceneResult] = await Promise.allSettled([
        fetch('/api/admin/devices'),
        fetch('/api/tenant/spaces'),
        fetch('/api/tenant/scenes'),
      ]);
      if (cancelled) return;

      if (deviceResult.status === 'fulfilled' && deviceResult.value.ok) {
        const body = (await deviceResult.value.json()) as DeviceRow[] | { items?: DeviceRow[] };
        setDevices(Array.isArray(body) ? body : (body.items ?? []));
      } else {
        setDeviceError(true);
      }

      if (spaceResult.status === 'fulfilled' && spaceResult.value.ok) {
        const body = (await spaceResult.value.json()) as SpaceNode[] | { items?: SpaceNode[] };
        const items = Array.isArray(body) ? body : (body.items ?? []);
        setRooms(items.filter((item) => item.kind === 'ROOM'));
      } else {
        setRoomError(true);
      }

      if (sceneResult.status === 'fulfilled' && sceneResult.value.ok) {
        const body = (await sceneResult.value.json()) as SceneRow[] | { items?: SceneRow[] };
        const items = Array.isArray(body) ? body : (body.items ?? []);
        setActiveScenes(items.filter((item) => item.enabled === true).length);
      } else {
        setSceneError(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = devices?.length ?? null;
  const online = devices ? devices.filter(isOnline).length : null;

  const stats = [
    { label: 'Perangkat', value: total, unavailable: deviceError, href: '/tenant/perangkat', icon: RadioTower, tone: 'text-sky-400 bg-sky-500/10' },
    { label: 'Online', value: online, unavailable: deviceError, href: '/tenant/realtime', icon: Wifi, tone: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'Ruangan', value: rooms?.length ?? null, unavailable: roomError, href: '/tenant/ruangan', icon: Sofa, tone: 'text-amber-400 bg-amber-500/10' },
    { label: 'Scene Aktif', value: activeScenes, unavailable: sceneError, href: '/tenant/scenes', icon: Clapperboard, tone: 'text-violet-400 bg-violet-500/10' },
  ];

  return (
    <TenantShell title="Dashboard Tenant" subtitle="Ringkasan data tenant dari backend aktif" active="/tenant/dashboard">
      <FadeIn>
        <div className="iot2-stats mb-9">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="iot2-stat group block"
                style={{ ['--accent' as string]: 'var(--iot-primary)' }}
              >
                <span className={`iot2-stat__icon ${stat.tone} transition-transform duration-200 group-hover:scale-110`}>
                  <Icon className="h-[19px] w-[19px]" strokeWidth={2} />
                </span>
                <div className="iot2-stat__label">{stat.label}</div>
                <div className="iot2-stat__value">
                  {stat.unavailable ? (
                    <span className="text-red-300" title="Data backend tidak tersedia">—</span>
                  ) : stat.value === null ? (
                    <span className="text-slate-300">…</span>
                  ) : (
                    <CountUp value={stat.value} />
                  )}
                </div>
                {stat.unavailable ? (
                  <p className="iot2-stat__trend text-red-300">backend tidak tersedia</p>
                ) : stat.label === 'Online' ? (
                  <p className="iot2-stat__trend">berdasarkan heartbeat nyata</p>
                ) : null}
              </Link>
            );
          })}
        </div>
      </FadeIn>

      <FadeIn delay={100}>
        <TelemetrySparkline />
      </FadeIn>

      <FadeIn delay={160}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="m-0 text-[17px] font-bold tracking-tight text-slate-100">Ruangan</h2>
          <Link href="/tenant/ruangan" className="text-[12.5px] font-semibold text-teal-400 hover:text-teal-300">
            Kelola ruangan →
          </Link>
        </div>
        {roomError ? (
          <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/5 p-8 text-center text-[13px] text-red-300">
            Data ruangan tidak dapat dimuat dari backend.
          </div>
        ) : rooms === null ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-3xl bg-slate-800/50" />
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700/70 bg-[#111c2e] p-8 text-center">
            <Sofa className="mx-auto h-8 w-8 text-slate-500" strokeWidth={1.7} />
            <p className="mb-1 mt-3 text-[14px] font-semibold text-slate-200">Belum ada ruangan</p>
            <p className="m-0 text-[12.5px] text-slate-500">Tambahkan struktur lokasi agar ruangan muncul di dashboard.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.slice(0, 8).map((room, index) => (
              <FadeIn key={room.id} delay={180 + index * 40}>
                <Link
                  href="/tenant/ruangan"
                  className={`group block rounded-3xl border border-slate-800/80 bg-[#111c2e] p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-teal-500/50 ${shadow.card} ${shadow.cardHover}`}
                >
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-emerald-500/15 transition-transform duration-200 group-hover:scale-110">
                    <Sofa className="h-5 w-5 text-teal-300" strokeWidth={1.8} />
                  </span>
                  <div className="mt-4 text-[16px] font-bold tracking-tight text-slate-50">{room.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5" strokeWidth={1.8} />
                    <span className="truncate">{room.path ?? 'struktur lokasi tenant'}</span>
                  </div>
                </Link>
              </FadeIn>
            ))}
          </div>
        )}
      </FadeIn>

      <FadeIn delay={240}>
        <div className={`mt-9 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 ${shadow.card}`}>
          <p className="m-0 text-[13px] leading-relaxed text-slate-400">
            Dashboard ini hanya menampilkan data yang berasal dari API. Aktivitas atau nilai yang belum memiliki sumber backend tidak disimulasikan.
          </p>
        </div>
      </FadeIn>
    </TenantShell>
  );
}
