# KOMERCIAL RINGKAS — IoT Platform

Disusun: 25 Agustus 2026 | Status: Staging siap UAT (menunggu approval produksi)

## Apa ini?
Platform IoT kelas enterprise (acuan: ThingsBoard / Azure IoT Central) untuk
mengelola perangkat pintar multi-tenant: sensor, aktuator, hingga CCTV —
dengan dashboard web premium, aplikasi mobile, dan pusat operasi 24/7.

## Fitur utama yang sudah jadi
1. **Multi-tenant + isolasi data** — tiap pelanggan hanya melihat datanya sendiri
   (JWT + tenant guard + role ADMIN/OPERATOR/VIEWER).
2. **Manajemen perangkat lengkap** — provisioning claim-code, kredensial
   unik per device, capability registry (sensor suhu, relay, kamera, GPS).
3. **Telemetry realtime & historis** — ingest via MQTT webhook, chart live
   SSE, agregasi 15 menit/1 jam/1 hari, retensi per paket.
4. **Command & kontrol** — kirim perintah dengan idempotency-key, ACK
   tracking, timeout scheduler.
5. **Otomatisasi** — engine jika-maka antar perangkat, scene satu-sentuhan,
   jadwal berkala (cron).
6. **Notifikasi & alert** — deteksi anomali (Module 16), notifikasi center,
   webhook transport.
7. **Super Admin console** — manajemen tenant, subscription/billing/kuota,
   user & API key, firmware OTA rollout bertahap, MQTT center, monitoring
   infrastruktur, security & audit log immutable.
8. **NOC Control Room** — papan metrik global, live telemetry stream,
   status seluruh layanan dalam satu layar.
9. **Mobile app** (React Native/Expo) — 5 tab: Home, Devices, Realtime,
   Alerts, Profile; secure session via device keystore.

## Bukti kualitas
- 167 test suite / 1091+ unit test HIJAU
- 14 integration suite / 56 tes database HIJAU (termasuk E2E penuh:
  device → telemetry → chart → command → ACK, dan simulasi 30 device)
- Build produksi Next.js sukses tanpa error
- Semua layar mengikuti blueprint enterprise + design system v2
- Fail-closed di seluruh UI: tidak ada data palsu, service down = pesan jujur

## Screenshot path (untuk materi penjualan)
- screenshots/ (folder repo — akan diisi saat UAT visual)

## Rekomendasi harga (pasar Indonesia)
| Paket | Perangkat | Retensi Data | Harga/bulan |
|---|---|---|---|
| Starter | 10 | 7 hari | Rp 149.000 |
| Business | 50 | 30 hari | Rp 499.000 |
| Enterprise | Unlimited | 90+ hari | Custom (mulai Rp 2jt) |

Catatan strategi:
- Model SaaS per tenant; Enterprise dapat dedicated instance + SLA.
- Onboarding fee sekali bayar Rp 500rb–2jt tergantung kompleksitas.
- Target awal: hotel/vila (TAMASYA existing), rumah pintar premium,
  UMKM cold-storage & pertanian terkontrol.

## Langkah menuju go-live
1. Rey jalankan UAT (docs/UAT-CHECKLIST.md) — ±45 menit klik-klik.
2. Approval produksi dari Rey.
3. Deploy produksi + domain + SSL.
