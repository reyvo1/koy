'use client';

/**
 * Super Admin MQTT Center content (blueprint §1) — topic contract, ACL
 * model, dan status webhook otoritatif (probe /api/super/health).
 * Fail-closed: broker state tidak pernah dikarang.
 */

import { useCallback, useEffect, useState } from 'react';
import { RadioTower } from 'lucide-react';

interface HealthPayload {
  status?: string;
  error?: string;
}

/**
 * What the broker itself reports, as of `checkedAt`.
 *
 * `brokerReachable` is not decoration. Zero connected clients and "the broker could not be asked"
 * are different facts, and this screen already had a rule about not inventing broker state -- so the
 * flag is what keeps a broker outage from rendering as a confident zero that an operator would then
 * act on.
 */
interface MqttSnapshot {
  brokerReachable: boolean;
  brokerError: string | null;
  checkedAt: string;
  clientCount: number;
  clients: Array<{
    clientId: string;
    username: string | null;
    node: string | null;
    connectedAt: string | null;
    subscriptionCount: number;
  }>;
  nodes: Array<{ name: string; status: string }>;
  subscriptionCount: number | null;
  platformPublisherCount: number;
  platformPublisherPrefix: string;
}

// `null` until the request resolves, not a zero-filled object. A zero-filled default would render
// as a healthy broker with no clients, which is the exact confusion this screen must not create.
const UNKNOWN: MqttSnapshot | null = null;

