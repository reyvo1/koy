'use client';

import { GaugeDial, GeoMap, SeriesChart, type MapLocation } from '@iot-platform/design-system';
import { TERMINAL_COMMAND_STATUSES } from '../lib/contracts';
import { useState } from 'react';
import type {
  ResolvedWidget,
  WidgetBindingData,
  WidgetData,
} from '../lib/contracts';

interface WidgetCardProps {
  resolution: ResolvedWidget;
  data: WidgetData;
  onCommandSettled?: () => void;
}

export function WidgetCard({ resolution, data, onCommandSettled }: WidgetCardProps) {
  const stateLabel = stateText(data.state);

  return (
    <article className="iot-widget" data-state={data.state.toLowerCase()}>
      <header className="iot-widget__header">
        <div>
          <p className="iot-eyebrow">{resolution.kind}</p>
          <h2>{resolution.title}</h2>
        </div>
        <span className="iot-widget__state">{stateLabel}</span>
      </header>
      {renderWidget(resolution, data, onCommandSettled)}
      <WidgetTimestamp data={data} />
    </article>
  );
}

function renderWidget(
  resolution: ResolvedWidget,
  data: WidgetData,
  onCommandSettled?: () => void,
) {
  if (resolution.kind === 'SWITCH') {
    return (
      <SwitchControl
        onCommandSettled={onCommandSettled}
        resolution={resolution}
      />
    );
  }

  if (data.state === 'ERROR' || data.state === 'INVALID') {
    return <WidgetMessage text={data.message ?? 'Data widget tidak valid.'} />;
  }

  if (data.state === 'UNSUPPORTED') {
    return <WidgetMessage text={data.message ?? 'Widget belum didukung.'} />;
  }

  if (data.state === 'EMPTY') {
    return <WidgetMessage text="Belum ada data untuk widget ini." />;
  }

  if (resolution.kind === 'MAP') {
    return (
      <GeoMap locations={data.bindings.filter((binding) => (binding.state === 'READY' || binding.state === 'STALE') && binding.data).map((binding) => binding.data as unknown as MapLocation)} />
    );
  }

  switch (resolution.kind) {
    case 'GAUGE':
      return <GaugeWidget binding={data.bindings[0]} resolution={resolution} />;
    case 'CHART':
      return <ChartWidget bindings={data.bindings} />;
    case 'TABLE':
      return <TableWidget bindings={data.bindings} />;
    case 'STATUS':
      return <StatusWidget binding={data.bindings[0]} />;
    case 'CARD':
    default:
      return <CardWidget bindings={data.bindings} />;
  }
}

function SwitchControl({
  onCommandSettled,
  resolution,
}: {
  onCommandSettled?: () => void;
  resolution: ResolvedWidget;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const binding = resolution.bindings[0];
  const capability = binding?.capability;
  const controllable =
    resolution.state === 'READY' &&
    Boolean(binding?.device?.id) &&
    capability?.dataType === 'boolean' &&
    capability.access.writable;

  if (!controllable || !binding?.device || !capability) {
    return (
      <WidgetMessage text="Kontrol tidak tersedia untuk akun atau binding ini. Tidak ada command yang dikirim." />
    );
  }

  async function send(value: boolean) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/device-command', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: binding.device!.id,
          capabilityKey: capability!.key,
          value,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { commandId?: string | null; status?: string; message?: string }
        | null;
      if (!response.ok) {
        setFeedback(payload?.message ?? 'Perintah ditolak.');
        return;
      }

      const commandId = payload?.commandId ?? null;
      if (!commandId) {
        setFeedback(
          `Perintah diterima (${payload?.status ?? 'UNKNOWN'}), tetapi identitas command tidak tersedia untuk rekonsiliasi.`,
        );
        return;
      }

      const settled = await reconcileCommand(binding.device!.id, commandId);
      setFeedback(commandFeedback(settled.status));
      if (settled.terminal) onCommandSettled?.();
    } catch {
      setFeedback('Perintah tidak dapat dikirim karena layanan tidak terhubung.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="iot-switch-control">
      <div className="iot-toolbar-actions">
        <button
          className="iot-button"
          disabled={pending}
          onClick={() => void send(true)}
          type="button"
        >
          Aktifkan
        </button>
        <button
          className="iot-button iot-button--secondary"
          disabled={pending}
          onClick={() => void send(false)}
          type="button"
        >
          Nonaktifkan
        </button>
      </div>
      <p className="iot-widget__message" aria-live="polite">
        {pending
          ? 'Mengirim command…'
          : feedback ??
            'Kontrol mengirim nilai eksplisit; UI tidak mengasumsikan status perangkat sebelum ACK/telemetry diterima.'}
      </p>
    </div>
  );
}


interface ReconciledCommand {
  status: string;
  terminal: boolean;
}


async function reconcileCommand(
  deviceId: string,
  commandId: string,
): Promise<ReconciledCommand> {
  let status = 'UNKNOWN';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0) await delay(500);
    try {
      const response = await fetch(
        `/api/device-command?deviceId=${encodeURIComponent(deviceId)}&commandId=${encodeURIComponent(commandId)}`,
        { cache: 'no-store' },
      );
      const payload = (await response.json().catch(() => null)) as
        | { status?: string }
        | null;
      if (!response.ok) break;
      status = payload?.status ?? 'UNKNOWN';
      if (TERMINAL_COMMAND_STATUSES.has(status)) {
        return { status, terminal: true };
      }
    } catch {
      break;
    }
  }

  return { status, terminal: false };
}

