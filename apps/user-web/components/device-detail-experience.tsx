'use client';

import { TERMINAL_COMMAND_STATUSES } from '../lib/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraPlayer } from '@iot-platform/design-system';
import { DeviceRoutinesPanel } from './device-routines-panel';
import { DeviceLocationPanel } from './device-location-panel';
import { StateNotice } from '@iot-platform/design-system';
import type { UserDeviceDetailPayload } from '../lib/contracts';
import { CapabilityControl } from './capability-control';
import { LoginForm } from './login-form';

type State =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; payload: UserDeviceDetailPayload };

/**
 * A failed poll observes nothing, so it must not borrow the vocabulary of an
 * observation: only `terminal` and `pending` may carry a status, and `pending`
 * is only produced after a successful poll actually saw a non-terminal status.
 * Collapsing "still in flight" and "could not check" into one `null` is how a
 * 401/5xx ends up rendered as "Command masih PENDING/SENT".
 */
type CommandReconciliation =
  | { outcome: 'terminal'; status: string }
  | { outcome: 'pending'; status: string }
  | { outcome: 'failed'; reason: string };


export function DeviceDetailExperience({ deviceId }: { deviceId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => null)) as
        | UserDeviceDetailPayload
        | { message?: string }
        | null;
      if (generation !== loadGeneration.current) return;
      if (response.status === 401) {
        setState({ kind: 'unauthorized' });
        return;
      }
      if (!response.ok) {
        setState({ kind: 'error', message: payload && 'message' in payload && payload.message ? payload.message : 'Detail perangkat gagal dimuat.' });
        return;
      }
      if (payload === null) {
        setState({ kind: 'error', message: 'Backend mengembalikan respons yang tidak dapat dibaca.' });
        return;
      }
      setState({ kind: 'ready', payload: payload as UserDeviceDetailPayload });
    } catch {
      if (generation !== loadGeneration.current) return;
      setState({ kind: 'error', message: 'User Web tidak dapat menghubungi backend.' });
    }
  }, [deviceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return <StateNotice state="loading" title="Memuat perangkat" description="Capability, telemetry, dan command history dibaca dari backend terotorisasi." />;
  }
  if (state.kind === 'unauthorized') {
    return <LoginForm onAuthenticated={() => load()} />;
  }
  if (state.kind === 'error') {
    return <StateNotice state="error" title="Detail tidak tersedia" description={state.message} action={<button className="iot-button" type="button" onClick={() => void load()}>Coba lagi</button>} />;
  }

  const { payload } = state;
  const writableCapabilities = payload.capabilities.filter((capability) => capability.isWritable);
  const telemetryEntries = Object.entries(payload.latestTelemetry?.payload ?? {});

  return (
    <div className="space-y-6">
      {payload.device.type === 'CAMERA' ? <CameraPlayer deviceId={deviceId} /> : null}
      <DeviceLocationPanel key={`location-${deviceId}`} deviceId={deviceId} />
      <DeviceRoutinesPanel key={`routines-${deviceId}`} deviceId={deviceId} capabilities={payload.capabilities} canControl={payload.device.canControl} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a className="text-[12px] font-semibold text-teal-700 hover:underline" href="/perangkat-saya">← Perangkat Saya</a>
            <h2 className="mb-0 mt-2 text-2xl font-extrabold text-slate-900">{payload.device.name}</h2>
            <p className="mb-0 mt-1 text-sm text-slate-500">{payload.device.roomPath ?? 'Belum ditempatkan ke ROOM'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{payload.device.status}</Badge>
            <Badge>{payload.device.canControl ? 'VIEW + CONTROL' : 'VIEW ONLY'}</Badge>
            <Badge>{payload.device.type}</Badge>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Device ID" value={payload.device.id} mono />
          <Info label="Last seen" value={formatDate(payload.device.lastHeartbeatAt)} />
          <Info label="Ruangan" value={payload.device.roomName ?? '—'} />
          <Info label="Capability" value={String(payload.capabilities.length)} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Telemetry Terbaru</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">State perangkat mengikuti telemetry backend, bukan hasil klik command.</p>
        {payload.latestTelemetry && telemetryEntries.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {telemetryEntries.map(([key, value]) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{key}</div>
                <div className="mt-1 break-words text-[15px] font-bold text-slate-900">{formatValue(value)}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-0 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">Belum ada telemetry terbaru untuk perangkat ini.</p>
        )}
        {payload.latestTelemetry ? <p className="mb-0 mt-3 text-[11.5px] text-slate-400">Diterima {formatDate(payload.latestTelemetry.createdAt)}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Capabilities</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-[12.5px]">
            <thead className="border-b border-slate-200 text-[10.5px] uppercase tracking-wider text-slate-400">
              <tr><th className="py-2">Key</th><th>Semantic</th><th>Type</th><th>Unit</th><th>R/W/Report</th></tr>
            </thead>
            <tbody>
              {payload.capabilities.map((capability) => (
                <tr key={capability.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3"><code className="text-teal-700">{capability.key}</code></td>
                  <td>{capability.semanticType}</td>
                  <td>{capability.dataType}</td>
                  <td>{capability.unit ?? '—'}</td>
                  <td>{capability.isReadable ? 'R' : '—'} / {capability.isWritable ? 'W' : '—'} / {capability.isReportable ? 'P' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Firmware, Protocol & Update Evidence</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">Hanya bukti yang benar-benar tersimpan di backend yang ditampilkan. Current firmware/protocol tidak ditebak dari rollout atau tipe perangkat.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Info label="Current Firmware" value={payload.technicalHistory.firmware.currentVersion ?? 'Belum dilaporkan perangkat'} />
          <Info label="Protocol / Adapter" value={payload.technicalHistory.protocol.name ?? 'Belum dilaporkan perangkat'} />
        </div>
        <div className="mt-4 space-y-2">
          {payload.technicalHistory.updateHistory.length === 0 ? (
            <p className="mb-0 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Belum ada rollout OTA tersimpan yang menarget perangkat ini.</p>
          ) : payload.technicalHistory.updateHistory.map((update) => (
            <div key={update.rolloutId} className="rounded-xl border border-slate-200 px-4 py-3 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-800">Firmware {update.firmware.version}</span>
                <Badge>{update.evidenceState}</Badge>
                <Badge>{update.rolloutStatus}</Badge>
              </div>
              <div className="mt-2 break-all font-mono text-[10.5px] text-slate-400">SHA-256 metadata: {update.firmware.sha256Metadata}</div>
              <p className="mb-0 mt-2 text-slate-500">Catatan rollout bukan bukti byte artifact diverifikasi atau firmware fisik berhasil terpasang pada hardware.</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Kontrol</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Nilai mengikuti tipe dan batas capability. Hasil perangkat tetap menunggu ACK dan telemetry.
        </p>
        {!payload.device.canControl ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Akses Anda VIEW saja. Backend juga akan menolak command tanpa CONTROL.</div>
        ) : writableCapabilities.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Tidak ada capability writable pada perangkat ini.</div>
        ) : (
          <div className="space-y-3">
            {writableCapabilities.map((capability) => <CapabilityControl key={capability.id} capability={capability} busy={commandBusy !== null} onSend={(value) => sendBooleanCommand(capability.key, value)} />)}
          </div>
        )}
        {commandMessage ? <p className="mb-0 mt-3 text-[12.5px] text-slate-600">{commandMessage}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Riwayat Command</h3>
        {payload.commandHistory.length === 0 ? (
          <p className="mb-0 mt-4 text-sm text-slate-500">Belum ada command pada perangkat ini.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {payload.commandHistory.map((command) => (
              <div key={command.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-[12px]">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">{command.status}</span>
                <code className="min-w-0 flex-1 truncate text-slate-500">{JSON.stringify(command.payload)}</code>
                <span className="text-slate-400">{formatDate(command.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="m-0 text-base font-extrabold text-slate-900">Temuan Analitik Perangkat</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">Sumber: Module 16 analytics findings. Ini bukan riwayat delivery notifikasi.</p>
        {payload.technicalHistory.analyticsFindings.length === 0 ? (
          <p className="mb-0 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Tidak ada temuan analitik pada riwayat bounded yang tersedia. Ini bukan jaminan all-clear di luar batas riwayat.</p>
        ) : (
          <div className="space-y-2">
            {payload.technicalHistory.analyticsFindings.map((finding) => (
              <div key={finding.id} className="rounded-xl border border-slate-200 px-4 py-3 text-[12px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{finding.severity}</Badge>
                  <span className="font-semibold text-slate-800">{finding.kind}</span>
                  <code className="text-slate-400">{finding.capabilityKey}</code>
                  <span className="ml-auto text-slate-400">{formatDate(finding.createdAt)}</span>
                </div>
                <p className="mb-0 mt-2 text-slate-600">{finding.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  async function sendBooleanCommand(capabilityKey: string, value: unknown) {
    setCommandBusy(capabilityKey);
    setCommandMessage('Mengirim command; state akhir menunggu ACK/telemetry perangkat…');
    try {
      const response = await fetch('/api/device-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, capabilityKey, value }),
      });
      const body = (await response.json().catch(() => ({}))) as { commandId?: string | null; status?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? 'Command gagal dikirim.');
      if (!body.commandId) {
        setCommandMessage(`Command diterima HTTP dengan status ${body.status ?? 'UNKNOWN'}, tetapi correlation id tidak tersedia; state fisik tidak diasumsikan.`);
        return;
      }
      const reconciliation = await waitForTerminalCommand(body.commandId);
      if (reconciliation.outcome === 'terminal') {
        setCommandMessage(`Command selesai dengan status ${reconciliation.status}. Telemetry dimuat ulang sebagai state authoritative.`);
        await load();
      } else if (reconciliation.outcome === 'pending') {
        setCommandMessage(`Command masih ${reconciliation.status} setelah batas rekonsiliasi; state fisik tidak diasumsikan.`);
      } else {
        setCommandMessage(`Rekonsiliasi status command gagal (${reconciliation.reason}); state fisik tidak diasumsikan.`);
      }
    } catch (cause) {
      setCommandMessage(cause instanceof Error ? cause.message : 'Command gagal dikirim.');
    } finally {
      setCommandBusy(null);
    }
  }

  async function waitForTerminalCommand(commandId: string): Promise<CommandReconciliation> {
    let lastStatus: string | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(700);
      let response: Response;
      try {
        response = await fetch(`/api/device-command?deviceId=${encodeURIComponent(deviceId)}&commandId=${encodeURIComponent(commandId)}`, { cache: 'no-store' });
      } catch {
        return { outcome: 'failed', reason: 'endpoint status command tidak dapat dihubungi' };
      }
      const body = (await response.json().catch(() => null)) as { status?: string; message?: string } | null;
      if (!response.ok) {
        return { outcome: 'failed', reason: body?.message ?? `endpoint status command menjawab HTTP ${response.status}` };
      }
      const status = body?.status ?? 'UNKNOWN';
      if (TERMINAL_COMMAND_STATUSES.has(status)) return { outcome: 'terminal', status };
      lastStatus = status;
    }
    return { outcome: 'pending', status: lastStatus ?? 'UNKNOWN' };
  }
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-700">{children}</span>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt><dd className={`mb-0 mt-1 break-all text-[12.5px] font-semibold text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</dd></div>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return '—'; }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
