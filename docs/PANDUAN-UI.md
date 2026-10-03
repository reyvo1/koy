# PANDUAN PENGGUNAAN UI — IoT Platform Enterprise

Panduan singkat menjelajahi aplikasi. Server lokal harus jalan:
- Backend: http://127.0.0.1:3000
- Admin Web: http://127.0.0.1:3100

Login UAT — kredensial ada di `.uat-credentials` (git-ignored), dibuat dengan
`node scripts/seed-uat-baseline.mjs`:

| Peran | Tenant ID | Email |
|---|---|---|
| Platform admin | `11111111-1111-4111-8111-111111111111` | `uat.superadmin@iot.local` |
| Tenant admin | `44444444-4444-4444-8444-444444444444` | `uat.admin@iot.local` |
| Tenant member | `44444444-4444-4444-8444-444444444444` | `uat.member@iot.local` |

> Versi panduan ini sebelumnya menyebut `admin@demo.id / Demo12345!` dan kemudian sempat melenceng ke port API 5000. User itu tidak pernah ada
> di database, dan string-nya justru ada di daftar *forbidden* `scripts/validate-rescue-baseline.mjs`.
> Password juga sengaja tidak ditulis di dokumen: ada di `.uat-credentials`.

---

## 1. Login (halaman `/login`)
Split-screen premium. Kiri: branding platform. Kanan: form Tenant ID +
Email + Password. Sesi disimpan cookie HttpOnly.

## 2. Super Admin Console (`/super/dashboard`)
Konsol enterprise untuk pemilik platform.
| Menu | Fungsi |
|---|---|
| Dashboard | Statistik platform + akses cepat + health |
| Tenants / Subscriptions / Quotas / Billing | Kelola klien & langganan |
| Users / Roles / API Keys | Pengguna, peran, kredensial API |
| Devices / Device Groups / Provisioning / Credentials / Firmware & OTA | Siklus hidup perangkat; Device Groups platform read-only dan Credentials hanya metadata non-secret |
| Capability Registry | Observed per-device definitions + schemaVersion/unit/constraints; belum ada template global terpisah |
| Telemetry Center | Grafik agregat + bounded raw explorer + CSV dari evidence backend |
| Command Monitor | Queue/ACK/terminal history lintas tenant, read-only; tidak ada cross-tenant Send Command |
| MQTT Center | Kontrak broker/auth/ACL + backend readiness; live broker sessions/topics runtime belum diklaim |
| Monitoring | PostgreSQL/Redis/MQTT/Workers/API |
| Security & Audit | Jejak audit immutable |
| NOC / Control Room | QUARANTINE sampai live location/map contract lengkap |
| AI Center | Anomaly/prediction (Modul 16) |
| Reports / Settings | Bounded server-generated tenant operational report + CSV; preferensi platform |

## 3. Admin Operasional (dark theme)
- `/dashboard` — kartu statistik, donut status, grafik telemetry 24 jam,
  daftar perangkat terbaru, Platform Health
- `/perangkat` — tabel device: search, filter tipe, klik nama → detail
- `/perangkat/[id]` — tab Information/Capabilities/Telemetry/Commands/
  History; tombol Turn On/Turn Off/Restart
- `/cctv` — grid kamera (siap streaming saat kamera terdaftar)
- `/mobile-preview` — frame HP interaktif 5 tab

## 4. Tenant Admin (light theme, room-centric)
- `/tenant/dashboard` — ringkasan rumah + grid ruangan + aktivitas
- `/tenant/scenes` — kartu scene dengan tombol Jalankan (Modul 12)
- `/tenant/schedules` — jadwal otomatis (Modul 13)
- `/tenant/temuan` — temuan analitik Module 16 (CRITICAL/WARNING/INFO); `/tenant/notifikasi` hanya redirect kompatibilitas sampai delivery notification punya read contract nyata
- `/tenant/laporan`, `/tenant/pengguna`

## 5. User Web (`apps/user-web`)
Aplikasi user terpisah — tanpa detail infrastruktur.
- `/beranda` — ringkasan room-centric dari perangkat yang lolos owner/share VIEW/CONTROL
- `/perangkat-saya` — daftar perangkat terotorisasi; detail di `/perangkat-saya/[deviceId]` dengan capability, telemetry, command history, OTA rollout evidence, dan Module 16 findings. Current firmware/protocol tidak ditebak dari metadata rollout.
- `/ruangan` — ROOM → perangkat terotorisasi; placement tidak memberikan izin dengan sendirinya
- `/realtime` — stream telemetry SSE untuk perangkat yang lolos izin VIEW
- `/dashboard` — dynamic dashboard/workspace; akses mengikuti permission dashboard yang diberikan tenant admin
- `/alerts` — WARNING/CRITICAL Module 16 hanya untuk perangkat yang dapat diakses
- `/profil` — lihat dan ubah nama profil akun
- PWA: bisa di-install ke layar utama HP (manifest + icon tersedia)

## 6. Mobile App (`apps/user-mobile`)
React Native/Expo asli: Home, Devices, Realtime, Alerts, Profile. Devices/Device Detail memakai read model owner/share yang sama dengan User Web. Alerts membaca WARNING/CRITICAL Module 16 untuk device terotorisasi dan tidak dipresentasikan sebagai notification-delivery history. Settings mutation end-user tetap tertutup tanpa kontrak write nyata.
Preview interaktif tersedia di admin: `/mobile-preview`.

---

## Prinsip yang dijaga (arsitektur inti)
1. Semua data lewat backend API — frontend tidak menyentuh DB langsung.
2. Widget hanya tipe resmi Modul 10: CARD/SWITCH/GAUGE/CHART/TABLE/STATUS.
3. Tenant isolation dijaga di setiap proxy API.
4. User tidak melihat detail infrastruktur (MQTT/Redis/IP/vendor).
5. Fitur belum aktif ditampilkan fail-closed (CCTV "No Signal", bukan palsu).

## Troubleshooting
- **Halaman minta login terus** — sesi kedaluwarsa; login ulang.
- **Port 3000 dipakai aplikasi lain** — matikan dulu (`ss -ltnp | grep :3000`).
- **Probe tiba-tiba 401** — `seed-demo-accounts.mjs` meregenerasi password tiap jalan; re-seed
  lalu baca password barunya.
- **Tidak ada tombol hapus device** — memang tidak ada `DELETE /devices/:id`; pakai
  `PATCH /devices/:id/revoke`, itu juga yang membebaskan kuota.
- **CI merah?** Jalankan `npm run lint:check && npm run web:typecheck && npm test` sebelum push.
