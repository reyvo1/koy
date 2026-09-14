'use client';

/**
 * Tenant Commands center (blueprint §2) — capability-driven send command UI
 * plus history/ACK status. Writable capability identity and typed values come
 * from the same device capability contract used by Device Detail/Scene.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CapabilityValueInput } from '@/components/capability-value-input';
import { parseCapabilityValue } from '@/lib/capability-value';

interface DeviceRow {
  id: string;
  name?: string;
  status?: string;
}

interface CapabilityRow {
  id: string;
  key: string;
  semanticType?: string;
  dataType?: string;
  unit?: string | null;
  isWritable?: boolean;
  constraints?: unknown;
}

interface CommandItem {
  id: string;
  deviceName: string;
  capabilityKey: string;
  status: string;
  createdAt: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  ACKNOWLEDGED: 'iot2-badge--online',
  SENT: 'iot2-badge--warning',
  PENDING: 'iot2-badge--warning',
  FAILED: 'iot2-badge--offline',
  TIMEOUT: 'iot2-badge--offline',
  TIMED_OUT: 'iot2-badge--offline',
};

const inputClass =
  'mb-4 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[13.5px] text-slate-700 outline-none focus:border-teal-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

export default function TenantCommandsContent() {
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [history, setHistory] = useState<CommandItem[] | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilityRow[] | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [capabilityId, setCapabilityId] = useState('');
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCapability = useMemo(
    () => capabilities?.find((capability) => capability.id === capabilityId) ?? null,
    [capabilities, capabilityId],
  );

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/tenant/commands');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as { items?: CommandItem[] };
      setHistory(Array.isArray(data.items) ? data.items : []);
      setHistoryError(null);
    } catch (cause) {
      setHistory([]);
      setHistoryError(cause instanceof Error ? cause.message : 'gagal memuat riwayat');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/devices')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        const items = Array.isArray(data)
          ? (data as DeviceRow[])
          : ((data as { items?: DeviceRow[] }).items ?? []);
        setDevices(items);
        setTargetId(items[0]?.id ?? '');
        setDeviceError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setDevices([]);
        setDeviceError(cause instanceof Error ? cause.message : 'gagal memuat perangkat');
      });
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  useEffect(() => {
    let cancelled = false;
    setNotice(null);
    setCapabilityId('');
    setValue('');
    setCapabilityError(null);

    if (!targetId) {
      setCapabilities([]);
      return () => {
        cancelled = true;
      };
    }

    setCapabilities(null);
    fetch(`/api/admin/device-capabilities?deviceId=${encodeURIComponent(targetId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: { items?: CapabilityRow[]; capabilities?: CapabilityRow[] } | CapabilityRow[]) => {
        if (cancelled) return;
        const items = Array.isArray(data)
          ? data
          : (data.items ?? data.capabilities ?? []);
        const writable = items.filter((capability) => capability.isWritable === true);
        setCapabilities(writable);
        setCapabilityId(writable[0]?.id ?? '');
        setCapabilityError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setCapabilities([]);
        setCapabilityError(
          cause instanceof Error ? cause.message : 'gagal memuat capability writable',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const send = async () => {
    if (!targetId || !selectedCapability || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const parsed = parseCapabilityValue(value, selectedCapability);
      if (!parsed.ok) throw new Error(parsed.error);

      const res = await fetch(`/api/devices/${encodeURIComponent(targetId)}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          capabilityKey: selectedCapability.key,
          value: parsed.value,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? `backend ${res.status}`);
      }
      setNotice(
        `Perintah ${selectedCapability.key} terkirim — state akhir tetap menunggu ACK/telemetry perangkat.`,
      );
      await loadHistory();
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? `Gagal mengirim: ${cause.message}`
          : 'Gagal mengirim perintah.',
      );
    } finally {
      setSending(false);
    }
  };

  if (deviceError && devices !== null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="m-0 text-[15px] font-semibold text-slate-700">
          Pusat perintah tidak tersedia
        </p>
        <p className="mt-2 text-[13px] text-slate-400">Backend ({deviceError}).</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <div className="iot2-panel">
        <h2 className="iot2-panel__title">Kirim Perintah</h2>
        <label className="mb-1 block text-[12.5px] font-semibold text-slate-500">
          Perangkat
        </label>
        <select
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
          disabled={devices === null || devices.length === 0}
          className={inputClass}
        >
          {(devices ?? []).length === 0 ? <option value="">Belum ada perangkat</option> : null}
          {(devices ?? []).map((device) => (
            <option key={device.id} value={device.id}>
              {device.name ?? device.id.slice(0, 8)}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-[12.5px] font-semibold text-slate-500">
          Capability writable
        </label>
        <select
          value={capabilityId}
          onChange={(event) => {
            setCapabilityId(event.target.value);
            setValue('');
            setNotice(null);
          }}
          disabled={!targetId || capabilities === null || Boolean(capabilityError)}
          className={inputClass}
        >
          {capabilities === null ? <option value="">Memuat capability…</option> : null}
          {capabilities !== null && capabilities.length === 0 ? (
            <option value="">Tidak ada capability writable</option>
          ) : null}
          {(capabilities ?? []).map((capability) => (
            <option key={capability.id} value={capability.id}>
              {capability.key} · {capability.dataType ?? 'unknown'}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-[12.5px] font-semibold text-slate-500">
          Nilai
        </label>
        <CapabilityValueInput
          capability={selectedCapability}
          value={value}
          onChange={(nextValue) => {
            setValue(nextValue);
            setNotice(null);
          }}
          disabled={!selectedCapability || Boolean(capabilityError)}
          placeholder="Nilai sesuai capability"
          className={inputClass}
        />

        {selectedCapability ? (
          <p className="-mt-2 mb-4 text-[11.5px] text-slate-400">
            {selectedCapability.semanticType ?? selectedCapability.key}
            {selectedCapability.unit ? ` · ${selectedCapability.unit}` : ''}
            {' · '}payload mengikuti tipe <strong>{selectedCapability.dataType ?? 'unknown'}</strong>.
          </p>
        ) : null}

        {capabilityError ? (
          <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
            Capability perangkat gagal dimuat ({capabilityError}). Pengiriman dinonaktifkan.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void send()}
          disabled={
            sending ||
            !targetId ||
            !selectedCapability ||
            value === '' ||
            Boolean(capabilityError)
          }
          className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-[13.5px] font-bold text-white shadow transition-colors hover:bg-teal-700 disabled:opacity-50"
        >
          {sending ? 'Mengirim…' : 'Kirim'}
        </button>
        {notice ? (
          <p className="mt-3 mb-0 text-[12.5px] text-slate-500">{notice}</p>
        ) : null}
      </div>

      <div className="iot2-panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[16px] font-bold text-slate-900">
            Riwayat &amp; Status ACK
          </h2>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-teal-700 hover:bg-teal-50"
          >
            Muat ulang ↻
          </button>
        </div>
        {historyError ? (
          <p role="alert" className="m-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
            Riwayat command gagal dimuat ({historyError}).
          </p>
        ) : !history ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-50" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="m-0 py-10 text-center text-[13.5px] text-slate-400">
            Belum ada perintah terkirim.
          </p>
        ) : (
          <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
            {history.map((item) => {
              const status = item.status.toUpperCase();
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-slate-900">
                      {item.deviceName} · {item.capabilityKey}
                    </div>
                    <div className="text-[11.5px] text-slate-400">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString('id-ID')
                        : '—'}
                    </div>
                  </div>
                  <span
                    className={`iot2-badge ml-auto shrink-0 ${
                      STATUS_BADGE[status] ?? STATUS_BADGE.PENDING
                    }`}
                  >
                    {status === 'ACKNOWLEDGED' ? 'ACK' : status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
