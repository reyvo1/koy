> Initial audit snapshot. Owner subsequently authorized implementation; current changes and evidence are recorded in [Product operational completion](PRODUCT-OPERATIONAL-COMPLETION-2026-10-07.md). Counts and missing-feature statements below describe the pre-change checkout.

# Audit backend–frontend, menu, dan tombol — 2026-10-07

## Kesimpulan

Menu canonical lengkap pada source saat ini: 23 Super Admin, 23 Tenant Admin, dan 7 User Web. Backend dan frontend memiliki kontrak nyata untuk fitur canonical yang diperiksa; tidak ditemukan menu mati atau tombol yang jelas tanpa wiring dalam pemeriksaan statis ini. Namun, kelengkapan menu bukan bukti seluruh kemampuan produk atau setiap klik sudah selesai. Masih ada batas produk yang dinyatakan secara eksplisit, dua ketidaksesuaian design system, dan kekurangan cakupan skrip audit browser.

Audit ini hanya memeriksa proyek `/home/ivo/Desktop/program/iot`. Tidak ada perubahan kode produk, commit, push, deploy, atau restart layanan.

## Checkout dan bukti terkini

- HEAD saat audit: `4907ea5822e07188394ebee3c72e860e79a793cc`, branch `main`; working tree bersih sebelum audit.
- Origin: `https://github.com/reyvo1/iot-platform.git`.
- GitHub Actions run `37449896281` pada HEAD tersebut: `completed / success`, diperiksa langsung melalui GitHub CLI.
- Keempat job sukses: `test`, `Rescue live EMQX / acceptance`, ESP-IDF ESP32 + QEMU, ESP-IDF ESP32-C3 + QEMU. Tidak ada step gagal. Wokwi opsional dilewati; staging/upload artifact ESP32-C3 dilewati sesuai pemilihan artifact pipeline. Tidak ada klaim PHYSICAL/HIL.
- Bukti CI: https://github.com/reyvo1/iot-platform/actions/runs/37449896281
- Handoff sebelumnya masih menunjuk `8b2a76b69bb84e12324baee5ca031c7540d3b5d3` / run `37307702951` dan menyebut snapshot tanpa `/super/reports`. Kondisi itu sudah tidak menggambarkan checkout ini: reports ada dan structural validator lulus.
- Waves 1–13 tetap software-scope closed/green; tidak ada wave baru. Produksi tetap memerlukan persetujuan serta bukti target lingkungan tersendiri.

## Inventory dan kesesuaian

| Surface | Hasil audit saat ini | Batas bukti |
| --- | --- | --- |
| Super Admin | 23/23 target menu canonical ada; Security & Audit dan Reports dapat dijangkau dari shell | STATIC/CONTRACT |
| Tenant Admin | 23/23 target ada; TenantShell, field/lab shell, dashboard quick access memakai `TENANT_NAV_GROUPS` | STATIC/CONTRACT |
| User Web | 7/7 menu governed dan halaman ada | STATIC/CONTRACT |
| Mobile | Shell lima tab tersedia; validasi Expo dan typecheck lulus | STATIC/CONTRACT; tidak diuji di perangkat |
| Backend | 45 controller / 187 HTTP-or-SSE endpoint; census controller lulus | STATIC/CONTRACT; census bukan pembuktian setiap response field |
| Admin BFF | 118 file route; 73 file memiliki POST/PUT/PATCH/DELETE | STATIC; jumlah file, bukan jumlah metode |
| User BFF | 9 file route; 4 file mutasi | STATIC |
| Caller mutasi | 67/73 Admin langsung cocok dengan referensi route; 6 sisanya memakai path yang dirakit dan diperiksa manual. Seluruh 4 User BFF mutasi punya referensi | Referensi caller tidak membuktikan setiap metode/payload atau hasil runtime |
| Kontrol UI | 218 deklarasi button/Button/ActionButton/Pressable/TouchableOpacity dipindai; tidak ada kandidat tanpa handler, form-submit, spread props, atau disabled state | Heuristik AST; bukan jumlah tombol terlihat dan bukan uji klik |

Enam path Admin yang memerlukan pemeriksaan manual adalah update/delete dan reset password pengguna tenant/platform melalui `user-actions-modal.tsx` (base path menurut scope), serta activate/deactivate Automation melalui `${operation}` di `tenant-automation-content.tsx`. Semua memiliki caller nyata. Jumlah 72 mutasi dalam catatan lama tidak dipakai sebagai hasil baru; inventory sekarang berjumlah 73 file.

Kontrak lifecycle yang diperiksa lewat self-test dan targeted Jest mencakup Organization/Branch, custom roles, user membership, capability templates/versions, webhook rotation, audit pagination, notification detail/status, Integration Registry, commands, scenes, schedules, auth/RBAC dan tenant isolation. Endpoint mesin, auth, legacy, dan quarantine tidak wajib mendapat menu produk sendiri.

## Temuan yang perlu dirapikan

