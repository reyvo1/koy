'use client';
import { FormEvent, useEffect, useState } from 'react';
import type { UserProfile } from '../lib/contracts';

export function ProfileExperience() {
  const [profile, setProfile] = useState<UserProfile | null>(null); const [name, setName] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch('/api/profile').then(async (r) => { const p = await r.json(); if (!r.ok) throw new Error(p.message ?? 'Profil gagal dimuat'); setProfile(p); setName(p.name ?? ''); }).catch((e) => setMessage(e instanceof Error ? e.message : 'Profil gagal dimuat')); }, []);
  async function submit(e: FormEvent) { e.preventDefault(); setSaving(true); setMessage(''); try { const r = await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }); const p = await r.json(); if (!r.ok) throw new Error(p.message ?? 'Profil gagal disimpan'); setProfile((current) => current ? { ...current, name: p.name ?? current.name } : current); setName(p.name ?? name); setMessage('Profil berhasil disimpan.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Profil gagal disimpan'); } finally { setSaving(false); } }
  if (!profile) return <p className="text-sm text-slate-500">{message || 'Memuat profil…'}</p>;
  return <form onSubmit={submit} className="max-w-xl rounded-xl border border-slate-200 bg-white p-5"><label className="block text-sm font-bold text-slate-700">Nama<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><p className="mt-4 text-sm text-slate-600">Email: <strong>{profile.email}</strong></p><p className="mt-1 text-sm text-slate-600">Status verifikasi: <strong>{profile.isVerified ? 'Terverifikasi' : 'Belum terverifikasi'}</strong></p><button disabled={saving || !name.trim()} className="mt-5 rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Menyimpan…' : 'Simpan profil'}</button>{message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}</form>;
}
