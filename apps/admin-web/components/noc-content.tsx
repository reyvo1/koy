'use client';

/**
 * NOC / Control Room (blueprint §4) — global tiles from live operational
 * summary + readiness probe + realtime telemetry stream (SSE) + command
 * queue context. Fail-closed.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CircleSlash,
  RadioTower,
  Server,
  Zap,
  Plug,
  Timer,
  Bell,
} from 'lucide-react';
import { NocLocationMap } from './noc-location-map';
import { CountUp, shadow } from '@/components/ui-polish';
import { QuarantineBanner } from '@/components/quarantine-banner';

interface Summary {
  generatedAt?: string;
  devices?: {
    total?: number;
    byStatus?: Record<string, number>;
    staleHeartbeat?: number;
  };
  commands?: { total?: number };
  capabilities?: { readable?: number; writable?: number };
}

interface StreamEvent {
  id: number;
  text: string;
}

/**
 * One row of the duty log: who acknowledged a finding, and when.
 *
 * `resolvedAt` is separate from `acknowledgedAt` on purpose. Acknowledging means "I have looked";
 * resolving means "this is fixed". Collapsing them would let a first responder close an incident by
 * acknowledging it, and the next responder would have no way to tell.
 */
interface NocAcknowledgement {
  findingId: string;
  actorMembershipId: string;
  acknowledgedAt: string;
  note: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * What the acknowledge and resolve routes actually answer with.
 *
 * The row is *enveloped*: `{ acknowledgement: {...}, alreadyAcknowledged: bool }`. The two verb
 * callbacks below read `.acknowledgement` and store that, because the previous version stored the
 * envelope itself — which typechecked once it was cast to `NocAcknowledgement` and rendered
 * `undefined` for the actor and the timestamp. A duty log that displays "oleh undefined" is the
 * exact failure this interface exists to prevent, and only the browser could have shown it.
 */
interface NocActionResponse {
  acknowledgement: NocAcknowledgement;
  alreadyAcknowledged?: boolean;
  alreadyResolved?: boolean;
  message?: string;
}

export default function NocContent() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [findings, setFindings] = useState<Array<{ id: string; severity?: string; summary?: string; title?: string; tenantId?: string; tenantName?: string }>>([]);
  const [findingsError, setFindingsError] = useState<string | null>(null);
  /**
   * Which findings have been acknowledged, and by whom.
   *
   * Kept as a map rather than a boolean on each finding so the console can show the *actor* and the
   * time. A checkbox that only remembers "checked" throws away the only thing an on-call record is
   * for: which human was looking when the alert fired.
   */
  const [acks, setAcks] = useState<Record<string, NocAcknowledgement>>({});
  const [ackBusy, setAckBusy] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    try {
      const res = await fetch('/api/super/health');
      setReady((await res.json()).status === 'ready');
    } catch {
      setReady(false);
    }
  }, []);

  /**
   * Analytics findings — the real alert source on this platform.
   *
   * The tile this replaced was labelled "Alerts Active" but was fed by the length of the
   * telemetry SSE frame buffer, so it counted incoming readings, not alerts: a noisy
   * device drove the number up and a platform with zero problems still showed a count.
   * A count the operator cannot act on is worse than no tile.
   */
  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch('/api/super/findings?limit=100');
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json()) as
        | Array<{ id: string; tenantId?: string }>
        | { items?: Array<{ id: string; tenantId?: string }> };
      const items = Array.isArray(data) ? data : (data.items ?? []);
      setFindings(items);
      setFindingsError(null);
      return items;
    } catch (cause) {
      setFindings([]);
      setFindingsError(
        cause instanceof Error ? cause.message : 'gagal memuat temuan',
      );
      return [];
    }
  }, []);

  /**
   * Load the duty log for every tenant the findings came from, so an acknowledged finding is
   * visibly acknowledged rather than silently missing from the list. The two are fetched together
   * and merged by `findingId`: a finding is never hidden for having been acknowledged, because the
   * next shift needs to see that someone already looked.
   *
   * One request per distinct tenant rather than one for the operator's own. The backend resolves
   * the log inside the tenant named, and the console lists findings across all of them — asking
   * once with no tenant returned the platform tenant's log, which is empty, so every acknowledged
   * finding came back looking unacknowledged.
   */
  const loadAcks = useCallback(async (tenants: string[]) => {
    try {
      const unique = [...new Set(tenants.filter((id) => typeof id === 'string' && id))];
      if (unique.length === 0) {
        setAcks({});
        return;
      }
      const responses = await Promise.all(
        unique.map((tenantId) =>
          fetch(`/api/super/noc/acknowledgements?tenantId=${encodeURIComponent(tenantId)}`),
        ),
      );
      const next: Record<string, NocAcknowledgement> = {};
      for (const res of responses) {
        // One read per response: calling `res.json()` twice throws "Body is unusable" and takes the
        // whole load down with it.
        if (!res.ok) throw new Error(`backend ${res.status}`);
        const data = (await res.json()) as { items?: NocAcknowledgement[] };
        for (const item of data.items ?? []) next[item.findingId] = item;
      }
      setAcks(next);
    } catch (cause) {
      // Non-fatal on purpose: the findings themselves are still valid without a duty log, and
      // blanking the alert list because an auxiliary fetch failed would be the worse failure.
      setAckError(cause instanceof Error ? cause.message : 'gagal memuat catatan tugas');
    }
  }, []);

  // Findings first, then the duty log for the tenants those findings belong to. Sequential rather
  // than parallel because the second request's tenant list is the first request's answer — firing
  // them together is what made the log load a request for the wrong tenant.
  useEffect(() => {
    let cancelled = false;
    void loadFindings().then((items) => {
      if (cancelled) return;
      return loadAcks(items.map((item) => item.tenantId ?? ''));
    });
    return () => {
      cancelled = true;
    };
  }, [loadFindings, loadAcks]);

  /**
   * Acknowledge one finding.
   *
   * The acknowledged row stays in the list with its actor and time. There is no bulk "acknowledge
   * all" and no dismiss: a shift handover is a list of what each person took, and a single button
   * that clears every badge destroys exactly that.
   */
  const acknowledge = useCallback(
    async (findingId: string, tenantId: string) => {
      setAckBusy(findingId);
      setAckError(null);
      try {
        const res = await fetch(
          `/api/super/noc/findings/${encodeURIComponent(findingId)}/acknowledge?tenantId=${encodeURIComponent(tenantId)}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tenantId }),
          },
        );
        const data = (await res.json()) as NocActionResponse;
        if (!res.ok) throw new Error(data.message ?? `backend ${res.status}`);
        setAcks((prev) => ({ ...prev, [findingId]: data.acknowledgement }));
      } catch (cause) {
        setAckError(cause instanceof Error ? cause.message : 'gagal memberi tahu');
      } finally {
        setAckBusy(null);
      }
    },
    [],
  );

  /**
   * Close one incident.
   *
   * Only offered for a finding that has already been acknowledged, and the backend refuses it
   * otherwise. The ordering is a control rather than a convenience: "resolved" reachable without
   * anyone having been on duty would make the acknowledgement record decorative.
   *
   * The row stays in the list when resolved, marked "selesai" rather than removed — a resolved
   * incident is what the next shift most needs to read.
   */
  const resolveIncident = useCallback(async (findingId: string, tenantId: string) => {
    setAckBusy(findingId);
    setAckError(null);
    try {
      const res = await fetch(
        `/api/super/noc/findings/${encodeURIComponent(findingId)}/resolve?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      const data = (await res.json()) as NocActionResponse;
      if (!res.ok) throw new Error(data.message ?? `backend ${res.status}`);
      setAcks((prev) => ({ ...prev, [findingId]: data.acknowledgement }));
    } catch (cause) {
      setAckError(cause instanceof Error ? cause.message : 'gagal menutup insiden');
    } finally {
      setAckBusy(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/operational-summary')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json();
      })
      .then((data: Summary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    void probe();
    const timer = setInterval(() => void probe(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [probe]);

  // Live telemetry stream — first device with numeric capability.
  useEffect(() => {
    let source: EventSource | null = null;
    fetch('/api/admin/devices')
      .then(async (res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        const items = Array.isArray(data)
          ? data
          : ((data as { items?: Array<{ id: string }> }).items ?? []);
        const deviceId = items[0]?.id;
        if (!deviceId) return;
        source = new EventSource(`/api/admin/telemetry-stream?deviceId=${deviceId}`);
        source.addEventListener('telemetry', (event) => {
          try {
            const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
            setEvents((prev) =>
              [
                {
                  id: Date.now(),
                  text:
                    `${new Date().toLocaleTimeString('id-ID')} · ` +
                    Object.entries(payload)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${String(v)}`)
                      .join(' '),
                },
                ...prev,
              ].slice(0, 20),
            );
          } catch {
            /* ignore malformed frame */
          }
        });
      })
      .catch(() => {
        /* fail-closed: stream stays empty */
      });
    return () => {
      source?.close();
    };
  }, []);

  const byStatus = summary?.devices?.byStatus ?? {};
  const online = byStatus.ONLINE ?? byStatus.ACTIVE ?? 0;
  const total = summary?.devices?.total ?? 0;
  const offline = Math.max(total - online - (summary?.devices?.staleHeartbeat ?? 0), 0);

  const tiles: Array<[string, string, typeof Activity]> = [
    ['Devices Online', String(online), Activity],
    ['Devices Offline', String(offline), CircleSlash],
    ['Total Perangkat', String(total), RadioTower],
    ['Backend Ready', ready === null ? '…' : ready ? 'YA' : 'TIDAK', Server],
    ['Perintah Terkirim', String(summary?.commands?.total ?? 0), Zap],
    ['Capability Readable', String(summary?.capabilities?.readable ?? 0), Plug],
    ['Heartbeat Stale', String(summary?.devices?.staleHeartbeat ?? 0), Timer],
    [
      'Temuan Aktif',
      findingsError ? '—' : String(findings.length),
      Bell,
    ],
  ];

  return (
    <div className="space-y-5">
      <QuarantineBanner
        works={[
          'Readiness probe nyata dari /health/ready (PostgreSQL, Redis, MQTT).',
          'Ringkasan operasional platform dan direktori perangkat lintas tenant.',
          'Temuan analitik persisten yang benar-benar tersimpan.',
          'Satu stream telemetri SSE untuk perangkat berkemampuan numerik pertama.',
        ]}
        doesNotWork={[
          'Peta koordinat memakai GPS tersimpan dan tidak menebak lokasi dari tipe perangkat.',
          'Lokasi lintas tenant hanya dapat dibaca oleh PLATFORM_ADMIN; perangkat tanpa GPS tidak diberi marker.',
        ]}
      />
      <NocLocationMap />
      {/* Global tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(([label, value, Icon]) => (
          <div
            key={label}
            className={`rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-teal-500/30 ${shadow.card} ${shadow.cardHover}`}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/10">
              <Icon className="h-4.5 w-4.5 text-teal-300" strokeWidth={1.8} />
            </span>
            <div className="mt-3 text-[12px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
            <div className="text-[26px] font-extrabold tabular-nums text-white">
              {/^\d+$/.test(value) ? <CountUp value={parseInt(value, 10)} /> : value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Findings — replaces a permanent "World Map" placeholder that showed no data.
            The map stays unwritten rather than faked: there is no device-location
            contract to plot, so a decorative map would be an invention. */}
        <div className="iot2-panel on-dark rounded-2xl border-slate-800/80 bg-[#111c2e] p-5">
          <h3 className="m-0 mb-2 text-[15px] font-bold text-white">
            Temuan Analitik
          </h3>
          <div className="h-[220px] overflow-y-auto rounded-xl border border-slate-800/70 p-3">
            {findingsError ? (
              <p className="m-0 text-[12px] text-amber-300/80">
                Temuan tidak dapat dimuat ({findingsError}). Ini bukan berarti tidak ada
                temuan.
              </p>
            ) : findings.length === 0 ? (
              <p className="m-0 text-slate-500">
                Tidak ada temuan dari engine analytics saat ini.
              </p>
            ) : (
              <>
                {ackError ? (
                  <p className="mb-2 m-0 text-[11px] text-amber-300/80">
                    Catatan tugas tidak dapat dimuat atau disimpan ({ackError}).
                  </p>
                ) : null}
                <ul className="m-0 list-none space-y-1.5 p-0 text-[12px]">
                  {findings.slice(0, 20).map((finding) => {
                    // The acknowledged finding stays in the list. Removing it would be the tidier
                    // interface and the worse one: the operator taking over the next shift has no
                    // other way to learn that someone already looked at this.
                    const ack = acks[finding.id];
                    const resolved = Boolean(ack?.resolvedAt);
                    return (
                      <li
                        key={finding.id}
                        className={`flex items-start gap-2 ${
                          ack ? 'text-slate-500' : 'text-slate-300'
                        }`}
                      >
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                            resolved ? 'bg-emerald-400' : ack ? 'bg-sky-400' : 'bg-amber-400'
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          {finding.summary ?? finding.title ?? finding.id.slice(0, 8)}
                          {ack ? (
                            <span className="ml-1.5 text-[11px] text-sky-300/90">
                              {resolved ? 'selesai' : 'sudah diketahui'} oleh{' '}
                              {ack.actorMembershipId.slice(0, 8)} pada{' '}
                              {new Date(ack.acknowledgedAt).toLocaleString('id-ID')}
                            </span>
                          ) : null}
                        </span>
                        {ack ? (
                          !resolved ? (
                            // Resolve sits behind the acknowledgement, never beside it. Offering
                            // "Tutup" on a finding nobody has looked at would be a control the
                            // backend refuses, which teaches the operator the console is broken.
                            <button
                              type="button"
                              onClick={() => void resolveIncident(finding.id, finding.tenantId ?? '')}
                              disabled={ackBusy === finding.id}
                              className="shrink-0 rounded-md border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                            >
                              {ackBusy === finding.id ? 'menyimpan…' : 'Tutup insiden'}
                            </button>
                          ) : null
                        ) : (
                          <button
                            type="button"
                            onClick={() => void acknowledge(finding.id, finding.tenantId ?? '')}
                            disabled={ackBusy === finding.id}
                            className="shrink-0 rounded-md border border-teal-500/40 px-2 py-0.5 text-[11px] text-teal-300 transition-colors hover:bg-teal-500/10 disabled:opacity-50"
                          >
                            {ackBusy === finding.id ? 'menyimpan…' : 'Beri tahu'}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Live telemetry stream */}
        <div className="iot2-panel on-dark rounded-2xl border-slate-800/80 bg-[#111c2e] p-5">
          <h3 className="m-0 mb-2 flex items-center gap-2 text-[15px] font-bold text-white">
            Live Telemetry Stream
            <span
              className={`h-2 w-2 rounded-full ${events.length > 0 ? 'animate-pulse bg-emerald-400' : 'bg-slate-600'}`}
            />
          </h3>
          <div className="h-[220px] overflow-y-auto rounded-xl border border-dashed border-slate-700/70 p-3">
            {events.length === 0 ? (
              <span className="text-slate-500">
                Menunggu event telemetry…
              </span>
            ) : (
              <ul className="m-0 list-none space-y-1.5 p-0 font-mono text-[11.5px] text-teal-300">
                {events.map((event) => (
                  <li key={event.id}>{event.text}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
