'use client';

/**
 * Mobile app preview (blueprint §5) — renders the 5-tab mobile UI inside a
 * phone frame on the admin console, so stakeholders can see the mobile UX
 * without a device. Data-bound to the same backend proxies.
 */

import { useEffect, useState } from 'react';
import { AdminShellV3 } from '@/components/admin-shell-v3';

interface DeviceRow {
  id: string;
  name: string;
  type?: string;
  status: string;
}

const TABS = [
  { key: 'home', label: 'Home', icon: '' },
  { key: 'devices', label: 'Devices', icon: '' },
  { key: 'realtime', label: 'Realtime', icon: '' },
  { key: 'alerts', label: 'Alerts', icon: '' },
  { key: 'profile', label: 'Profile', icon: '' },
];

export default function MobilePreviewPage() {
  const [tab, setTab] = useState('home');
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  useEffect(() => {
    fetch('/api/admin/devices')
      .then((r) => r.json())
      .then((body) => setDevices(Array.isArray(body) ? body : body.items ?? []))
      .catch(() => undefined);
  }, []);

  const online = devices.filter((d) => ['ACTIVE', 'ONLINE'].includes(d.status));
  const offline = devices.length - online.length;

  return (
    <AdminShellV3
      title="Mobile App Preview"
      subtitle="Blueprint section 5 — tampilan aplikasi HP (Expo React Native)"
    >
      <div className="flex flex-wrap gap-8">
        {/* Phone frame */}
        <div className="mx-auto w-[340px] rounded-[44px] border-[10px] border-slate-950 bg-[#0b1120] shadow-[0_25px_60px_rgba(0,0,0,.5)]">
          <div className="overflow-hidden rounded-[34px]">
            {/* status bar */}
            <div className="flex items-center justify-between px-6 pt-3 text-[12px] font-semibold text-slate-300">
              <span>09:41</span>
              <span> </span>
            </div>
            {/* app bar */}
            <div className="px-5 pt-4">
              <h2 className="m-0 text-xl font-extrabold text-teal-300">Dashboard Saya</h2>
              <p className="mb-0 mt-0.5 text-[12px] text-slate-500">
                {devices.length} perangkat terdaftar
              </p>
            </div>

            {/* content per tab */}
            <div className="min-h-[480px] px-4 py-4">
              {tab === 'home' && (
                <>
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="text-[11.5px] text-slate-400">Online</div>
                      <div className="text-[26px] font-extrabold text-emerald-400">{online.length}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                      <div className="text-[11.5px] text-slate-400">Offline</div>
                      <div className="text-[26px] font-extrabold text-slate-400">{offline}</div>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {devices.slice(0, 4).map((d) => {
                      const on = ['ACTIVE','ONLINE'].includes(d.status);
                      return (
                        <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5">
                          <span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                          <div>
                            <div className="text-[14px] font-semibold text-slate-100">{d.name}</div>
                            <div className="text-[11px] text-slate-500">{d.status}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {tab === 'devices' && (
                <div className="space-y-2.5">
                  {devices.map((d) => (
                    <div key={d.id} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5">
                      <div className="text-[14px] font-semibold text-slate-100"> {d.name}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{d.type ?? 'perangkat'} · {d.status}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'realtime' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center">
                  <div className="text-[13px] font-semibold text-slate-200">Preview tidak mensimulasikan telemetry</div>
                  <div className="mt-1 text-[12px] text-slate-500">Gunakan menu Realtime Tenant untuk data live.</div>
                </div>
              )}

              {tab === 'alerts' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
                  <div className="text-3xl"></div>
                  <div className="mt-2 text-[13px] text-slate-400">Preview tidak mensimulasikan alert.</div>
                </div>
              )}

              {tab === 'profile' && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-teal-400 to-emerald-600 text-xl font-bold text-white">A</div>
                  <div className="mt-3 text-[15px] font-bold text-white">Profil aplikasi</div>
                  <div className="text-[12px] text-slate-500">Identitas mengikuti sesi aman pada aplikasi mobile.</div>
                </div>
              )}
            </div>

            {/* bottom nav */}
            <div className="flex border-t border-slate-800 bg-[#0f172a] px-2 py-2.5">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] transition-colors ${
                    tab === t.key ? 'font-bold text-teal-300' : 'text-slate-500'
                  }`}>
                  <span className="text-base">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Side explanation */}
        <div className="min-w-[280px] flex-1 space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
            <h3 className="m-0 font-bold text-white">Tentang preview ini</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-slate-400">
              Ini adalah pratinjau interaktif dari aplikasi mobile Expo
              (<code className="text-teal-300">apps/user-mobile</code>). Klik tab di
              bawah frame HP untuk berpindah layar. Aplikasi aslinya berjalan
              di Android/iOS dengan data yang sama dari backend.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
            <h3 className="m-0 mb-3 font-bold text-white">Layar sesuai blueprint</h3>
            <ul className="space-y-2 text-[13.5px] text-slate-300">
              <li> Home — ringkasan online/offline</li>
              <li> Devices — daftar perangkat</li>
              <li> Realtime — telemetry live</li>
              <li> Alerts — peringatan aktif</li>
              <li> Profile — akun & pengaturan</li>
            </ul>
          </div>
        </div>
      </div>
    </AdminShellV3>
  );
}
