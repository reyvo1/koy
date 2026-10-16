'use client';

/**
 * Device Detail (blueprint §3): Information, Capabilities, Realtime
 * Telemetry chart, Commands, Command History, Alert History.
 * Domain-bound: devices/capabilities/telemetry/commands APIs only.
 */

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { SeriesChart } from '@iot-platform/design-system';
import { CapabilityValueInput } from '@/components/capability-value-input';
import { DeviceLocationEditor } from '@/components/device-location-editor';
import DeviceSharePanel from '@/components/device-share-panel';
import { parseCapabilityValue, readCapabilityConstraints } from '@/lib/capability-value';
import { createLoadGuard } from '@/lib/safe-fetch';

interface DeviceInfo {
  id: string;
  name: string;
  type?: string;
  status: string;
  lastHeartbeatAt?: string | null;
  createdAt?: string;
}

/** Verdict from the backend's own health check, not a client-side re-derivation. */
type DeviceHealthStatus = 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';

const HEALTH_LABEL: Record<DeviceHealthStatus, string> = {
  HEALTHY: 'Sehat',
  UNHEALTHY: 'Tidak sehat (heartbeat > 5 menit)',
  UNKNOWN: 'Belum ada heartbeat',
};

interface Capability {
  id: string;
  key: string;
  semanticType: string;
  dataType: string;
  unit?: string | null;
  isReadable: boolean;
  isWritable: boolean;
  constraints?: unknown;
}


interface DeviceTechnicalHistory {
  firmware: { currentVersion: string | null; availability: string; reason: string };
  protocol: { name: string | null; availability: string; reason: string };
  updateHistory: Array<{
    rolloutId: string;
    rolloutStatus: string;
    evidenceState: string;
    firmware: { version: string; sha256Metadata: string };
    physicalInstallProven: false;
    artifactBytesVerifiedByPlatform: false;
    updatedAt: string;
  }>;
  analyticsFindings: Array<{
    id: string;
    severity: string;
    kind: string;
    capabilityKey: string;
    summary: string;
    createdAt: string;
  }>;
  alertDeliveryHistory: { available: false; reason: string };
}

interface CommandRow {
  id: string;
  capabilityKey?: string;
  status?: string;
  createdAt?: string;
}

const TABS = ['Information', 'Capabilities', 'Telemetry', 'Commands', 'History'] as const;