1. **P2 — Konfirmasi aksi belum sesuai design system.** `apps/admin-web/app/tenant/integrasi/page.tsx:75` memakai `window.confirm` sebelum DELETE registry; `apps/admin-web/components/super-capability-versions-panel.tsx:195` memakai `window.confirm` sebelum deprecate. Aksi memiliki wiring API, tetapi `UI-DESIGN-SYSTEM.md` melarang dialog browser native. Ganti dengan confirmation modal proyek dalam batch perbaikan.
2. **P2 — Audit browser belum mencakup seluruh menu tenant.** `scripts/audit-ui-sweep.mjs:39` hanya mencakup 18 dari 23 route. Audit Log, Integrasi, API Keys, Webhooks, dan Organisasi belum masuk. Default URL juga masih port 5001, sedangkan workspace Admin Web memakai 3100. Skrip hanya membaca DOM, error dan jumlah tombol; tidak mengeksekusi setiap aksi. Tambahkan route canonical dan skenario aksi sebelum mengklaim audit tombol menyeluruh.
3. **P2 — Handoff tertinggal dari checkout/CI.** Blok lama menyebut candidate belum tersertifikasi dan reports tidak tersedia, padahal HEAD terkini sudah memiliki reports serta run CI sukses. Audit ini memperbarui blok kontinuitas; sejarah tetap disimpan sebagai bukti historis.

## Kemampuan yang memang belum lengkap atau dibatasi

| Kemampuan | Kondisi source saat ini | Pekerjaan berikutnya jika masuk scope produk |
| --- | --- | --- |
| CCTV live view | `/cctv` quarantine; inventory/pairing/heartbeat ada, halaman menyatakan streaming RTSP/ONVIF belum tersedia (`page.tsx:398`) | Kontrak dan alur streaming yang dapat diakses dari UI + bukti runtime |
| Peta / geolokasi | NOC quarantine menyatakan tidak ada peta/geolokasi; widget MAP User Web fail-closed (`widget-card.tsx:49`) | Satukan model lokasi, sumber data, renderer dan UAT |
| Technician | Maintenance manual open/resolve dan command log tersedia; jadwal maintenance otomatis belum ada | Selesaikan alur lapangan/maintenance otomatis sebelum promosi dari quarantine |
| Mobile Preview | Pratinjau statis; tanpa SSE/polling; bukan sesi Expo operasional | Gunakan aplikasi mobile canonical untuk pembuktian runtime |
| Kontrol User Web / Mobile | Boolean writable tersedia; angka/enum/tipe lain belum ditawarkan (`device-detail-experience.tsx:150`, `mobile-device-detail-panel.tsx:85`) | Typed controls dengan validasi capability, permission dan rekonsiliasi ACK |
| Scene / Schedule untuk end user | Backend dan tenant UI tersedia; authoring/execution UX bukan route User Web top-level | Keputusan scope dan UX end user, lalu implementasi kontrak akses |
| Integrasi eksternal | `REGISTERED` membuktikan registry tersimpan, belum membuktikan provider terhubung (`tenant/integrasi/page.tsx:103`) | Bukti adapter/provider per integrasi yang dibutuhkan |
| Firmware/protocol perangkat | Detail menampilkan unavailable bila tidak ada kontrak per-device; metadata rollout bukan bukti firmware fisik terpasang | Sumber versi/protocol per-device dan pembuktian sesuai tier |
| Settings platform | `/super/settings` sengaja hanya Profile & Session | Kontrak konfigurasi platform jika fitur tersebut memang dibutuhkan |

Batas di atas bukan alasan membuka ulang Waves 1–13. Status software green tetap dibatasi oleh scope yang telah disertifikasi; jangan menyamakannya dengan semua fitur roadmap atau persetujuan deploy produksi.

## QA baru pada sesi ini

- `npm run rescue:validate`: PASS **505/505**.
- `npm run product-surface:self-test`: PASS, termasuk canonical tenant navigation **23/23** dan census backend.
- `npm run user-web:navigation:self-test`: PASS **7/7**.
- `npm run deep-product:contracts:self-test`: PASS.
- `npm run web:typecheck`: PASS design-system, admin-web, user-web, mobile validation/typecheck.
- `npm run wave2:test:targeted`: awalnya **40/41 suite, 411/415 tes PASS**; seluruh 4 kegagalan berasal dari `listen EPERM 127.0.0.1` pada fixture HTTPS akibat sandbox.
- Ulang suite HTTPS yang terhalang dengan izin localhost: **1/1 suite, 4/4 tes PASS**. Secara gabungan semua **41 suite / 415 tes** yang dipilih lulus; tidak diklaim satu eksekusi penuh green.
- Uji browser langsung belum dijalankan: probe localhost pada port Admin 3100, User 3200, dan API 3000 tidak mendapat koneksi. Chrome tersedia. Tidak menjalankan/restart stack aktif untuk audit ini.
- Full runtime lokal, semua tombol lewat browser, database integration lokal, physical hardware, serta provider-owned observations tidak diklaim sebagai bukti baru. Run GitHub pada HEAD adalah bukti automated runtime yang sudah diverifikasi.

## Prioritas berikutnya

Pertama, perbaiki kedua confirmation dialog dan cakupan audit browser sebagai satu batch defect/product hardening. Kemudian jalankan browser audit berautentikasi pada stack uji dengan data yang terkontrol, termasuk positive/negative actions untuk create/edit/delete, permission denial, dan command ACK. Tutup kemampuan tambahan di tabel sesuai prioritas owner. Setiap perubahan kode harus mengikuti local gates dan acceptance GitHub yang sama; push hanya dengan instruksi eksplisit owner.
