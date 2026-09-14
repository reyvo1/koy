import { SurfaceCard } from '@iot-platform/design-system';
import {
  COMMAND_STATUSES,
  DEVICE_STATUSES,
  type AdminOperationalSummary,
} from '../lib/contracts';

const deviceLabels: Record<(typeof DEVICE_STATUSES)[number], string> = {
  PROVISIONING: 'Provisioning',
  PAIRED: 'Terpasang',
  ACTIVE: 'Aktif',
  INACTIVE: 'Tidak aktif',
  REVOKED: 'Dicabut',
};

const commandLabels: Record<(typeof COMMAND_STATUSES)[number], string> = {
  PENDING: 'Menunggu',
  SENT: 'Terkirim',
  ACKNOWLEDGED: 'Diakui',
  FAILED: 'Gagal',
  TIMED_OUT: 'Timeout',
};

export function OperationalSummaryDashboard({
  summary,
}: {
  summary: AdminOperationalSummary;
}) {
  return (
    <div className="iot-admin-summary-grid" aria-label="Ringkasan operasional">
      <SurfaceCard eyebrow="Perangkat" title={`${summary.devices.total} total`}>
        <StatusList
          entries={DEVICE_STATUSES.map((status) => [
            deviceLabels[status],
            summary.devices.byStatus[status],
          ])}
        />
      </SurfaceCard>

      <SurfaceCard eyebrow="Heartbeat" title="Kondisi pelaporan">
        <StatusList
          entries={[
            ['Melewati ambang stale', summary.devices.staleHeartbeat],
            ['Belum pernah melapor', summary.devices.neverReportedHeartbeat],
          ]}
        />
      </SurfaceCard>

      <SurfaceCard eyebrow="Capability" title="Akses capability">
        <StatusList
          entries={[
            ['Readable', summary.capabilities.readable],
            ['Reportable', summary.capabilities.reportable],
            ['Writable', summary.capabilities.writable],
          ]}
        />
      </SurfaceCard>

      <SurfaceCard eyebrow="Telemetry" title="Observasi terbaru">
        <p className="iot-admin-primary-value">
          {summary.telemetry.latestObservedAt
            ? formatTimestamp(summary.telemetry.latestObservedAt)
            : 'Belum ada observasi'}
        </p>
        <p>
          Timestamp berasal dari ringkasan backend dan tidak menampilkan payload
          telemetry mentah.
        </p>
      </SurfaceCard>

      <SurfaceCard eyebrow="Command" title={`${summary.commands.total} total`}>
        <StatusList
          entries={COMMAND_STATUSES.map((status) => [
            commandLabels[status],
            summary.commands.byStatus[status],
          ])}
        />
      </SurfaceCard>
    </div>
  );
}

function StatusList({ entries }: { entries: ReadonlyArray<[string, number]> }) {
  return (
    <dl className="iot-admin-status-list">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value.toLocaleString('id-ID')}</dd>
        </div>
      ))}
    </dl>
  );
}

export function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}