export default function DeviceDetailContent() {
  const params = useParams<{ deviceId: string }>();
  const deviceId = params?.deviceId ?? '';

  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [commands, setCommands] = useState<CommandRow[]>([]);
  const [technicalHistory, setTechnicalHistory] = useState<DeviceTechnicalHistory | null>(null);
  const [buckets, setBuckets] = useState<Array<{ start: string; avg: number }>>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Information');
  const [error, setError] = useState<string | null>(null);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [commandHistoryError, setCommandHistoryError] = useState<string | null>(null);
  const [technicalHistoryError, setTechnicalHistoryError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [commandResult, setCommandResult] = useState<string | null>(null);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const [capabilityResult, setCapabilityResult] = useState<string | null>(null);
  const [capabilityDataType, setCapabilityDataType] = useState('boolean');
  const [commandInputs, setCommandInputs] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<DeviceHealthStatus>('UNKNOWN');

  const loadGuard = useRef(createLoadGuard());

  const load = useCallback(async () => {
    const isCurrent = loadGuard.current.begin();
    try {
      setError(null);
      setCapabilityError(null);
      setCommandHistoryError(null);
      setTechnicalHistoryError(null);
      setTelemetryError(null);
      const [dRes, capRes, commandRes, technicalRes, healthRes] = await Promise.all([
        fetch(`/api/admin/device-detail?deviceId=${encodeURIComponent(deviceId)}`),
        fetch(`/api/admin/device-capabilities?deviceId=${encodeURIComponent(deviceId)}`),
        fetch(`/api/devices/${encodeURIComponent(deviceId)}/commands`),
        fetch(`/api/devices/${encodeURIComponent(deviceId)}/technical-history`),
        fetch(`/api/admin/device-health?deviceId=${encodeURIComponent(deviceId)}`),
      ]);
      if (!dRes.ok) throw new Error(`device HTTP ${dRes.status}`);
      // One generation per run. Every setState below is downstream of an await, so without
      // this a slow earlier load can overwrite the state written by a later one, and a
      // navigation away mid-flight writes to a component that is no longer mounted.
      if (!isCurrent()) return;
      setDevice(await dRes.json());
      // Ask the API for the verdict rather than recomputing it from lastHeartbeatAt here.
      // The five-minute rule lives in DeviceService.checkHealth; duplicating it in the
      // browser is how the console and the system it reports on drift apart.
      if (healthRes.ok) {
        const body = (await healthRes.json()) as { status?: DeviceHealthStatus };
        setHealth(body.status ?? 'UNKNOWN');
      } else {
        setHealth('UNKNOWN');
      }
      if (capRes.ok) {
        const body = await capRes.json();
        setCapabilities(body.capabilities ?? []);
        setCapabilityError(null);
      } else {
        setCapabilities([]);
        setCapabilityError(`capability HTTP ${capRes.status}`);
      }
      if (commandRes.ok) {
        const body = (await commandRes.json()) as { items?: CommandRow[] };
        setCommands(Array.isArray(body.items) ? body.items : []);
        setCommandHistoryError(null);
      } else {
        setCommands([]);
        setCommandHistoryError(`command history HTTP ${commandRes.status}`);
      }
      if (technicalRes.ok) {
        setTechnicalHistory((await technicalRes.json()) as DeviceTechnicalHistory);
        setTechnicalHistoryError(null);
      } else {
        setTechnicalHistory(null);
        setTechnicalHistoryError(`technical history HTTP ${technicalRes.status}`);
      }
      const chartRes = await fetch(
        `/api/admin/telemetry-chart?deviceId=${encodeURIComponent(deviceId)}&hours=24`,
      );
      if (chartRes.ok) {
        setBuckets(((await chartRes.json()).buckets ?? []) as typeof buckets);
        setTelemetryError(null);
      } else {
        setBuckets([]);
        setTelemetryError(`telemetry HTTP ${chartRes.status}`);
      }
    } catch (cause) {
      if (!isCurrent()) return;
      setError(cause instanceof Error ? cause.message : 'gagal memuat');
    }
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);


  const createCapability = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (capabilityBusy) return;
    setCapabilityBusy(true);
    setCapabilityResult(null);
    const form = new FormData(event.currentTarget);
    const unit = String(form.get('unit') ?? '').trim();
    const dataType = String(form.get('dataType') ?? '');
    const constraints: Record<string, unknown> = {};

    try {
      if (dataType === 'integer' || dataType === 'number') {
        const minRaw = String(form.get('min') ?? '').trim();
        const maxRaw = String(form.get('max') ?? '').trim();
        const precisionRaw = String(form.get('precision') ?? '').trim();
        if (minRaw) constraints.min = Number(minRaw);
        if (maxRaw) constraints.max = Number(maxRaw);
        if (dataType === 'number' && precisionRaw) constraints.precision = Number(precisionRaw);
      } else if (dataType === 'enum') {
        const enumRaw = String(form.get('enumValues') ?? '').trim();
        const enumValues = enumRaw.split(',').map((entry) => entry.trim()).filter(Boolean);
        if (enumValues.length === 0) throw new Error('Enum membutuhkan minimal satu nilai.');
        constraints.enumValues = enumValues;
      }

      const payload = {
        key: String(form.get('key') ?? '').trim(),
        semanticType: String(form.get('semanticType') ?? '').trim(),
        dataType,
        ...(unit ? { unit } : {}),
        ...(Object.keys(constraints).length ? { constraints } : {}),
        isReadable: form.get('isReadable') === 'on',
        isWritable: form.get('isWritable') === 'on',
        isReportable: form.get('isReportable') === 'on',
      };
      const response = await fetch(
        `/api/admin/device-capabilities?deviceId=${encodeURIComponent(deviceId)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }
      event.currentTarget.reset();
      setCapabilityDataType('boolean');
      setCapabilityResult('Capability tersimpan.');
      await load();
    } catch (cause) {
      setCapabilityResult(
        cause instanceof Error ? `Gagal: ${cause.message}` : 'Gagal menyimpan capability.',
      );
    } finally {
      setCapabilityBusy(false);
    }
  };

  const sendCommand = async (value: unknown, capabilityKey: string) => {
    setCommandResult(null);
    try {
      const response = await fetch(`/api/devices/${deviceId}/commands`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capabilityKey, value }),
      });
      const body = (await response.json().catch(() => null)) as
        | { commandId?: string; status?: string; error?: { message?: string } }
        | null;
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setCommandResult(`Perintah diterima backend (${body?.status ?? 'PENDING'}). Status aktual menunggu ACK/telemetry.`);
      void load();
    } catch (cause) {
      setCommandResult(cause instanceof Error ? cause.message : 'gagal');
    }
  };

  const sendTypedCommand = async (capability: Capability) => {
    const raw = commandInputs[capability.id] ?? '';
    const parsed = parseCapabilityValue(raw, capability);
    if (!parsed.ok) {
      setCommandResult(`${capability.key}: ${parsed.error}`);
      return;
    }
    await sendCommand(parsed.value, capability.key);
  };

  const online = device ? ['ACTIVE', 'ONLINE'].includes(device.status) : false;

  if (error)
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-red-400">
        {error}
      </div>
    );
  if (!device)
    return <p className="text-slate-500">Memuat detail perangkat…</p>;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-teal-400/20 to-emerald-600/20 text-3xl">
          {device.type === 'SENSOR' ? '◈' : ''}
        </div>
        <div>
          <h2 className="m-0 text-[22px] font-extrabold text-white">{device.name}</h2>
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.7)]' : 'bg-slate-600'}`} />
            <span className={`text-[13px] font-semibold ${online ? 'text-emerald-400' : 'text-slate-400'}`}>
              {online ? 'Online' : 'Offline'} · {device.status}
            </span>
          </div>
        </div>
      </div>

      {/* Device sharing (Module 18) — the operator hands this device to a member here.
          Placed above the tabs because it applies to the device as a whole, not to one
          tab: it grants or removes access to every capability below. */}
      <DeviceSharePanel deviceId={device.id} />

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all ${
              tab === t ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-slate-200'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Information */}
      {tab === 'Information' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Device ID', device.id],
            ['Tipe', device.type ?? '—'],
            ['Status', device.status],
            ['Terdaftar', device.createdAt ? new Date(device.createdAt).toLocaleString('id-ID') : '—'],
            ['Health (dari API)', HEALTH_LABEL[health]],
            ['Heartbeat Terakhir', device.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).toLocaleString('id-ID') : 'belum ada'],
            ['Jumlah Capability', capabilityError ? '—' : String(capabilities.length)],
            ['Current Firmware', technicalHistory?.firmware.currentVersion ?? 'belum dilaporkan perangkat'],
            ['Protocol / Adapter', technicalHistory?.protocol.name ?? 'belum dilaporkan perangkat'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-800/80 bg-[#111c2e] px-5 py-4">
              <div className="text-[12px] text-slate-500">{label}</div>
              <div className="mt-1 break-all text-[14px] font-semibold text-slate-100">{value}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'Information' ? <DeviceLocationEditor key={deviceId} deviceId={deviceId} /> : null}

      {/* Capabilities */}
      {tab === 'Capabilities' && (
        <div>
          <form
            onSubmit={createCapability}
            className="mb-5 grid gap-3 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 md:grid-cols-4"
          >
            <input name="key" required placeholder="key, contoh switch.power" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
            <input name="semanticType" required placeholder="semantic type, contoh power" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
            <select name="dataType" value={capabilityDataType} onChange={(event) => setCapabilityDataType(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100">
              {['boolean', 'integer', 'number', 'string', 'enum', 'object'].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input name="unit" placeholder="unit (opsional)" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
            {(capabilityDataType === 'integer' || capabilityDataType === 'number') ? (
              <>
                <input name="min" type="number" step={capabilityDataType === 'integer' ? 1 : 'any'} placeholder="min (opsional)" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
                <input name="max" type="number" step={capabilityDataType === 'integer' ? 1 : 'any'} placeholder="max (opsional)" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
                {capabilityDataType === 'number' ? (
                  <input name="precision" type="number" min={0} step={1} placeholder="precision (opsional)" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100" />
                ) : null}
              </>
            ) : null}
            {capabilityDataType === 'enum' ? (
              <input name="enumValues" required placeholder="enum: AUTO,ON,OFF" className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 md:col-span-2" />
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="isReadable" defaultChecked /> readable</label>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="isWritable" /> writable</label>
            <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" name="isReportable" defaultChecked /> reportable</label>
            <button disabled={capabilityBusy || Boolean(capabilityError)} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {capabilityBusy ? 'Menyimpan…' : 'Tambah Capability'}
            </button>
            {capabilityResult ? <p className="m-0 text-xs text-teal-300 md:col-span-4">{capabilityResult}</p> : null}
          </form>
          {capabilityError ? (
            <p role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Capability tidak dapat dimuat ({capabilityError}). Penambahan dan command dinonaktifkan sampai katalog tersedia.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap) => (
            <div key={cap.id} className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[13px] font-semibold text-teal-300">{cap.key}</span>
                <span className={`iot2-badge ${cap.isWritable ? 'iot2-badge--warning' : 'iot2-badge--online'}`}>
                  {cap.isWritable ? 'WRITABLE' : 'READ'}
                </span>
              </div>
              <div className="mt-3 text-[12px] text-slate-500">
                {cap.semanticType} · {cap.dataType}{cap.unit ? ` · ${cap.unit}` : ''}{(() => { const c = readCapabilityConstraints(cap.constraints); return c.enumValues?.length ? ` · [${c.enumValues.join(', ')}]` : ''; })()}
              </div>
            </div>
          ))}
          {!capabilityError && capabilities.length === 0 && (
            <p className="text-slate-500 text-sm">Belum ada capability terdaftar.</p>
          )}
          </div>
        </div>
      )}

      {/* Telemetry */}
      {tab === 'Telemetry' && (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-4 text-[15px] font-bold text-white">Realtime Telemetry (24 jam)</h3>
          {telemetryError ? (
            <p role="alert" className="py-8 text-center text-red-400">Telemetry gagal dimuat ({telemetryError}).</p>
          ) : buckets.length === 0 ? (
            <p className="py-8 text-center text-slate-500">Belum ada data telemetry numerik.</p>
          ) : (
            <SeriesChart
              ariaLabel="Grafik telemetry 24 jam"
              height={220}
              series={[
                {
                  key: 'avg',
                  label: 'Rata-rata',
                  points: buckets.map((bucket) => ({ at: bucket.start, value: bucket.avg })),
                },
              ]}
            />
          )}
        </div>
      )}

      {/* Commands */}
      {tab === 'Commands' && (
        <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
          <h3 className="m-0 mb-4 text-[15px] font-bold text-white">Kirim Perintah</h3>
          {capabilityError ? (
            <p role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Katalog capability tidak tersedia ({capabilityError}); command dinonaktifkan.
            </p>
          ) : capabilities.filter((cap) => cap.isWritable).length === 0 ? (
            <p className="text-sm text-slate-500">Tidak ada capability writable pada perangkat ini.</p>
          ) : (
            <div className="space-y-3">
              {capabilities.filter((cap) => cap.isWritable).map((cap) => (
                <div key={cap.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] font-semibold text-teal-300">{cap.key}</div>
                    <div className="mt-1 text-[11.5px] text-slate-500">{cap.semanticType} · {cap.dataType}{cap.unit ? ` · ${cap.unit}` : ''}{(() => { const c = readCapabilityConstraints(cap.constraints); return c.enumValues?.length ? ` · [${c.enumValues.join(', ')}]` : ''; })()}</div>
                  </div>
                  {cap.dataType === 'boolean' ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void sendCommand(true, cap.key)} className="rounded-xl bg-emerald-500/15 px-4 py-2 text-[13px] font-bold text-emerald-400 hover:bg-emerald-500/25">TRUE</button>
                      <button type="button" onClick={() => void sendCommand(false, cap.key)} className="rounded-xl bg-red-500/15 px-4 py-2 text-[13px] font-bold text-red-400 hover:bg-red-500/25">FALSE</button>
                    </div>
                  ) : (
                    <div className="flex min-w-[240px] flex-1 flex-wrap items-center gap-2 sm:flex-nowrap">
                      <CapabilityValueInput
                        capability={cap}
                        value={commandInputs[cap.id] ?? ''}
                        onChange={(value) => setCommandInputs((current) => ({ ...current, [cap.id]: value }))}
                        className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100"
                      />
                      <button type="button" onClick={() => void sendTypedCommand(cap)} className="rounded-xl bg-teal-500/15 px-4 py-2 text-[13px] font-bold text-teal-300 hover:bg-teal-500/25">Kirim</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {commandResult && (
            <p className="mt-4 text-[13px] text-teal-300">{commandResult}</p>
          )}
          <p className="mt-4 text-[12px] text-slate-500">
            Command dibangun hanya dari capability writable yang terdaftar. State akhir tetap mengikuti ACK/telemetry perangkat.
          </p>
        </div>
      )}

      {/* History */}
      {tab === 'History' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
            <h3 className="m-0 mb-4 text-[15px] font-bold text-white">Command History</h3>
            {commandHistoryError ? (
              <p role="alert" className="text-sm text-red-400">Riwayat command gagal dimuat ({commandHistoryError}).</p>
            ) : commands.length === 0 ? (
              <p className="text-slate-500 text-sm">Belum ada riwayat perintah.</p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {commands.map((cmd) => (
                  <div key={cmd.id} className="flex items-center gap-3 py-3 text-[13.5px]">
                    <span className="font-mono text-slate-300">{cmd.capabilityKey ?? '—'}</span>
                    <span className="ml-auto text-slate-500">{cmd.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
            <h3 className="m-0 mb-2 text-[15px] font-bold text-white">OTA / Firmware Update Evidence</h3>
            <p className="mb-4 text-xs text-slate-500">Rollout state adalah catatan backend; bukan bukti byte artifact diverifikasi atau firmware fisik berhasil terpasang.</p>
            {technicalHistoryError ? (
              <p role="alert" className="text-sm text-red-400">Riwayat teknis gagal dimuat ({technicalHistoryError}).</p>
            ) : !technicalHistory || technicalHistory.updateHistory.length === 0 ? (
              <p className="text-sm text-slate-500">Belum ada rollout tersimpan yang menarget perangkat ini.</p>
            ) : (
              <div className="space-y-3">
                {technicalHistory.updateHistory.map((update) => (
                  <div key={update.rolloutId} className="rounded-xl border border-slate-800/70 p-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-200">Firmware {update.firmware.version}</span>
                      <span className="iot2-badge iot2-badge--warning">{update.evidenceState}</span>
                      <span className="text-slate-500">{update.rolloutStatus}</span>
                    </div>
                    <div className="mt-2 break-all font-mono text-[10.5px] text-slate-500">SHA-256 metadata: {update.firmware.sha256Metadata}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-6">
            <h3 className="m-0 mb-2 text-[15px] font-bold text-white">Temuan Analitik Perangkat</h3>
            <p className="mb-4 text-xs text-slate-500">Module 16 findings, bukan riwayat delivery notifikasi.</p>
            {technicalHistoryError ? null : !technicalHistory || technicalHistory.analyticsFindings.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada temuan pada riwayat bounded yang tersedia; ini bukan jaminan all-clear.</p>
            ) : (
              <div className="space-y-3">
                {technicalHistory.analyticsFindings.map((finding) => (
                  <div key={finding.id} className="rounded-xl border border-slate-800/70 p-4 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="iot2-badge iot2-badge--warning">{finding.severity}</span>
                      <span className="font-semibold text-slate-200">{finding.kind}</span>
                      <span className="font-mono text-slate-500">{finding.capabilityKey}</span>
                    </div>
                    <p className="mb-0 mt-2 text-slate-400">{finding.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
