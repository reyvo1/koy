# ADR-004: Device Location (GPS) — Additive Schema

- Status: ACCEPTED
- Tanggal: 2026-08-23

## Konteks

ROADMAP v2.0 fase 8: peta NOC butuh koordinat perangkat. Skema Device
saat ini tidak punya kolom lokasi.

## Keputusan

1. **Additive migration only** — tabel baru `device_locations`
   (deviceId unique FK, latitude, longitude, updatedAt). Tabel Device
   TIDAK diubah → zero risk ke modul existing.
2. Koordinat opsional; device tanpa lokasi tidak muncul di peta.
3. Migrasi ASCII-only sesuai aturan freeze.

## Konsekuensi

- Peta NOC menampilkan marker dari tabel ini; tanpa data = placeholder
  (fail-closed tetap terjaga).
- API baca lokasi additive; tidak ada endpoint existing yang berubah.
