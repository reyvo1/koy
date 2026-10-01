'use client';

/**
 * Tenant Commands center (blueprint §2) — capability-driven send command UI
 * plus history/ACK status. Writable capability identity and typed values come
 * from the same device capability contract used by Device Detail/Scene.
 *
 * Each history row opens the command's full record. The backend has served
 * `GET /devices/:id/commands/:commandId` since the command module shipped, but until now
 * nothing in this console called it, so a command was only ever a one-line summary: the
 * operator could see SENT or ACKED and nothing about the send, the acknowledgement, the
 * elapsed time between them, or the payload the device actually received — which is exactly
 * what a failed command needs in order to be diagnosable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
  /**
   * The command's correlationId — the identifier the detail endpoint resolves on. This is
   * NOT the same value as `id` (both are UUIDs in the Prisma model), so a row that carries
   * only `id` cannot be opened.
   */
  commandId: string;
  deviceId: string;
  deviceName: string;
  capabilityKey: string;
  status: string;
  createdAt: string | null;
  acknowledgedAt?: string | null;
}

/** Full record from `GET /devices/:id/commands/:commandId`. */
interface CommandDetail {
  id?: string;
  correlationId?: string;
  deviceId?: string;
  payload?: Record<string, unknown> | null;
  status?: string;
  idempotencyKey?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
  acknowledgedAt?: string | null;
  updatedAt?: string | null;
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
  const [openCommand, setOpenCommand] = useState<CommandItem | null>(null);
  const [commandDetail, setCommandDetail] = useState<CommandDetail | null>(null);
  const [commandDetailError, setCommandDetailError] = useState<string | null>(null);
  const [commandDetailLoading, setCommandDetailLoading] = useState(false);

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

  /**
   * Open one command's full record.
   *
   * A 404 is surfaced as the backend's own wording rather than a generic failure: the
   * endpoint answers 404 both for a command that does not exist and for one that belongs to
   * another device, and that distinction is the answer to "why did my click do nothing".
   */
  const openCommandDetail = useCallback(async (item: CommandItem) => {
    if (!item.commandId || !item.deviceId) {
      setOpenCommand(item);
      setCommandDetail(null);
      setCommandDetailError(
        'Perintah ini tidak punya identitas yang bisa dibuka. Muat ulang riwayat.',
      );
      return;
    }

    setOpenCommand(item);
    setCommandDetail(null);
    setCommandDetailError(null);
    setCommandDetailLoading(true);
    try {
      const res = await fetch(
        `/api/tenant/commands/${encodeURIComponent(
          item.deviceId,
        )}/${encodeURIComponent(item.commandId)}`,
        { cache: 'no-store' },
      );
      const payload = (await res.json().catch(() => null)) as
        | CommandDetail
        | { message?: string; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok) {
        const problem = payload as { message?: string; error?: { message?: string } } | null;
        throw new Error(
          problem?.message ??
            problem?.error?.message ??
            (res.status === 404
              ? 'Perintah tidak ditemukan untuk perangkat ini.'
              : `backend ${res.status}`),
        );
      }
      setCommandDetail(payload as CommandDetail);
    } catch (cause) {
      setCommandDetailError(
        cause instanceof Error ? cause.message : 'Detail perintah tidak dapat dimuat',
      );
    } finally {
      setCommandDetailLoading(false);
    }
  }, []);

  const closeCommandDetail = useCallback(() => {
    setOpenCommand(null);
    setCommandDetail(null);
    setCommandDetailError(null);
    setCommandDetailLoading(false);
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
              const isOpen = openCommand?.id === item.id;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border px-4 py-3 transition-colors ${
                    isOpen
                      ? 'border-teal-300 bg-teal-50/40'
                      : 'border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/*
                      The row is a button, not a div with a handler, so it is reachable by
                      keyboard and announced as interactive. A row that only responds to a
                      click target is invisible to anyone not using a mouse, on the one screen
                      where a stuck command needs investigating.
                    */}
                    <button
                      type="button"
                      onClick={() =>
                        isOpen ? closeCommandDetail() : void openCommandDetail(item)
                      }
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                    </button>
                  </div>
                  {isOpen ? (
                    <CommandDetailPanel
                      detail={commandDetail}
                      error={commandDetailError}
                      loading={commandDetailLoading}
                      fallbackDevice={item.deviceName}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The expanded command record.
 *
 * Two rules govern what appears here. First, a timestamp the backend never set is written
 * as "belum" rather than as a formatted zero date — "01/01/1970 00:00" reads as a real event
 * and is not one. Second, the payload is printed as received rather than interpreted: a
 * command that sent `true` where the operator expected `false` is a real and common fault,
 * and reformatting the value here would hide exactly the thing being investigated.
 */
function CommandDetailPanel({
  detail,
  error,
  loading,
  fallbackDevice,
}: {
  detail: CommandDetail | null;
  error: string | null;
  loading: boolean;
  fallbackDevice: string;
}) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-[12.5px] text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Memuat detail perintah…
      </div>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="mt-3 mb-0 border-t border-slate-200 pt-3 text-[12.5px] text-red-600"
      >
        {error}
      </p>
    );
  }

  if (!detail) return null;

  const ackLatency = latencyOf(detail.sentAt, detail.acknowledgedAt);

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <dl className="m-0 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <DetailRow label="Status" value={detail.status ?? '—'} />
        <DetailRow label="Perangkat" value={fallbackDevice} />
        <DetailRow label="Correlation ID" value={detail.correlationId ?? '—'} mono />
        <DetailRow label="Idempotency key" value={detail.idempotencyKey ?? '—'} mono />
        <DetailRow label="Dibuat" value={formatMoment(detail.createdAt)} />
        <DetailRow label="Terkirim" value={formatMoment(detail.sentAt)} />
        <DetailRow label="Di-ACK" value={formatMoment(detail.acknowledgedAt)} />
        <DetailRow
          label="Latensi ACK"
          value={ackLatency ?? 'belum ada ACK'}
        />
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Payload diterima
          </dt>
          <dd className="mt-0.5 mb-0 break-words font-mono text-[12px] text-slate-700">
            {formatPayload(detail.payload)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 mb-0 truncate text-[12.5px] text-slate-700 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

/** A timestamp the backend never set is stated as absent, not formatted as the epoch. */
function formatMoment(value: string | null | undefined): string {
  if (!value) return 'belum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'waktu tidak diketahui';
  return date.toLocaleString('id-ID');
}

function latencyOf(
  sentAt: string | null | undefined,
  acknowledgedAt: string | null | undefined,
): string | null {
  if (!sentAt || !acknowledgedAt) return null;
  const sent = new Date(sentAt).getTime();
  const ack = new Date(acknowledgedAt).getTime();
  if (Number.isNaN(sent) || Number.isNaN(ack) || ack < sent) return null;
  const ms = ack - sent;
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} detik`;
  return `${(ms / 60_000).toFixed(1)} menit`;
}

/**
 * The payload exactly as the device was asked to act, with no coercion. A boolean stays
 * `true`/`false` rather than becoming "Aktif"/"Nonaktif", because the point of the panel is
 * to show what was sent, and translating the value is how a wrong value gets shipped.
 */
function formatPayload(payload: Record<string, unknown> | null | undefined): string {
  if (payload === null || payload === undefined) return 'tidak ada payload';
  if (typeof payload !== 'object' || Array.isArray(payload)) return String(payload);
  const keys = Object.keys(payload);
  if (keys.length === 0) return 'payload kosong';
  return JSON.stringify(payload, null, 2);
}
