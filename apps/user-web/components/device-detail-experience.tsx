'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { StateNotice } from '@iot-platform/design-system';
import type { UserDeviceDetailPayload } from '../lib/contracts';
import { LoginForm } from './login-form';

type State =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; payload: UserDeviceDetailPayload };

const TERMINAL_COMMAND_STATES = new Set(['ACKNOWLEDGED', 'FAILED', 'TIMED_OUT']);

export function DeviceDetailExperience({ deviceId }: { deviceId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [commandBusy, setCommandBusy] = useState<string | null>(null);
  const [commandMessage, setCommandMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(deviceId)}`, { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as UserDeviceDetailPayload | { message?: string };
      if (response.status === 401) {
        setState({ kind: 'unauthorized' });
        return;
      }
      if (!response.ok) {
        setState({ kind: 'error', message: 'message' in payload && payload.message ? payload.message : 'Detail perangkat gagal dimuat.' });
        return;
      }
      setState({ kind: 'ready', payload: payload as UserDeviceDetailPayload });
    } catch {
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
  const booleanWritable = payload.capabilities.filter(
    (capability) => capability.isWritable && capability.dataType.toLowerCase() === 'boolean',
  );
  const telemetryEntries = Object.entries(payload.latestTelemetry?.payload ?? {});

  return (
    <div className="space-y-6">
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
          <Info label="Current Firmware" value={payload.technicalHistory.firmware.currentVersion ?? 'Belum ada kontrak per-device'} />
          <Info label="Protocol / Adapter" value={payload.technicalHistory.protocol.name ?? 'Belum ada kontrak per-device'} />
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
          Hanya capability boolean writable yang ditawarkan pada User Web saat ini. Nilai lain tetap fail-closed sampai typed control surface user disatukan.
        </p>
        {!payload.device.canControl ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Akses Anda VIEW saja. Backend juga akan menolak command tanpa CONTROL.</div>
        ) : booleanWritable.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Tidak ada capability boolean writable pada perangkat ini.</div>
        ) : (
          <div className="space-y-3">
            {booleanWritable.map((capability) => (
              <div key={capability.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div><div className="font-bold text-slate-800">{capability.semanticType || capability.key}</div><code className="text-[11px] text-slate-400">{capability.key}</code></div>
                <div className="flex gap-2">
                  <button disabled={commandBusy !== null} type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" onClick={() => void sendBooleanCommand(capability.key, true)}>ON</button>
                  <button disabled={commandBusy !== null} type="button" className="rounded-lg bg-slate-700 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" onClick={() => void sendBooleanCommand(capability.key, false)}>OFF</button>
                </div>
              </div>
            ))}
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

  async function sendBooleanCommand(capabilityKey: string, value: boolean) {
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
      const terminal = await waitForTerminalCommand(body.commandId);
      setCommandMessage(
        terminal
          ? `Command selesai dengan status ${terminal}. Telemetry dimuat ulang sebagai state authoritative.`
          : 'Command masih PENDING/SENT setelah batas rekonsiliasi; state fisik tidak diasumsikan.',
      );
      if (terminal) await load();
    } catch (cause) {
      setCommandMessage(cause instanceof Error ? cause.message : 'Command gagal dikirim.');
    } finally {
      setCommandBusy(null);
    }
  }

  async function waitForTerminalCommand(commandId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(700);
      const response = await fetch(`/api/device-command?deviceId=${encodeURIComponent(deviceId)}&commandId=${encodeURIComponent(commandId)}`, { cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { status?: string };
      if (!response.ok) return null;
      const status = body.status ?? 'UNKNOWN';
      if (TERMINAL_COMMAND_STATES.has(status)) return status;
    }
    return null;
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
