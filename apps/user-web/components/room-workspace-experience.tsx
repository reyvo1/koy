'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StateNotice } from '@iot-platform/design-system';
import type {
  UserWorkspaceDevice,
  UserWorkspacePayload,
  UserWorkspaceRoom,
} from '../lib/contracts';
import { LoginForm } from './login-form';

type WorkspaceMode = 'home' | 'rooms' | 'devices';
type State =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; payload: UserWorkspacePayload };

export function RoomWorkspaceExperience({ mode }: { mode: WorkspaceMode }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch('/api/workspace', { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as
        | UserWorkspacePayload
        | { message?: string };
      if (response.status === 401) {
        setState({ kind: 'unauthorized' });
        return;
      }
      if (!response.ok) {
        setState({
          kind: 'error',
          message: 'message' in payload && payload.message ? payload.message : 'Workspace gagal dimuat.',
        });
        return;
      }
      setState({ kind: 'ready', payload: payload as UserWorkspacePayload });
    } catch {
      setState({ kind: 'error', message: 'User Web tidak dapat menghubungi backend.' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return (
      <StateNotice
        state="loading"
        title="Memuat workspace"
        description="Ruangan dan perangkat dibaca dari backend sesuai akses owner/share aktif."
      />
    );
  }

  if (state.kind === 'unauthorized') {
    return <LoginForm onAuthenticated={() => load()} />;
  }

  if (state.kind === 'error') {
    return (
      <StateNotice
        state="error"
        title="Workspace tidak tersedia"
        description={state.message}
        action={
          <button className="iot-button" type="button" onClick={() => void load()}>
            Coba lagi
          </button>
        }
      />
    );
  }

  const payload = state.payload;
  const online = payload.devices.filter((device) => device.status === 'ACTIVE').length;
  const controllable = payload.devices.filter((device) => device.canControl).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Akses terotorisasi</div>
          <div className="mt-1 text-sm text-slate-600">
            {payload.visibleDeviceCount} perangkat terlihat · {controllable} dapat dikontrol
          </div>
        </div>
        <button className="rounded-xl border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={() => void load()}>
          Perbarui
        </button>
      </div>

      {payload.truncated ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
          Workspace menampilkan {payload.maxVisibleDevices} perangkat pertama dari {payload.totalAccessibleDevices} perangkat yang dapat diakses. Tidak ada data tambahan yang diasumsikan.
        </div>
      ) : null}

      {mode === 'home' ? (
        <HomeView payload={payload} online={online} controllable={controllable} />
      ) : mode === 'rooms' ? (
        <RoomsView rooms={payload.rooms} unassigned={payload.unassignedDevices} />
      ) : (
        <DevicesView devices={payload.devices} />
      )}
    </div>
  );
}

function HomeView({
  payload,
  online,
  controllable,
}: {
  payload: UserWorkspacePayload;
  online: number;
  controllable: number;
}) {
  const cards = [
    ['Ruangan', String(payload.rooms.length)],
    ['Perangkat', String(payload.visibleDeviceCount)],
    ['Aktif', String(online)],
    ['CONTROL', String(controllable)],
  ];
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{value}</div>
          </div>
        ))}
      </section>
      {payload.rooms.length === 0 && payload.unassignedDevices.length === 0 ? (
        <StateNotice
          state="empty"
          title="Belum ada perangkat yang dapat dilihat"
          description="User hanya melihat perangkat yang dimiliki atau dibagikan dengan izin VIEW/CONTROL aktif."
        />
      ) : (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-extrabold text-slate-900">Ruangan Saya</h2>
              <p className="mb-0 mt-1 text-sm text-slate-500">Perangkat dikelompokkan berdasarkan placement ROOM yang nyata.</p>
            </div>
            <a className="text-[13px] font-semibold text-teal-700 hover:underline" href="/ruangan">Lihat semua</a>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {payload.rooms.slice(0, 4).map((room) => (
              <RoomCard key={room.id} room={room} compact />
            ))}
          </div>
          {payload.unassignedDevices.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-5">
              <div className="font-bold text-slate-800">Belum ditempatkan ke ruangan</div>
              <p className="mb-3 mt-1 text-sm text-slate-500">{payload.unassignedDevices.length} perangkat terotorisasi belum memiliki placement ROOM.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {payload.unassignedDevices.slice(0, 6).map((device) => <DeviceCard key={device.id} device={device} />)}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}

function RoomsView({ rooms, unassigned }: { rooms: UserWorkspaceRoom[]; unassigned: UserWorkspaceDevice[] }) {
  if (rooms.length === 0 && unassigned.length === 0) {
    return (
      <StateNotice
        state="empty"
        title="Belum ada ruangan/perangkat yang dapat dilihat"
        description="Room/Space hanya muncul bila berisi perangkat yang memang dapat diakses user aktif."
      />
    );
  }
  return (
    <div className="space-y-5">
      {rooms.map((room) => <RoomCard key={room.id} room={room} />)}
      {unassigned.length > 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="m-0 text-base font-extrabold text-slate-900">Tanpa Ruangan</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">Perangkat berikut tetap terlihat karena akses owner/share, bukan karena placement.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unassigned.map((device) => <DeviceCard key={device.id} device={device} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DevicesView({ devices }: { devices: UserWorkspaceDevice[] }) {
  const ordered = useMemo(
    () => [...devices].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })),
    [devices],
  );
  if (ordered.length === 0) {
    return (
      <StateNotice
        state="empty"
        title="Belum ada perangkat yang dapat dilihat"
        description="Daftar ini mengikuti owner/share VIEW/CONTROL aktif dari backend."
      />
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((device) => <DeviceCard key={device.id} device={device} />)}
    </div>
  );
}

function RoomCard({ room, compact = false }: { room: UserWorkspaceRoom; compact?: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <div className="text-base font-extrabold text-slate-900">{room.name}</div>
        <div className="mt-1 text-[12px] text-slate-400">{room.path}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(compact ? room.devices.slice(0, 4) : room.devices).map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
      {compact && room.devices.length > 4 ? (
        <p className="mb-0 mt-3 text-[12px] text-slate-500">+{room.devices.length - 4} perangkat lain</p>
      ) : null}
    </section>
  );
}

function DeviceCard({ device }: { device: UserWorkspaceDevice }) {
  return (
    <a
      href={`/perangkat-saya/${encodeURIComponent(device.id)}`}
      className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-slate-900">{device.name}</div>
          <div className="mt-1 text-[11.5px] text-slate-500">{device.type}</div>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${device.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
          {device.status}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11.5px] text-slate-500">
        <span>{device.canControl ? 'VIEW + CONTROL' : 'VIEW'}</span>
        <span>Detail →</span>
      </div>
    </a>
  );
}
