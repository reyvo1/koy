'use client';

/**
 * API Key — kunci publik untuk integrasi tenant.
 *
 * Backend sudah punya `POST /admin/api-keys` dan `DELETE /admin/api-keys/:id` untuk
 * tenant, tapi tidak ada `GET`, jadi tenant admin tidak pernah bisa melihat key-nya
 * sendiri: ia membuat key, melihat plaintext sekali, lalu kehilangan jejaknya. Halaman
 * ini menutup loop itu.
 *
 * Scope ditampilkan apa adanya (READ / CONTROL / EXECUTE) karena inilah yang membatasi
 *Integrasi — key dengan scope salah adalah lubang yang tidak terlihat sampai kejadian.
 */

import { useCallback, useEffect, useState } from 'react';
import { TenantShell } from '@/components/tenant-shell';
import { EmptyState, FadeIn, SkeletonCard } from '@/components/ui-polish';
import {
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix?: string | null;
  status: string;
  scopes?: string[];
  lastUsedAt?: string | null;
  createdAt: string;
}

const SCOPE_OPTIONS = [
  { value: 'TELEMETRY_READ', label: 'Baca telemetri' },
  { value: 'DEVICE_CONTROL', label: 'Kontrol perangkat' },
  { value: 'SCENE_EXECUTE', label: 'Eksekusi scene' },
  { value: 'ANALYTICS_READ', label: 'Baca analitik' },
] as const;