function commandFeedback(status: string): string {
  switch (status) {
    case 'ACKNOWLEDGED':
      return 'Perangkat mengonfirmasi command. Dashboard dimuat ulang untuk membaca telemetry/status terbaru.';
    case 'FAILED':
      return 'Perangkat melaporkan command gagal. Status perangkat tidak diubah oleh UI.';
    case 'TIMED_OUT':
      return 'Command tidak mendapat ACK sebelum batas waktu. Status aktual tetap mengikuti telemetry perangkat.';
    case 'SENT':
    case 'PENDING':
      return `Command masih ${status}. ACK belum diterima; status perangkat tidak diasumsikan berubah.`;
    default:
      return 'Status akhir command belum tersedia. Status aktual tetap mengikuti telemetry perangkat.';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function CardWidget({ bindings }: { bindings: WidgetBindingData[] }) {
  return (
    <dl className="iot-values">
      {bindings.map((binding) => (
        <div key={binding.id}>
          <dt>{binding.alias}</dt>
          <dd>{formatBindingValue(binding)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GaugeWidget({
  binding,
  resolution,
}: {
  binding: WidgetBindingData | undefined;
  resolution: ResolvedWidget;
}) {
  const value = numericValue(binding?.data?.value);
  const capability = resolution.bindings[0]?.capability;
  const min =
    numberFrom(resolution.presentation.min) ?? capability?.constraints.min ?? 0;
  const max =
    numberFrom(resolution.presentation.max) ??
    capability?.constraints.max ??
    100;

  if (value === null) {
    return <WidgetMessage text="Nilai numerik belum tersedia." />;
  }

  return (
    <GaugeDial
      ariaLabel={`Gauge ${resolution.title}`}
      max={max}
      min={min}
      precision={capability?.constraints.precision}
      unit={capability?.unit ?? null}
      value={value}
    />
  );
}

function ChartWidget({ bindings }: { bindings: WidgetBindingData[] }) {
  const series = bindings.flatMap((binding, index) => {
    const points = extractSeries(binding).flatMap((point) =>
      typeof point.value === 'number' && Number.isFinite(point.value)
        ? [{ at: point.observedAt, value: point.value }]
        : [],
    );
    return points.length > 0
      ? [{ key: binding.id, label: binding.alias, tone: CHART_TONES[index % CHART_TONES.length], points }]
      : [];
  });

  if (series.length > 0) {
    return <SeriesChart ariaLabel="Grafik data widget" height={160} series={series} />;
  }

  // Non-numeric series (strings, booleans, mixed payloads) keep the honest list instead of
  // compressing them into a graph the data does not support.
  const points = bindings.flatMap((binding) =>
    extractSeries(binding).map((point) => ({
      ...point,
      alias: binding.alias,
    })),
  );

  if (points.length === 0) {
    return <WidgetMessage text="Belum ada titik data untuk grafik." />;
  }

  return (
    <ol className="iot-series" aria-label="Data grafik terbaru">
      {points.slice(-12).map((point, index) => (
        <li key={`${point.alias}-${point.observedAt}-${index}`}>
          <span>{point.alias}</span>
          <strong>{formatUnknown(point.value)}</strong>
          <time dateTime={point.observedAt}>{formatDate(point.observedAt)}</time>
        </li>
      ))}
    </ol>
  );
}

function TableWidget({ bindings }: { bindings: WidgetBindingData[] }) {
  return (
    <div className="iot-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Nilai</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((binding) => (
            <tr key={binding.id}>
              <td>{binding.alias}</td>
              <td>{formatBindingValue(binding)}</td>
              <td>{stateText(binding.state)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusWidget({ binding }: { binding: WidgetBindingData | undefined }) {
  if (!binding) return <WidgetMessage text="Status belum tersedia." />;
  return (
    <p className="iot-status-value">
      <strong>{formatBindingValue(binding)}</strong>
    </p>
  );
}

function WidgetMessage({ text }: { text: string }) {
  return <p className="iot-widget__message">{text}</p>;
}

function WidgetTimestamp({ data }: { data: WidgetData }) {
  const observedAt = data.bindings.find((binding) => binding.observedAt)?.observedAt;
  const value = observedAt ?? data.generatedAt;
  return (
    <footer className="iot-widget__footer">
      Diperbarui <time dateTime={value}>{formatDate(value)}</time>
    </footer>
  );
}

function formatBindingValue(binding: WidgetBindingData): string {
  if (!binding.data) return stateText(binding.state);
  if ('value' in binding.data) return formatUnknown(binding.data.value);
  if ('status' in binding.data) return formatUnknown(binding.data.status);
  const series = extractSeries(binding);
  return series.length > 0
    ? formatUnknown(series[series.length - 1]?.value)
    : stateText(binding.state);
}

const CHART_TONES = ['accent', 'info', 'warning', 'danger', 'success'] as const;

function extractSeries(binding: WidgetBindingData) {
  const candidates = binding.data?.points ?? binding.data?.buckets;
  if (!Array.isArray(candidates)) return [];

  return candidates.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const row = candidate as Record<string, unknown>;
    const observedAt = row.observedAt ?? row.end ?? row.start;
    const value = row.value ?? row.avg ?? row.average ?? row.max ?? row.min;
    return typeof observedAt === 'string' && value !== undefined
      ? [{ observedAt, value }]
      : [];
  });
}

function numericValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function numberFrom(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatNumber(value: number, precision = 2): string {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: precision,
  }).format(value);
}

function formatUnknown(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'Aktif' : 'Nonaktif';
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'Tidak tersedia';
  return 'Data tersedia';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'waktu tidak diketahui'
    : new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date);
}

function stateText(state: string): string {
  const labels: Record<string, string> = {
    READY: 'Siap',
    EMPTY: 'Kosong',
    STALE: 'Perlu diperbarui',
    INVALID: 'Tidak valid',
    UNSUPPORTED: 'Belum didukung',
    ERROR: 'Gangguan',
  };
  return labels[state] ?? state;
}
