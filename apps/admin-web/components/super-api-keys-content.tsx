'use client';

/**
 * Super Admin API Keys — full lifecycle: create (plaintext shown once),
 * list across tenants, revoke. Backend /admin/platform-api-keys.
 */

import { useCallback, useEffect, useState } from 'react';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  scopes?: string[];
  tenantName: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface TenantOption {
  id: string;
  name: string;
}

const SCOPES = [
  { key: 'TELEMETRY_READ', label: 'Telemetri (baca)' },
  { key: 'DEVICE_CONTROL', label: 'Kendali perangkat' },
  { key: 'SCENE_EXECUTE', label: 'Jalankan scene' },
  { key: 'ANALYTICS_READ', label: 'Analitik (baca)' },
];

const inputClass =
  'w-full rounded-xl border border-slate-700/70 bg-slate-900/60 px-3.5 py-2.5 text-[13.5px] text-slate-200 outline-none placeholder:text-slate-500 focus:border-teal-500';

export default function SuperApiKeysContent() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ name: string; plaintext: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/super/api-keys')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: { items?: ApiKeyRow[] }) =>
        setKeys(Array.isArray(data.items) ? data.items : []),
      )
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'gagal memuat API key');
      });
  }, []);

  useEffect(() => {
    load();
    setTenantError(null);
    fetch('/api/super/tenants')
      .then(async (res) => {
        if (!res.ok) throw new Error(`backend ${res.status}`);
        return res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); });
      })
      .then((data: { items?: TenantOption[] }) =>
        setTenants(Array.isArray(data.items) ? data.items : []),
      )
      .catch((cause: unknown) => {
        setTenantError(cause instanceof Error ? cause.message : 'gagal memuat tenant');
      });
  }, [load]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('create');
    setFormError(null);
    setOperationError(null);
    setIssued(null);
    const form = new FormData(event.currentTarget);
    const scopes = SCOPES.map((s) => s.key).filter((k) => form.get(`scope-${k}`));
    try {
      const res = await fetch('/api/super/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId: form.get('tenantId'),
          name: String(form.get('name') ?? '').trim(),
          scopes,
        }),
      });
      const body = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as {
        plaintext?: string;
        error?: { message?: string };
      };
      if (!res.ok || !body.plaintext) {
        throw new Error(body.error?.message ?? 'Gagal membuat API key');
      }
      setIssued({ name: String(form.get('name') ?? ''), plaintext: body.plaintext });
      setCopied(false);
      event.currentTarget.reset();
      load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat API key');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (keyId: string) => {
    setBusy(`revoke-${keyId}`);
    setOperationError(null);
    try {
      const res = await fetch(`/api/super/api-keys/${keyId}`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'Gagal mencabut key');
      load();
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'Gagal mencabut API key');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {issued ? (
        <div className="mb-6 rounded-2xl border border-teal-500/40 bg-teal-500/[.07] p-5">
          <h3 className="m-0 text-[14px] font-bold text-white">
            API Key &ldquo;{issued.name}&rdquo; dibuat
          </h3>
          <p className="mt-1 mb-3 text-[12.5px] text-slate-400">
            Secret hanya ditampilkan SEKALI ini — simpan sekarang.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 overflow-x-auto rounded-xl border border-teal-500/30 bg-slate-950/80 px-4 py-3 text-[13px] font-bold tracking-wide text-teal-300">
              {issued.plaintext}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(issued.plaintext);
                setCopied(true);
              }}
              className="rounded-xl bg-teal-500 px-5 py-2.5 text-[13px] font-bold text-white hover:brightness-110"
            >
              {copied ? 'Tersalin ✓' : 'Salin Secret'}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          Direktori API key tidak dapat dimuat: {error}.
        </div>
      ) : null}
      {operationError ? (
        <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {operationError}
        </div>
      ) : null}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_16px_rgba(20,184,166,.3)] transition-all hover:brightness-110"
        >
          {showForm ? 'Tutup' : '+ Buat API Key'}
        </button>
      </div>

      {showForm ? (
        <form
          onSubmit={onSubmit}
          className="mb-6 grid gap-4 rounded-2xl border border-slate-800/80 bg-[#0d1526] p-5 sm:grid-cols-2"
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Tenant *</span>
            <select name="tenantId" required disabled={Boolean(tenantError)} className={inputClass} defaultValue="">
              <option value="" disabled>Pilih tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-slate-400">Nama key *</span>
            <input name="name" required maxLength={120} placeholder="Integrasi dashboard" className={inputClass} />
          </label>
          <fieldset className="sm:col-span-2 m-0 border-0 p-0">
            <legend className="mb-2 text-[12px] font-semibold text-slate-400">Scope akses *</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SCOPES.map((s) => (
                <label key={s.key} className="flex items-center gap-2 text-[12.5px] text-slate-300">
                  <input type="checkbox" name={`scope-${s.key}`} value={s.key} className="h-4 w-4 accent-teal-500" defaultChecked={s.key === 'TELEMETRY_READ'} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
          {tenantError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              Direktori tenant tidak tersedia ({tenantError}). Pembuatan API key dinonaktifkan sampai data tenant berhasil dimuat.
            </p>
          ) : tenants.length === 0 ? (
            <p className="sm:col-span-2 m-0 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-300">
              Belum ada tenant yang dapat dipilih.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <button
              disabled={busy !== null || Boolean(tenantError) || tenants.length === 0}
              className="rounded-xl bg-teal-500 px-6 py-2.5 text-[13px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {busy === 'create' ? 'Membuat…' : 'Buat API Key'}
            </button>
          </div>
          {formError ? (
            <p role="alert" className="sm:col-span-2 m-0 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {keys === null ? (
        !error ? <div className="h-40 animate-pulse rounded-xl bg-slate-800/60" /> : null
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700/70 p-10 text-center">
          <p className="m-0 text-[15px] font-semibold text-slate-300">Belum ada API key</p>
          <p className="mt-2 text-[13px] text-slate-500">Buat key pertama untuk integrasi eksternal.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/70 px-5 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-slate-100">{key.name}</div>
                <code className="text-[11.5px] text-teal-300">{key.keyPrefix}…</code>
                <span className="ml-2 text-[11.5px] text-slate-500">· {key.tenantName}</span>
              </div>
              <span className="text-[11.5px] text-slate-500">
                {key.lastUsedAt
                  ? `Dipakai ${new Date(key.lastUsedAt).toLocaleDateString('id-ID')}`
                  : 'Belum pernah dipakai'}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                  key.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-red-500/10 text-red-400'
                }`}
              >
                {(key.status ?? '').toUpperCase()}
              </span>
              {key.status === 'ACTIVE' ? (
                <button
                  type="button"
                  onClick={() => void revoke(key.id)}
                  disabled={busy !== null}
                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-[12px] font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  {busy === `revoke-${key.id}` ? '…' : 'Cabut'}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
