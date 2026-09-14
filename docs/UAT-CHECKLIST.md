# UAT CHECKLIST — IoT Platform (Staging)

Untuk: Rey (UAT manual, klik-klik saja)
Akses staging:
- Web Admin: http://127.0.0.1:3100
- Login: admin@demo.id / Demo12345! (tenant: Demo Home)
- Backend health: http://127.0.0.1:3000/health/ready

Catatan: MQTT broker & device fisik belum jalan di staging, jadi data
perangkat mungkin kosong — halaman harus tetap tampil rapi dengan pesan
"belum ada data", BUKAN error.

Cara pakai: centang [x] kalau OK, tulis CATATAN kalau ada masalah.

---

## A. LOGIN (5 menit)
- [ ] Buka http://127.0.0.1:3100/login — halaman tampil, tidak rusak
- [ ] Login dengan akun di atas — berhasil masuk ke dashboard
- [ ] Logout — kembali ke halaman login

## B. TENANT ADMIN (15 menit)
- [ ] Dashboard (/tenant/dashboard) — kartu ruangan & statistik tampil
- [ ] Perangkat (/tenant/perangkat) — daftar perangkat / pesan kosong yang rapi
- [ ] Ruangan (/tenant/ruangan) — daftar ruangan dari database
- [ ] Gedung (/tenant/gedung) — daftar gedung / kosong yang rapi
- [ ] Lokasi (/tenant/lokasi) — daftar lokasi / kosong yang rapi
- [ ] Realtime (/tenant/realtime) — grafik tampil atau pesan "menunggu data"
- [ ] Grafik (/tenant/grafik) — pilih perangkat + rentang waktu, tabel muncul
- [ ] Historis (/tenant/historis) — sama seperti grafik, ganti rentang 7 hari
- [ ] Perintah (/tenant/perintah) — panel kirim perintah + riwayat kosong rapi
- [ ] Otomatisasi (/tenant/otomatisasi) — status engine AKTIF/NONAKTIF tampil
- [ ] Scene (/tenant/scenes) — daftar scene / kosong rapi; tombol Jalankan ada
- [ ] Jadwal (/tenant/schedules) — daftar jadwal dari database
- [ ] Temuan Analitik (/tenant/temuan) — finding Module 16 / empty state yang tidak mengklaim notification delivery
- [ ] Route kompatibilitas /tenant/notifikasi redirect ke /tenant/temuan
- [ ] User Web /beranda — room-centric summary hanya dari perangkat owner/share yang terotorisasi
- [ ] User Web /ruangan — placement ROOM tidak pernah memberi akses ke perangkat tanpa VIEW/CONTROL
- [ ] User Web /perangkat-saya — VIEW-only dibedakan dari CONTROL
- [ ] User Web /perangkat-saya/[deviceId] — capability/telemetry/command history backend-backed; VIEW-only tidak bisa command
- [ ] User Web Device Detail — OTA hanya tampil sebagai persisted rollout evidence; current firmware/protocol tidak boleh direkayasa dari rollout metadata
- [ ] User Web Device Detail — Temuan Analitik adalah Module 16 findings, bukan bukti delivery notification
- [ ] Laporan (/tenant/laporan) — tombol Export CSV ada (klik boleh dicoba)
- [ ] Pengguna (/tenant/pengguna) — anggota rumah tampil

## C. SUPER ADMIN (15 menit)
- [ ] Dashboard (/super/dashboard) — metrik platform tampil
- [ ] Tenants (/super/tenants) — tenant "Demo Home" terlihat
- [ ] Subscriptions (/super/subscriptions) — paket/langganan atau kosong rapi
- [ ] Quotas (/super/quotas) — kuota per paket tampil
- [ ] Billing (/super/billing) — halaman tampil
- [ ] Users (/super/users) — pengguna admin@demo.id terlihat
- [ ] Roles (/super/roles) — halaman tampil
- [ ] API Keys (/super/api-keys) — daftar key / kosong rapi
- [ ] Devices (/super/devices) — daftar perangkat tenant
- [ ] Device Groups (/super/device-groups) — grup nyata lintas tenant tampil read-only; tidak ada mutasi lintas tenant
- [ ] Provisioning (/super/provisioning) — alur 4 langkah tertulis jelas
- [ ] Credentials (/super/credentials) — hanya metadata credential; hash/secret/token pairing tidak pernah tampil
- [ ] Firmware & OTA (/super/firmware) — artefak / kosong rapi
- [ ] Capability Registry (/super/capabilities) — schemaVersion/unit/constraints berasal dari capability nyata; tidak mengklaim template global
- [ ] Telemetry Center (/super/telemetry) — aggregate + Telemetry Explorer; Export CSV berasal dari row backend yang sama
- [ ] Command Monitor (/super/commands) — queue/ACK/history lintas tenant tampil read-only; tidak ada Send Command platform
- [ ] MQTT Center (/super/mqtt) — kontrak topik + status BACKEND READY/DOWN; jangan menganggap ini bukti session broker live
- [ ] Reports (/super/reports) — server-generated tenant summary + Export CSV; tidak ada row statis/demo
- [ ] Monitoring (/super/monitoring) — banner READY/Hijau untuk Postgres;
      Redis/MQTT boleh merah (memang belum jalan di staging)
- [ ] Security & Audit (/super/security) — log audit / kosong rapi
- [ ] NOC Control Room (/noc) — tetap QUARANTINE; jangan dianggap UAT production surface sampai live map/location contract lengkap
- [ ] AI Center (/super/ai) — temuan analitik / fail-closed rapi

## D. MOBILE PREVIEW (5 menit)
- [ ] /mobile-preview — aplikasi mobile tampil dengan 5 tab bawah:
      Home, Devices, Realtime, Alerts, Profile
- [ ] Klik tiap tab — konten berganti tanpa error
- [ ] Mobile Devices/Device Detail — daftar berasal dari `/spaces/accessible`; room dan VIEW/CONTROL sesuai owner/share policy
- [ ] Mobile Device Detail — capability/telemetry/command history/OTA evidence backend-backed; current firmware/protocol tetap "belum ada kontrak" bila source tidak ada
- [ ] Mobile Alerts — hanya WARNING/CRITICAL Module 16 untuk device yang terotorisasi; UI tidak mengklaim notification-delivery history
- [ ] Mobile Settings — tidak ada mutation end-user palsu; tetap fail-closed tanpa kontrak write nyata

## E. KENYAMANAN UMUM (5 menit)
- [ ] Semua halaman konsisten (warna teal/hitam untuk super, terang untuk tenant)
- [ ] Tidak ada teks error merah mentah di layar normal
- [ ] Buka di HP/browser sempit — menu bisa di-scroll, layout tidak berantakan

---

## Hasil UAT
Tanggal dikerjakan: ______________
Masalah ditemukan:
1. ________________________________
2. ________________________________
3. ________________________________

Setuju lanjut ke PRODUCTION? ( ) YA   ( ) BELUM, revisi dulu
Tanda tangan: ______________