export default function TenantApiKeysPage() {
  const [rows, setRows] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['TELEMETRY_READ']);
  const [formError, setFormError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/tenant/api-keys', { cache: 'no-store' });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const data = (await res.json().catch(() => { throw new Error('Backend mengembalikan respons yang tidak dapat dibaca.'); })) as { items?: ApiKeyRow[] } | ApiKeyRow[];
      setRows(Array.isArray(data) ? data : (data.items ?? []));
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'gagal memuat API key');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError('Nama key wajib diisi.');
      return;
    }
    if (scopes.length === 0) {
      setFormError('Pilih minimal satu scope.');
      return;
    }
    setBusy('create');
    try {
      const res = await fetch('/api/tenant/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const payload = (await res.json().catch(() => null)) as {
        // `plaintext` is the field PublicApiService.createApiKey returns. Checked
        // defensively against the other common namings so a rename upstream cannot
        // silently render "null" in the one-time secret box.
        plaintext?: string;
        plaintextKey?: string;
        secret?: string;
        message?: string;
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        throw new Error(
          payload?.message ?? payload?.error?.message ?? `backend ${res.status}`,
        );
      }
      // The backend shows the secret exactly once; keeping it on screen until dismissed
      // is the only chance the operator has to store it.
      const secret = payload?.plaintext ?? payload?.plaintextKey ?? payload?.secret;
      if (!secret) {
        // The key was created, but we cannot show its secret. Say so rather than
        // pretending the flow worked — the operator would otherwise store nothing and
        // only discover it when the key 401s.
        setFormError(
          'Key dibuat, tetapi nilai penuh tidak dikembalikan backend. Cabut key ini dan buat ulang.',
        );
      }
      setPlaintext(secret ?? null);
      setName('');
      setScopes(['TELEMETRY_READ']);
      setShowCreate(false);
      await load();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal membuat API key');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (id: string, keyName: string) => {
    setBusy(`revoke-${id}`);
    try {
      const res = await fetch(`/api/tenant/api-keys/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      await load();
    } catch (cause) {
      setError(
        `Gagal mencabut "${keyName}": ${
          cause instanceof Error ? cause.message : 'tidak diketahui'
        }`,
      );
    } finally {
      setBusy(null);
    }
  };

  const toggleScope = (scope: string) => {
    setScopes((current) =>
      current.includes(scope)
        ? current.filter((s) => s !== scope)
        : [...current, scope],
    );
  };

  return (
    <TenantShell
      title="API Key"
      subtitle="Kunci publik untuk integrasi eksternal tenant"
      active="/tenant/api-keys"
    >
      {plaintext ? (
        <div className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/[.07] p-5">
          <div className="flex items-center gap-2 text-[14px] font-bold text-emerald-300">
            <Check className="h-4 w-4" strokeWidth={2.4} />
            Key dibuat — simpan sekarang
          </div>
          <p className="mb-3 mt-1.5 text-[12.5px] text-emerald-200/80">
            Nilai penuh ditampilkan satu kali saja dan tidak dapat diambil lagi.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg border border-emerald-500/25 bg-black/30 px-3 py-2 font-mono text-[12px] text-emerald-200">
              {plaintext}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plaintext);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard permission can be denied; the value stays selectable.
                }
              }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-[12.5px] font-semibold text-emerald-200 hover:bg-emerald-500/10"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
              ) : (
                <Copy className="h-3.5 w-3.5" strokeWidth={2.1} />
              )}
              {copied ? 'Tersalin' : 'Salin'}
            </button>
            <button
              type="button"
              onClick={() => setPlaintext(null)}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-[12.5px] font-semibold text-slate-300 hover:border-slate-500"
            >
              Tutup
            </button>
          </div>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setFormError(null);
          }}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 px-4 py-2 text-[13px] font-bold text-slate-950 transition-all hover:-translate-y-0.5 hover:brightness-110"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Buat API Key
        </button>
      </div>

      {showCreate ? (
        <div className="iot2-panel mb-5">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-slate-400">
            Nama key
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            placeholder="contoh: Integrasi Dashboard PIS"
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-[13.5px] text-slate-100 outline-none focus:border-teal-400"
          />

          <fieldset className="mt-4">
            <legend className="mb-2 text-[12.5px] font-semibold text-slate-400">
              Scope akses
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SCOPE_OPTIONS.map((scope) => (
                <label
                  key={scope.value}
                  className="flex items-center gap-2.5 rounded-lg border border-slate-700/70 px-3 py-2 text-[12.5px] text-slate-300"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    className="h-4 w-4 accent-teal-400"
                  />
                  {scope.label}
                </label>
              ))}
            </div>
          </fieldset>

          {formError ? (
            <p role="alert" className="mb-0 mt-2 text-[12px] text-red-300">
              {formError}
            </p>
          ) : null}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy === 'create'}
              className="rounded-lg bg-teal-400 px-4 py-2 text-[13px] font-bold text-slate-950 transition-colors hover:bg-teal-300 disabled:opacity-50"
            >
              {busy === 'create' ? 'Membuat…' : 'Buat Key'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setFormError(null);
              }}
              className="text-[12.5px] font-medium text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[.06] px-4 py-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <span className="text-[13px] text-red-200">{error}</span>
        </div>
      ) : null}

      {rows === null ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Belum ada API key"
          description="Buat key untuk menghubungkan sistem Anda ke API publik platform. Setiap key punya scope sendiri — beri hanya scope yang benar-benar dibutuhkan."
        />
      ) : (
        <FadeIn>
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div
                key={row.id}
                className="iot2-panel flex flex-wrap items-center gap-4"
                style={{ padding: '16px 20px' }}
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-500/15">
                  <KeyRound className="h-5 w-5 text-teal-300" strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-bold text-slate-100">
                    {row.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {row.keyPrefix ? `${row.keyPrefix}…` : '—'} ·{' '}
                    {row.scopes?.join(', ') || 'tanpa scope'}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-slate-500">
                    Dibuat {new Date(row.createdAt).toLocaleDateString('id-ID')}
                    {row.lastUsedAt
                      ? ` · dipakai terakhir ${new Date(row.lastUsedAt).toLocaleString('id-ID')}`
                      : ' · belum pernah dipakai'}
                  </div>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                    row.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/25'
                      : row.status === 'REVOKED'
                        ? 'bg-red-500/10 text-red-400 ring-red-500/25'
                        : 'bg-slate-500/10 text-slate-400 ring-slate-400/20'
                  }`}
                >
                  {row.status}
                </span>
                {row.status !== 'REVOKED' ? (
                  <button
                    type="button"
                    onClick={() => void revoke(row.id, row.name)}
                    disabled={busy !== null}
                    aria-label={`Cabut ${row.name}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-500/30 text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {busy === `revoke-${row.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </FadeIn>
      )}
    </TenantShell>
  );
}
