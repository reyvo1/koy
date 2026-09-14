'use client';

/**
 * Super Admin MQTT Center content (blueprint §1) — topic contract, ACL
 * model, dan status webhook otoritatif (probe /api/super/health).
 * Fail-closed: broker state tidak pernah dikarang.
 */

import { useCallback, useEffect, useState } from 'react';

interface HealthPayload {
  status?: string;
  error?: string;
}

export default function SuperMqttContent() {
  const [ready, setReady] = useState<boolean | null>(null);

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
      {/* Broker status */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-800/80 bg-[#111c2e] p-5">
        <span className="text-3xl"></span>
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
