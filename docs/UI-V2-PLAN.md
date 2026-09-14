# RENCANA UI v2.0 — IoT Platform (Hasil Audit Mendalam)

Tanggal: 2026-08-23 · Status: MENUNGGU PERSETUJUAN OWNER (Rey)

## 1. Hasil Audit

### 1.1 Yang SUDAH ADA dan teruji (fondasi backend — aset nyata)

**API endpoints siap pakai (dari scan controller):**

| Domain | Endpoint | Fungsi UI |
|---|---|---|
| Auth | /auth/register, login, refresh, logout, forgot/reset-password | Login, sesi, lupa sandi |
| Devices | GET/POST /devices, GET :id, GET :id/health, provision/revoke/pair/heartbeat | Tabel device + detail + health |
| Capabilities | GET/POST /devices/:id/capabilities | Daftar kemampuan per device |
| Commands | POST/GET /devices/:id/commands | Kirim perintah + riwayat (START/STOP pompa dll) |
| Telemetry | GET latest, history, aggregate (15m/1h/1d, max 31 hari) | Grafik realtime & historis, KPI cards |
| Dashboards | CRUD /dashboards + resolution + widget data | Widget dinamis (CARD/SWITCH/GAUGE/CHART/TABLE/STATUS) |
| Scenes | CRUD + run + executions | Tombol scene + riwayat eksekusi |
| Schedules | CRUD + enable + runs | Jadwal + riwayat |
| Users | profile, tenant-context | Profil user |
| Health/Metrics | /health, /health/live, /health/ready, /metrics | Platform Health panel |
| Admin | GET /admin/operational-summary | Ringkasan operasional admin |

**Modul data tambahan (sudah di DB, API dasar ada):** Space hierarchy
(Site→Building→Floor→Room), Device Sharing, Notification (+retry), OTA
Firmware, Analytics findings, Organization/Branch, RBAC custom roles +
audit log, Public API keys, Webhooks, Integrations registry.

**Design system:** paket `@iot-platform/design-system` ada tapi MINIMAL —
hanya ApplicationShell + SurfaceCard + 223 baris CSS. Ini akar masalah UI
yang "aneh": komponennya belum dibangun.

**Mobile:** Expo workspace dengan secure session, login UI, dan read-only
dashboard rendering — fondasi sah, tampilan perlu diangkat.

### 1.2 Gap terhadap desain target (gambar Rey v1.0)

| Komponen gambar | Backend | Frontend |
|---|---|---|
| Stat cards admin (tenants/devices/online/offline/alerts) | sebagian (aggregation perlu endpoint ringkas) | ❌ belum |
| Donut chart device status | data ada | ❌ belum |
| Line chart telemetry 24h | ✅ aggregate API | ❌ belum |
| Device Health bars | ⚠️ analytics findings (perlu mapping) | ❌ belum |
| Recent Alerts list | ⚠️ notification/analytics | ❌ belum |
| Platform Health (API/DB/Redis/MQTT) | ✅ /health | ❌ belum |
| Devices TABLE dengan search+pagination | ⚠️ list API tanpa search/pagination penuh | ❌ belum |
| Device Detail (firmware/IP/KPI/commands/audit) | ✅ tersebar di beberapa endpoint | ❌ belum |
| Tenants table | ⚠️ org/billing data ada, API ringkas belum | ❌ belum |
| Audit Logs table | ✅ rbac_audit_log (perlu API read) | ❌ belum |
| NOC: MQTT status, System Health page | ✅ metrics + health | ❌ belum |
| User: My Devices, Device Detail tabs | ✅ devices/capabilities/telemetry/commands | ❌ belum |
| Mobile: Home, gauge suhu, grafik 24j, START/STOP relay, Alerts, Profile | ✅ API semua ada | shell saja |

**Gap backend kecil yang harus ditutup untuk mendukung UI:**
1. Dashboard summary API (hitungan agregat satu panggilan)
2. Room summary API (perangkat per ruangan — visi room-centric)
3. Search & pagination di device list
4. Audit log read API
5. Notification/alert list API

