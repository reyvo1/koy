# IOT SESSION CHECKPOINT (2026-09-01) — TRIGGER: ketik "lanjut iot"

## Status
- ARCHITECTURE FREEZE v1.0 aktif: docs/phoenix/ (governance + handbook + ROADMAP-v2.0.md + ADR-001..005)
- HEAD 7ebe0ec (pushed), Jest 172 suite/1118 test, lint:check 0 masalah, build + web:build lolos
- ADR-005 device groups SELESAI: schema+migration 20260901100000, DeviceGroupController,
  proxy /api/tenant/device-groups (UI grup menyusul bila diminta)
- Modul 14 automation rule CRUD SELESAI: AutomationController (/automations),
  UI tenant-automation-content CRUD nyata (rule dibuat NONAKTIF), proxy /api/tenant/automations,
  contract spec G1.4 disesuaikan
- Semua UI enterprise selesai (super admin, tenant, user-web terpisah, mobile Expo asli,
  CCTV, NOC, AI Center, Technician /technician, login premium)
- SSE realtime ADR-002; payment sandbox fail-closed ADR-003; GPS additive ADR-004 applied

## Demo / akses
- Tenant ID: 11111111-1111-4111-8111-111111111111
- admin@demo.id / Demo12345!
- Server lokal: backend :3000, admin-web :3100
- GOTCHA: Toko360 suka rebut port 3000 -> kill node IoT dulu lalu restart
- GOTCHA: prisma generate EPERM = kill semua node IoT dulu
- GOTCHA: SSE stream spec wajib take(1) + --forceExit lokal

## PENDING butuh Rey (tidak bisa agent kerjakan)
1. VPS sewa -> Production Deployment Gate -> UAT -> approve AUTOMATION_RUNTIME_ENABLED
2. Akun Midtrans/Xendit produksi -> ganti sandbox adapter ke real key
3. Board ESP32 -> test firmware fisik
4. Kamera IP -> test CCTV streaming

Tidak ada lagi gate software yang terbuka dan menggantung. Empat item di atas semuanya
butuh Acquisition (VPS/board/kamera) atau credential pihak ketiga (payment keys), bukan
kode. KalauRey menyatakan tidak ada alat fisik, development **tidak** berhenti: seluruh
pekerjaan yang bisa dibuktikan tanpa hardware sudah dikerjakan dan hijau secara lokal —
jalankan `npm run rescue:auth:flow` untuk melihat bukti alur auth yang tidak pernah bisa
diuji sebelumnya. Yang tersisa hanyalah evidence yang secara definisi tidak bisa
dihasilkan tanpa board, dan itu tidak boleh dipalsukan.

## Keputusan yang menunggu dan tidak bisa diasumsikan
- `project-config.json`: `releasePolicy.iosFinalReleaseGateAfterModule` (30) sudah tidak
  lebih besar dari `development.lastCompletedModule` (30), sehingga `check-sources.mjs`
  menolak. Menaikkan gate atau mendeklarasikan module 31 adalah keputusan kebijakan
  rilis (dampaknya ke signing dan app store), bukan perbaikan teknis.

## Langkah saat "lanjut iot"
Baca docs/phoenix/ROADMAP-v2.0.md, sambung dari fase berikutnya yang bisa
dikerjakan lokal. Jangan langgar freeze: perubahan kontrak/skema wajib ADR baru.