export default function SuperMqttContent() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<MqttSnapshot | null>(UNKNOWN);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  // Why the fetch itself failed, as distinct from a broker that answered "unreachable".
  //
  // These are three different states and one message for all of them is a lie in two of the cases:
  // "not asked yet" and "the request failed" both rendered as "Belum ditanyakan", so a session
  // that had been rejected looked exactly like a screen that had simply not loaded. An operator
  // then waited, or reloaded, and neither helped.
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  /**
   * Ask the broker what is connected.
   *
   * Read-only by construction: the route exposes one GET, and this screen has no control that
   * disconnects a client or changes a topic. The refresh is here because the broker's answer goes
   * stale on its own -- a count with no way to re-read it is a snapshot of an accident.
   */
  const loadSnapshot = useCallback(async () => {
    setLoadingSnapshot(true);
    setSnapshotError(null);
    try {
      const res = await fetch('/api/super/mqtt/management', { cache: 'no-store' });
      const payload = (await res.json()) as MqttSnapshot;
      if (!res.ok) {
        // The broker may be perfectly reachable while the platform refuses to ask, and the two
        // deserve different words. Both leave the snapshot unknown, so the reason is carried
        // alongside rather than being folded into the same "not asked" message.
        const error = (payload as { error?: { message?: string } })?.error?.message;
        setSnapshot(UNKNOWN);
        setSnapshotError(error ?? `permintaan ditolak (HTTP ${res.status})`);
        return;
      }
      // A 200 with a shaped body is the only accepted result. Anything else leaves the state
      // unknown, which is rendered as "not known" rather than as a count.
      if (typeof payload?.brokerReachable !== 'boolean') {
        setSnapshot(UNKNOWN);
        setSnapshotError('respons tidak berisi state broker yang bisa dipercaya');
        return;
      }
      setSnapshot(payload);
    } catch {
      setSnapshot(UNKNOWN);
      setSnapshotError('permintaan tidak selesai; platform tidak bisa menjangkau API-nya sendiri');
    } finally {
      setLoadingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const probe = useCallback(async () => {
    try {
      const res = await fetch('/api/super/health');
      const payload = (await res.json()) as HealthPayload;
      setReady(payload.status === 'ready');
    } catch {
      setReady(false);
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  const topics = [
    ['Publish', 'tenants/<tenantId>/devices/<deviceId>/telemetry', 'Perangkat kirim data periodik'],
    ['Subscribe', 'tenants/<tenantId>/devices/<deviceId>/commands', 'Perangkat terima perintah'],
    ['Publish', 'tenants/<tenantId>/devices/<deviceId>/commands/ack', 'Perangkat konfirmasi eksekusi'],
  ];

  return (
    <div className="space-y-5">
      {/* Live evidence from the broker itself.
          Ordering is the point: reachability first, counts second. A count rendered above a
          "cannot reach the broker" banner reads as a finding, and an operator acting on a confident
          zero during a broker outage is how a healthy broker gets restarted for no reason. */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="text-[15px] font-bold text-white">Bukti langsung dari broker</div>
            <div className="text-[12.5px] text-slate-400">
              {snapshotError
                ? // A failed request and a reachable broker that reports nothing are different
                  // facts, and the earlier version rendered both as "not asked yet".
                  `Evidence tidak dapat diambil: ${snapshotError}. Broker mungkin sehat — yang gagal adalah permintaan dari konsol.`
                : snapshot === null
                ? 'Belum ditanyakan.'
                : snapshot.brokerReachable
                  ? // Stated as a fact about time, because a count with no timestamp cannot be
                    // correlated with a device that went quiet -- that is the comparison an
                    // operator actually makes.
                    `Diperiksa pada ${new Date(snapshot.checkedAt).toLocaleString('id-ID')}. Read-only: layar ini tidak bisa memutus koneksi atau mengubah topik.`
                  : `Broker tidak dapat dijangkau (${snapshot.brokerError ?? 'alasan tidak diketahui'}). Jumlah klien di bawah tidak berarti apa-apa. Diperiksa pada ${new Date(snapshot.checkedAt).toLocaleString('id-ID')}.`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loadingSnapshot}
            className="ml-auto rounded-xl border border-teal-500/40 bg-teal-500/10 px-4 py-2 text-[12.5px] font-bold text-teal-300 disabled:opacity-40"
          >
            {loadingSnapshot ? 'Memeriksa…' : 'Periksa broker'}
          </button>
        </div>

        {snapshot !== null && snapshot.brokerReachable ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <dt className="text-[11px] text-slate-500">Klien terhubung</dt>
                <dd className="text-[18px] font-bold text-white">{snapshot.clientCount}</dd>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <dt className="text-[11px] text-slate-500">Subscription</dt>
                <dd className="text-[18px] font-bold text-white">
                  {snapshot.subscriptionCount ?? '—'}
                </dd>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <dt className="text-[11px] text-slate-500">Node</dt>
                <dd className="text-[18px] font-bold text-white">{snapshot.nodes.length}</dd>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                <dt className="text-[11px] text-slate-500">Publisher platform</dt>
                {/* The basis travels with the number: a count of platform clients with no stated
                    prefix is a number nobody can check. */}
                <dd
                  className="text-[18px] font-bold text-teal-300"
                  title={`prefix: ${snapshot.platformPublisherPrefix}`}
                >
                  {snapshot.platformPublisherCount}
                </dd>
              </div>
            </dl>

            {snapshot.clients.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {snapshot.clients.map((client) => (
                  <li
                    key={`${client.clientId}-${client.connectedAt}`}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
                  >
                    <span className="text-[12px] font-semibold text-slate-200">
                      {client.clientId}
                    </span>
                    {client.username ? (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10.5px] text-slate-400">
                        {client.username}
                      </span>
                    ) : null}
                    <span className="text-[10.5px] text-slate-500">
                      {client.connectedAt
                        ? `terhubung ${new Date(client.connectedAt).toLocaleString('id-ID')}`
                        : // Stated rather than blank: a client row with no connect time is worth
                          // noticing, and an empty cell reads as "not checked".
                          'waktu koneksi tidak dilaporkan'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11.5px] text-slate-500">
                Broker menjawab: tidak ada klien yang terhubung.
              </p>
            )}
          </>
        ) : null}
      </div>

      {/* Broker status */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
        <RadioTower className="h-9 w-9 shrink-0 text-teal-300" strokeWidth={1.7} />
        <div>
          <div className="text-[15px] font-bold text-white">
            Broker MQTT — Webhook Otoritatif
          </div>
          <div className="text-[12.5px] text-slate-400">
            Autentikasi device &amp; ACL divalidasi backend via
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-teal-300">
              POST /mqtt/auth
            </code>
            ; telemetry di-ingest terpisah melalui
            <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-teal-300">
              POST /mqtt/webhook/telemetry
            </code>
          </div>
        </div>
        <span
          className={`ml-auto rounded-full px-3.5 py-1.5 text-[11.5px] font-bold ${
            ready === null
              ? 'bg-slate-700/50 text-slate-400'
              : ready
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-red-500/10 text-red-400'
          }`}
        >
          {ready === null ? 'CHECKING…' : ready ? 'BACKEND READY' : 'BACKEND DOWN'}
        </span>
      </div>

      {/* Topic contract */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
        <h2 className="m-0 mb-3 text-[15px] font-bold text-white">
          Kontrak Topik
        </h2>
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500">
              <th className="pb-2">Arah</th>
              <th className="pb-2">Pola Topik</th>
              <th className="pb-2">Fungsi</th>
            </tr>
          </thead>
          <tbody>
            {topics.map(([direction, pattern, purpose]) => (
              <tr key={pattern} className="border-t border-slate-800/60">
                <td className="py-2.5 font-bold text-teal-300">{direction}</td>
                <td className="py-2.5">
                  <code className="rounded bg-slate-900 px-2 py-0.5 text-[11.5px] text-slate-300">
                    {pattern}
                  </code>
                </td>
                <td className="py-2.5 text-slate-400">{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ACL model */}
      <div className="rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
        <h2 className="m-0 mb-3 text-[15px] font-bold text-white">
          Model ACL
        </h2>
        <ul className="m-0 list-disc space-y-1.5 pl-5 text-[13px] text-slate-400">
          <li>Setiap device hanya boleh publish/subscribe pada topik tenant-nya sendiri.</li>
          <li>Kredensial device diverifikasi webhook backend sebelum connect diizinkan.</li>
          <li>Telemetry masuk melalui webhook — broker tidak pernah menulis DB langsung.</li>
        </ul>
      </div>
    </div>
  );
}