## 2. Prinsip Kerja (sesuai roadmap)

- Backend tetap otoritatif; frontend hanya konsumen.
- Setiap slice kecil, bergerbang: implement → lint → test → build → commit → push.
- Tidak ada fitur CCTV/streaming sekarang (roadmap: setelah fondasi stabil).
- Desain mengikuti gambar Rey sebagai PATOKAN visual; konten mengikuti data nyata.
- Bahasa UI: Indonesia (konsisten dengan mobile shell yang sudah Indonesia-first).

## 3. Arsitektur Frontend v2

- **Design system v2** (`packages/design-system`): token warna dark/light,
  komponen: Sidebar, Topbar, StatCard, DataTable, LineChart, DonutChart,
  GaugeCard, Toggle, Badge, Modal, AlertList, TabNav, PhoneFrame helpers.
  Chart pakai library ringan (recharts) — data dari API nyata.
- **Admin Web** (dark theme): Sidebar layout → halaman:
  Dashboard, Devices, Device Detail, Tenants, Audit Logs, Automation,
  Schedules, Notifications, Platform Health, Settings.
- **User Web** (light theme): Dashboard, My Devices, Device Detail
  (tab Overview/Telemetry/Commands/Settings), Rooms, Sharing.
- **User Mobile** (dark): Home (favorit + ringkasan), Device Detail
  (gauge + chart 24j), Relay Control (START/STOP besar), Devices list,
  Alerts, Profile — 6 layar sesuai gambar.

## 4. Tahapan Eksekusi (slice bergerbang)

**Tahap A — Fondasi tampilan**
- A1. Design system v2: token + Sidebar/Topbar/StatCard/Badge/Toggle/DataTable
- A2. Layout shell baru admin-web & user-web memakai design system v2
- Gate: lint + typecheck + build + Jest tetap hijau

**Tahap B — Backend pendukung UI (kecil, satu-satu)**
- B1. GET /admin/dashboard-summary (stat cards satu panggilan)
- B2. GET /devices?search=&page=&pageSize= (search + pagination)
- B3. GET /rooms/:id/summary (room-centric)
- B4. GET /audit-logs (read bounded)
- B5. GET /notifications (list bounded)

**Tahap C — Admin Web pages (urutan gambar Rey)**
- C1. Dashboard Overview: stat cards, donut online/offline, line telemetry 24h,
      recent alerts, platform health strip
- C2. Devices: tabel + search + pagination + status badge
- C3. Device Detail: header info + tab Telemetry(chart)/Commands/Audit
- C4. Tenants + Audit Logs tables
- C5. Automation & Schedules pages (data sudah ada)
- C6. Platform Health page (/health + /metrics)

**Tahap D — User Web pages**
- D1. User Dashboard (light) + My Devices
- D2. Device Detail dengan tab Overview/Telemetry/Commands/Settings
- D3. Rooms (room-centric) + Sharing sederhana

**Tahap E — Mobile screens (Expo, 6 layar gambar Rey)**
- E1. Home + Devices list
- E2. Device Detail gauge + chart 24 jam
- E3. Relay Control START/STOP
- E4. Alerts + Profile

**Setiap tahap ditutup dengan:** gate penuh (lint/test/build/DB integration),
commit + push, laporan singkat ke Rey.

## 5. Estimasi Relatif

A+B = fondasi (pekerjaan paling menentukan). C = bagian terbesar (6 halaman).
D dan E menyusul pola C. Tidak ada deadline artifisial — kualitas & gerbang
test diutamakan sesuai prinsip roadmap.

## 6. Hal yang SENGAJA tidak dikerjakan sekarang

- CCTV/ONVIF/RTSP (roadmap: fase setelah fondasi stabil)
- Payment gateway (butuh akun mitra)
- Global Map (butuh koordinat device — kontrak lokasi belum disetujui)
- Aktivasi runtime automation & deployment produksi (gate owner)

---
Menunggu persetujuan owner untuk memulai Tahap A.
