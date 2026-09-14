# ADR-005: Device Groups (Grup Perangkat) — Additive Schema

- Status: ACCEPTED (izin owner Rey via chat, sesi ini)
- Tanggal: 2026-09-01

## Konteks

UI Blueprint Enterprise §1 & §2 menuntut "Device Groups" untuk kendali
massal perangkat. Skema saat ini hanya punya pengelompokan via space
hierarchy (Modul 17) — tidak ada grup logis bebas lokasi.

## Keputusan

1. **Additive migration only** — dua tabel baru:
   - `device_groups` (id, tenantId FK restrict, name, description?, createdAt)
     + unique(tenantId, name)
   - `device_group_members` (groupId FK cascade, deviceId FK cascade,
     unique(groupId, deviceId))
   - Tabel existing TIDAK diubah — Device tidak mendapat kolom baru.
2. CRUD tenant-scoped (JWT + TenantContext + Rbac guard), mengikuti pola
   scene/schedule: hapus grup tidak menghapus perangkat.
3. Migrasi ASCII-only sesuai aturan freeze.

## Konsekuensi

- Halaman "Grup Perangkat" tenant menjadi CRUD nyata (list/tambah/hapus/
  anggota).
- Zero risk ke modul existing; tanpa data = empty state jujur.