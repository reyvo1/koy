# SESSION CHECKPOINT — ENTERPRISE WAVE 13

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->

## Current checkpoint — 2026-10-04

- Wave 13 remains IN PROGRESS; Waves 1–12 remain software-scope CLOSED/GREEN.
- Latest GitHub checkout: `9523a6f0b369e9f06faa10ae3f1a326b41a79fd0`, Actions run `37177331993`; evidence bundle `logs_100701175302.zip`.
- Core evidence: Full Jest **278/278 suites, 2412/2412 tests PASS**; dual ESP32/QEMU PASS; rescue validation **488/488 PASS**.
- Wave 4 is green on the live rescue runner: UAT docs **24/24 PASS**, UAT login **9/9 PASS**, TLS **12/12 PASS**.
- FIRST FAILING GATE: `Wave 5 public API webhook and SDK live regression`. `webhook:probe` aborts on `PROBE_EMAIL: unbound variable` before login because the fresh GitHub step does not export the UAT credentials. `/tmp/probe-login.json` then parses empty only as a secondary failure. `sdk:probe` requires the same missing env contract and is repaired in the same batch.
- Root repair: Wave 5 must consume `.uat-credentials` emitted by `uat:seed` through `probe-common.sh`; one wrapper exports `PROBE_EMAIL`, `PROBE_PASSWORD`, `PROBE_TENANT_ID`, `PROBE_BASE`/`PROBE_API_BASE` then executes webhook + SDK.
- Cheap guard: `wave5:public-api:self-test` validates loader parsing, fresh-step env export, fail-closed missing credentials, wrapper syntax and CI/package wiring; it is required by local pre-push and core CI.
- Repair QA PASS: Wave 5 credential self-test, session handoff self-test, GitHub CI contract, enterprise status 10/10, rescue validator 490/490; final seal 1374/1374 source and 1375/1375 hashes.
- Hardware policy unchanged: `SIMULATED_HARDWARE_LIVE_SERVICE` closes automated software UAT; physical/HIL remains separately labelled non-blocking field evidence.

### Next action

`npm run wave5:public-api:self-test` → `npm run wave3:prepush:check` → diff review → one commit/push → inspect the next GitHub FIRST FAILING GATE. Do not reopen Wave 4 TLS without new evidence.

--- HISTORICAL CHECKPOINT CHRONOLOGY BELOW ---

# IOT SESSION CHECKPOINT — TRIGGER: ketik "lanjut iot"

## BACA INI DULU — status terkini, diverifikasi ulang 2026-09-30 01:35 WITA

**Checkpoint ini ditulis menumpuk ke bawah, jadi blok paling ATAS bukan yang terbaru. Bagian terbaru ada di paling BAWAH. Untuk status terkini, baca blok ini saja.**

### 1. Dua daftar yang berbeda — jangan tercampur

| | Isi | Status nyata |
|---|---|---|
| **Wave 1–13** (`docs/ENTERPRISE-WAVE-ROADMAP.md`) | 13 wave enterprise | **Wave 1–2 CLOSED, Wave 3 ACTIVE, Wave 4–13 = 10 wave BELUM DIMULAI** |
| **Module 1–30** (`AI-Development-Kit/prompts/`) | 30 modul | 30/30 *foundation*-complete |

Roadmap baris 5 sendiri menulis: *"30/30 foundation-complete does not mean
enterprise-complete."* **Awal 2026-09-30 seorang agen melaporkan "sisa 4 pekerjaan" —
itu keliru.** Angka itu dihitung dari sudut Module 1–30, bukan Wave 1–13. Jangan
salin lagi. **2 dari 13 wave selesai.**

### 2. Angka/tree saat ini — JANGAN pakai angka di blok lain

| Hal | Nilai |
|---|---|
| HEAD | `993f957` (2026-09-28 15:34), `main` **ahead 4** dari `origin/main` |
| Working tree | **193 entri** — 128 file **+8237/−2078**, 65 file baru |
| Full Jest | **216 suite / 1544 test PASS** (43,58 s) |
| `rescue:validate` | **PASS 471/471** |
| `manifest:verify` | **1138/1138 source, 1139/1139 hash** |
| `wave3:esp32:self-test` | **PASS** |
| Container | `iot-rescue-api` **Up (healthy)** :5000; postgres/redis/emqx healthy |
| Git | **Tidak ada commit, tidak ada push.** Commit+push tetap milik Rey. |

> Angka "201 suite / 1350 test", "149 entri", "176 entri" **usang**. `git status
> --porcelain | wc -l` adalah satu-satunya sumber kebenaran untuk tree.

**Denominator codebase** (untuk sensus, bukan vonis): 134 route backend,
39 service, 36 controller, 88 BFF route, 64 `page.tsx`, 210 spec
(113 di `src/`, 94 di `test/` — **scan kedua home, bukan hanya `test/`**).

### 3. PENTING — jangan ulang pekerjaan yang sudah selesai

- **Dashboard editor, Module 18 Device Sharing, Module 19 Organization, Module 20 audit
  query, dan perbaikan CSP/`ToastProvider` — SEMUA SELESAI dan terverifikasi.** Tabel
  bukti runtime-nya ada di bagian bawah file ini.
- Kalau sebuah blok di bawah menyebut "belum dilihat hasilnya" atau "sedang berjalan di
  latar", itu **usang** — bagian `Hasil suite final` sudah mengisinya.

### 4. Sisa pekerjaan — dua tingkat, bedakan dengan jelas

**Tingkat A — gap nyata di dalam Wave 1–5 yang sudah dikerjakan (kode, bisa langsung):**

1. **Module 21 Public API/Webhook** — `signWebhookPayload` ada, tapi **0 file** retry
   worker webhook (`grep retryWebhook|webhookRetry|retryQueue` → nihil).
2. **Module 27 Billing** — `checkDeviceQuota` + `ensureSubscription` terpakai, tapi
   **0 file** usage meter / entitlement. Hanya 1 file sentuh payment provider.
3. **Module 25 mobile** — 6 dari 8 flow; **realtime** dan **commands** belum ada. Tiga
   artefak Kit masih menulis "Flutter" padahal sudah Expo SDK 57.
4. **Wave 9 parsial** — `DeviceLocation` ada di schema tapi **0 pembacaan** di `src/`/
   `apps/` (tabel mati). GPS/map **0 file**. Widget MAP fail-closed. ONVIF 2 file,
   RTSP 10, WebRTC 3 — belum "supported vendor path" seperti exit criteria minta.

Bukan gap (sudah diverifikasi, jangan dikerjakan): Module 22 Integrations 0 adapter
sesuai `MODULE-22.md:12` (adapter hanya bila ada credential provider).

**Tingkat B — 10 wave yang belum dimulai. Ini yang membuat proyek ini besar:**

| Wave | Isi | Jejak di repo |
|---|---|---|
| 3 | ESP32 + OTA simulation | **ACTIVE** — runner QEMU + 6 self-test ada, V5 hijau di GitHub |
| 4 | Staging / VPS / UAT | **0 file** (terraform/ansible/vps/staging) |
| 5 | Enterprise Domain/API closure | parsial — lihat Tingkat A |
| 6 | Management plane (capability version, NOC, reports) | perlu sensus |
| 7 | Mobile + Technician | parsial — lihat Module 25 |
| 8 | Billing + Integrations | parsial — 0 meter, 0 adapter |
| 9 | CCTV + Location | **0 pembacaan location**, ONVIF/RTSP/WebRTC tipis |
| 10 | HA / Scale / Observability / Security | hanya `correlation-id.interceptor` + `metrics.controller` (Prometheus text). **Nol** OTel/tracing/Grafana/load/retention |
| 11 | AI + Executive | UI `/super/ai` + BFF `/api/super/findings` **ada dan fetch nyata**, TAPI **0 komputasi analitik** (tidak ada onnx/forecast/zScore/anomalyScore). Jadi tampilannya honest-read, bukan prediksi. |
| 12 | Enterprise Horizon | **0 file** multi-region, **0** edge gateway |
| 13 | Final Certification | butuh gate acquisition |

### 4b. JEBAKAN SENSUS — dua daftar, dua denominator

Project ini punya **dua numerator** dan keduanya benar, dan mencampur keduanya
menghasilkan laporan yang kebetulan tidak salah, tapi berguna nol:

- `AI-Development-Kit/prompts/MODULE-*.md` = **30 modul**, dan 30/30-nya
  *foundation*-complete. Kalau angka sisa pekerjaan terlihat mecil, itu karena
  denominator-nya ini — dan itu keliru untuk tujuan enterprise.
- `docs/ENTERPRISE-WAVE-ROADMAP.md` = **13 wave enterprise**, dan hanya
  **Wave 1–2 yang CLOSED**. Sisa pekerjaan yang terlihat dari sini jauh lebih besar.

Aturan: **sebut yang mana yang sedang dihitung, dan sebutkan keduanya.** Menulis
"sisa 4 pekerjaan" tanpa menyebut wave-vs-module adalah melaporkan angka pada
tingkat yang salah — bukan detail kecil. Kalau sebuah blok checkpoint menyebut
"wave" padahal angkanya berasal dari `MODULE-`, angka itu salah target.

Dua jebakan pengukuran yang sudah terbukti di repo ini:

- **`grep -ril 'anomaly'` mengembalikan UI, bukan implementasi.** `/super/ai` dan
  `analytics-ingestion.service.ts` memuat kata `ANOMALY`, tapi **nol komputasi
  analitik** (`onnx|forecast|zScore|regression` → 0 file). Halaman itu fetch
  `/api/super/findings` dan menampilkan apa yang ada — jujur, tapi bukan prediksi.
  Keyword presence bukan capability.
- **Endpoint 404 vs 401 adalah pembeda "terdaftar atau tidak".** `GET
  /organizations` membalas 404 karena controller memang tidak punya GET di path itu —
  itu benar, bukan route hilang. `POST /organizations` dan `GET /audit-logs` membalas
  401, artinya terdaftar dan_waiting auth. Cara cepat memastikan image Docker bukan
  image lama: panggil route baru tanpa token, lihat 401 (ada) atau 404 (belum ada).

### 5. Gate yang BUKAN kode (butuh Anda, tidak bisa dikerjakan agen)

VPS/hosting, akun payment provider (Midtrans), board ESP32 fisik + HIL, kamera IP nyata,
akun UAT. Wave 13 tanpa ini tidak bisa ditutup, dan tidak boleh di-pura-purakan PASS.

### 6. Kalau konsol lokal dipakai lagi

Urutan wajib: **Jest dulu → baru seed → baca password tercetak → baru login.**
`test/demo-seed-reentry.contract.spec.ts` menjalankan seed sungguhan dan me-reset
password tiap kali suite jalan. Password di catatan lama **tidak berlaku**.
Dev server: `npx next dev --port 5001` dari `apps/admin-web` (`npm run dev` meng-hardcode
port 3100). Kalau login "gagal" padahal password benar, cek
`apps/admin-web/.next/dev/logs/next-development.log` untuk `write EPIPE` — dev server bisa
wedge dan **setiap** request hang tanpa error.

### 7. Kalau menyalakan konsol butuh backend yang merefleksi kode terbaru

Kontainer `iot-rescue-api` **tidak** bind-mount source. Setelah mengubah kode backend,
`docker restart` menjalankan image LAMA. Urutan: `docker compose -f
docker-compose.rescue.yml build api` lalu `up -d --no-deps api`, lalu cocokkan digest.
Verifikasi bahwa route baru hidup: panggil tanpa token — **401 berarti terdaftar**,
**404 berarti tidak terdaftar**. Ini cara tercepat memastikan image bukan yang lama.

---

## (arsip di bawah — kronologi sesi lama; SUDAH SELESAI kecuali yang ditandai)

## Status per 2026-09-29 (sesi keempat — konsol lokal tidak bisa login)

- HEAD tetap `993f957`, branch `main` **ahead 4**. Working tree **176 entri** (angka ini
  sudah usang — lihat blok atas). Commit+push tetap milik Rey.
- Reported sebagai "belum masuk, lihat error `eval()`". Dua defect terpisah; yang kedua
  adalah penyebab sebenarnya dan tidak ada kaitannya dengan CSP.

## TEMUAN Sesi Keempat — konsol lokal tidak bisa dipakai

1. **CSP melarang `eval()` yang React development build butuh.** `script-src` di kedua
   `next.config.mjs` hanya `'self' 'unsafe-inline'`. React dev memanggil `eval()` untuk
   merekonstruksi component stack lintas server/browser; browser menolak, dan setiap page
   load memenuhi console dengan `eval() is not supported in this environment`. Fix:
   `'unsafe-eval'` **hanya saat `NODE_ENV === 'development'`** — production React memang
   tidak pernah memakai eval(), jadi policy production tetap ketat dan tidak melebar ke
   `https:` atau `*`. Guard: 6 test baru di `test/security-headers.contract.spec.ts`,
   RED proven (2 merah) sebelum fix.

2. **Dev server wedge — ini yang membuat "belum masuk", bukan CSPnya.** `.next/dev/logs/next-development.log`
   mencatat `⨯ "uncaughtException:" Error: write EPIPE`. Setelah itu **setiap** request ke
   `http://127.0.0.1:5001` accept TCP lalu hang tanpa respons (diuji 25s/30s/60s/190s, semua
   timeout). Halaman login masih tampil karena HTML sempat ter-flush, tapi `<script src>`
   tidak pernah sampai → React tidak hydrate → tombol "Masuk →" **tetap disabled** karena
   `disabled={busy || !hydrated}`. Jadi gejalanya "tidak bisa login" padahal tidak ada
   kredensial yang pernah diuji. Setelah restart: 200 dalam 0.07s, login superadmin sukses
   ke `/super/dashboard`, console `js_errors: 0`, HMR connect.

   Bukti runtime akhir: `/super/dashboard` render penuh — 32 tenant, 55 perangkat, 42
   aktif, PostgreSQL/Redis/MQTT semua `UP`, tabel perangkat 6 halaman, tanpa banner error.

3. **Jest full suite quietly me-reset kredensial demo.** `test/demo-seed-reentry.contract.spec.ts:63`
   menjalankan `scripts/seed-demo-accounts.mjs` **dua kali** terhadap database sungguhan. Seed
   itu mencetak password **baru** setiap kali jalan. Jadi password yang dibaca **sebelum**
   `npx jest` menjadi basi sesudahnya, dan login berikutnya 401 — terlihat seperti aplikasi
   rusak padahal tidak ada yang rusak. Urutan wajib: jalankan suite dulu, baru seed, baru
   baca password, baru login. Kalau sudah terlanjur 401, jangan suspects aplikasi: seed ulang
   dan baca password yang benar-benar dicetak.

## Temuan audit parity UI (sesi keempat, 2026-09-29)

Audit controller↔UI di 33 controller / 102 route, diukur di Chrome headless dengan sesi
login asli. Angka, bukan vonis.

- **102 route backend, 26 tidak dirujuk UI menurut script parity — tapi 24 dari 26 itu false
  positive script.** `backend-ui-route-parity.mjs` hanya mencocokkan literal path; BFF route
  repo ini memanggil backend lewat `client.request('/path')` di `lib/backend.ts`, yang tidak
  ter-cocok string. Setelah diverifikasi manual dengan `search_files`, hanya **2** route yang
  benar-benar tanpa referensi UI: `GET /users/tenant-context`
  (`src/users/users.controller.ts:24`, mengembalikan `req.user.tenantContext` — fail-closed,
  bukan surface operator) dan `GET /admin/users` (duplikat legacy; live surface adalah
  `/admin/platform-users` dan `/admin/tenant-users`, keduanya ter-wire).
- **Halaman UI: 58 `page.tsx` di `apps/admin-web`** (43 sesuai route map + `/noc`).
- **Distribusi isi (Chrome headless `route-sweep.mjs`, `err=0` semua halaman):** kaya
  4.300–8.600 char — `/super/tenants` 3.528, `/super/users` 5.716, `/super/roles` 5.677
  (2 tabel/36 baris), `/super/devices` 8.603, `/super/provisioning` 7.437,
  `/super/telemetry` 4.320. Sisanya 42–752 char.
- **Nol-char di sweep (`/super/settings`, `/noc`) adalah artefak cold-compile, bukan halaman
  kosong.** `/super/settings` diverifikasi manual di browser = 35 elemen, profil
  "Demo Super Admin" terisi, tombol Simpan aktif. **Char-count dari sweep pending tidak boleh
  dipakai sebagai vonis** — cold-compile Turbopack membuat halaman compliant tampak nol.
- **Halaman tipis itu wired, datanya kosong.** Komponennya fetch nyata
  (`/api/super/subscriptions`, `/api/super/audit-logs`, `/api/super/device-credentials`,
  `/api/tenant/spaces`, `/api/admin/analytics-findings`, `/api/super/findings`); semuanya
  **200 dengan `items=0`**, bukan error. Yang punya data: `/super/tenants` 32,
  `/super/platform-devices` 55, `/super/capabilities` 59, `/super/commands` 40,
  `/api/super/reports/tenant-summary` 32 baris, `/api/tenant/spaces` 4, `/api/admin/devices` 5.
- **Role MEMBER ditolak di Admin Web adalah desain, bukan bug.**
  `apps/admin-web/app/api/session/login/route.ts:67` menolak role selain
  `ADMIN`/`PLATFORM_ADMIN` dengan 403 dan me-revoke session yang baru dibuat. Terbukti:
  `demo.user@iot.local` → **HTTP 403** "Akun ini tidak memiliki akses ke konsol administrator".
  `RBAC_BASE_ROLE_MODEL` (`src/rbac/rbac-permission-catalog.ts:120`) menyatakan ketiganya
  eksplisit: ADMIN dan PLATFORM_ADMIN wildcard, MEMBER denied kecuali ada CustomRole.

## Rantai peran super→admin→user→device (dibuktikan runtime, 2026-09-29)

Audit sebelumnya hanya menutup `admin-web`. Ketiga client diuji langsung.

**Hierarki login — bekerja, berjenjang, dan sengaja fail-closed:**

| Client | Port | Akun | Hasil |
|---|---|---|---|
| Admin Web | 5001 | `PLATFORM_ADMIN` | **200**, buka `/super/*` |
| Admin Web | 5001 | `ADMIN` | **200**, buka `/tenant/*` |
| Admin Web | 5001 | `MEMBER` | **403** "Akun ini tidak memiliki akses ke konsol administrator" |
| User Web | 3200 | `MEMBER` | **200** + cookie `iot_user_access` |

MEMBER ditolak di Admin Web tapi **diterima di User Web** — persis pemisahan yang didesain.
`admin-web/app/api/session/login/route.ts:67` yang menolak, dengan revoke session.

**"User mengontrol device" — bekerja, tapi HANYA setelah device di-share.** Ini tidak
tertulis di dokumen mana pun dan harus diketahui operator:

- Tanpa share: `POST /devices/:id/commands` → **403** `RBAC_PERMISSION_DENIED`
  "Device control access denied" (`src/device/device-access.guard.ts`).
- Setelah insert `device_share_grants` (permission `CONTROL`, status `ACTIVE`,
  `expiresAt` dan `createdByMembershipId` keduanya wajib diisi) untuk membership MEMBER:
  `GET /devices` → **200** (1 device: `Lobby Light Panel`), lalu
  `POST /devices/:id/commands` body `{"payload":{"lightPower":true}}` → **201**,
  `status: SENT`, `correlationId` dikembalikan.
- Share dihapus lagi → **403** kembali. Guard proven dua arah.

**`x-tenant-id` adalah header wajib, bukan opsional.** Tanpa header itu SEMUA endpoint
tenant-scoped membalas **403 `TENANT_CONTEXT_INVALID`** — termasuk untuk ADMIN. Endpoint
yang hanya butuh JWT (`/users/profile`) tetap 200. Ini pitfall paling mudah salah dibaca
sebagai "user tidak punya akses".

**Shape command: `{"payload": {...}}`, bukan `{"capabilityKey","value"}`.** Bentuk kedua
ditolak 400 `VALIDATION_FAILED` — dan itu muncul **setelah** auth lolos, jadi 400 di sini
berarti request salah bentuk, bukan permissions salah.

**Tidak ada CCTV di user-web maupun user-mobile.** `grep -ril 'cctv|camera'` → 5 file,
semuanya di `admin-web` (`app/cctv/page.tsx`, `app/api/cameras/route.ts`,
`tenant-devices-content.tsx`, `super-provisioning-content.tsx`, `admin-shell-v3.tsx`).
user-web **nol**, user-mobile **nol**. Rantai "super→admin→user→device" berhenti di device;
kamera tidak ada di tangan user/member.

**Kondisi user-web & user-mobile (jujur soal berapa):**

- `user-web`: 6 halaman (`/beranda`, `/ruangan`, `/perangkat-saya`,
  `/perangkat-saya/[deviceId]`, `/dashboard`, `/`), 2.940 baris TS/TSX, 4 BFF route.
  Semua **200** setelah warm. Tanpa CCTV, device-groups, scenes, schedules, automations
  (itu surface tenant-admin).
- `user-mobile`: Expo/React Native, 6.507 baris, punya login + dashboard + device detail +
  alerts + secure session store (`expo-secure-store`) + 5 spec sendiri. **Belum dijalankan
  di perangkat** — hanya typecheck dan spec. Statusnya "ada dan teruji unit", bukan
  "terbukti jalan di HP".

## Jebakan baru yang sudah terverifikasi

- **Header `x-tenant-id` hilang = 403 di semua endpoint tenant, dan itu bukan bug akses.**
  `TenantContextGuard` (`src/users/guards/tenant-context.guard.ts:14`) menolaknya sebelum
  permission dicek. Probe yang hanya mengirim `authorization: Bearer` akan menyimpulkan
  "MEMBER tidak punya akses" padahal masalahnya probe tidak mengirim tenant.
- **`psql -c` dengan nama kolom camelCase harus di-quote, dan escaping inline merusak
  query.** `m.userId` tanpa kutip menjadi `m.userid` (tidak ada); `"tenantId"` menjadi
  `tenantId` (tidak ada). Jalankan lewat `docker cp file.sql` lalu `psql -f` untuk query
  yang punya kolom camelCase atau cast `::`.


- **Halaman yang tampil bukan bukti server hidup.** Dev server yang sudah `uncaughtException`
  masih menampilkan markup HTML-nya di browser, dan markup itu terlihat normal. Yang hilang
  adalah `<script src>`, jadi React tidak hydrate dan setiap tombol submit **terkunci
  disabled** oleh guard `!hydrated`. Gejalanya terbaca sebagai "kredensial saya salah"
  padahal form-nya tidak pernah hidup. **Cek `document.querySelectorAll('script[src]')` —
  kalau kosong, jangan curiga password.** Cek `.next/dev/logs/next-development.log` untuk
  `uncaughtException` dulu; log itu tidak masuk ke terminal yang menjalankan `next dev`.
- **Error CSP di log Next berasal dari browser, bukan dari server.** Baris
  `[browser] "..."` adalah error yang dikirim browser **ke** dev server. Jadi `curl` tidak
  akan pernah memunculkannya — harus lihat log.
- **`curl -sI` timeout padahal port masih LISTEN berarti prosesnya sudah rusak, bukan
  kompilasi lambat.** Dev server yang wedge accept TCP lalu tidak pernah merespons; satu-satunya
  jalan keluar adalah kill + start ulang, bukan `curl` berulang.

## Status per 2026-09-29 (sesi ketiga, lanjutan setelah hard restart)

- HEAD tetap `993f957`, branch `main` **ahead 4**. Working tree **173 entri**. Commit+push
  tetap milik Rey.
- **Tiga defect nyata ditemukan dan diperbaiki**, semuanya di surface self-service auth
  yang justru baru shipped di commit `993f957`. Rinciannya di bawah.
- Gate akhir sesi ini: Jest **212 suite / 1504 test PASS**, `lint:check`, `web:typecheck`,
  `build`, `web:build` bersih, `wave3:esp32:self-test` PASS, `rescue:validate`
  **471/471**, `baseline:manifest:verify` **1124/1124 source paths, 1125/1125 entries**.

## TEMUAN Sesi Ketiga — 3 cacat di rantai self-service auth

1. **Registrasi tidak bisa diselesaikan sama sekali.** `AuthService.register` mengirim
   `Verification token: ${token}` — **token mentah, tanpa link** — dan `login` menolak
   `!user.isVerified`. Tapi tidak ada halaman yang menerima token itu: `/verifikasi`,
   `/verify-email`, `/konfirmasi-email` semuanya **404**. Bukti runtime: register 201 →
   verify 200 → login 403. Ditambah `apps/admin-web/app/verifikasi/page.tsx` (membaca
   `?token=` untuk jalur link, plus field tempel), ditautkan dari `/daftar` (pesan sukses)
   dan `/login`.

   **Kenapa lolos semua gate:** `scripts/run-rescue-auth-selfservice-flow.mjs` menulis token
   verifikasi **langsung ke database** (`prisma.user.update({ data: { verificationTokenHash,
   verificationTokenLookup } })`), bukan menebus token yang benar-benar diterbitkan
   `register`. Runner itu menguji proxy dan login, dan **melewati tepat hop yang rusak**.

2. **Sukses dilaporkan sebagai kegagalan.** `daftar`, `lupa-password`, `reset-password` membaca
   `event.currentTarget` dua kali: sekali untuk `FormData`, sekali lagi **setelah** `await`
   untuk `.reset()`. React mengosongkan `currentTarget` setelah handler yield → `.reset()`
   melempar ke dalam `catch` → halaman menampilkan `Cannot read properties of null (reading
   'reset')` **setelah request-nya sukses**. Terlihat live di `/daftar`: POST 201, user
   tercipta, notifikasi masuk — tapi UI bilang gagal. Efeknya: user mengulang, lalu dapat
   "user already exists", dan support mengejar backend fault yang tidak ada. Fix: capture
   elemen ke `const formEl` sebelum await.

3. **Akun self-service tidak punya Membership sama sekali.** `register` membuat User +
   UserCredential lalu berhenti. `TenantContextGuard` butuh membership `ACTIVE`, dan
   `PATCH /admin/tenant-users/:userId` meng-*update* membership yang ada — jadi tanpa baris
   itu, **akun tidak bisa dipromosikan sama sekali**, bukan sekadar tanpa hak. Fix: buat
   membership di transaksi registrasi dengan `role: 'MEMBER'`, `status: 'PENDING'`.

   **Sengaja TIDAK memberi ADMIN di registrasi.** Form pendaftaran hanya meminta UUID tenant,
   jadi memberi ADMIN = siapa pun yang tahu UUID tenant bisa mem-ESKALASI diri jadi admin.
   Promosi tetap keputusan admin lewat jalur user-management yang sudah ada. Diverifikasi:
   setelah verify sukses, login tetap **403** `Akun ini tidak memiliki akses ke konsol
   administrator`.

   Guard: `test/self-service-verification-reachability.contract.spec.ts` (14 test). Semua
   RED proven sebelum fix: 4 merah (halaman hilang), 3 merah (null-deref), 2 merah
   (membership).

## Jebakan baru yang sudah terverifikasi

- **`docker compose build api | tail` menutupi kegagalan build.** Build pertama gagal
  `TLS handshake timeout` ke registry-1.docker.io, tapi karena exit code-nya hilang di pipe,
  `&&` tetap lanjut, `up -d` cuma print `Container iot-rescue-api Running` (tidak recreate),
  dan digest tetap yang lama. Gejalanya: probe terhadap "image baru" menunjukkan bentuk
  pre-fix. **Selalu verifikasi isi container**, bukan cuma exit code:
  `docker exec iot-rescue-api grep -c 'PENDING' /app/dist/auth/auth.service.js`.
- **`git checkout <file>` membuang kerja yang hanya ada di working tree.** Saya menjalankan
  `git checkout test/contract-surface-policy.json` untuk memperbaiki format JSON, dan itu
  **menghapus 11 klasifikasi** yang hanya ada di working tree dari sesi yang terputus. HEAD
  hanya punya 81 entry; file itu berisi 92. Klasifikasi itu tidak ada di git, jadi tidak
  bisa di-restore — harus dibangun ulang dari output gate. Gunakan `git stash` atau salin
  keluar dulu, jangan `checkout`.
- **Probe yang salah kalibrasi lolos untuk alasan yang salah.** Probe membership sempat
  asserting login harus 403, padahal akunnya juga **belum terverifikasi** → login mentok di
  401 sebelum pernah sampai pemeriksaan role. Green karena alasan yang salah lebih berbahaya
  dari merah: probe harus menguji security property yang sebenarnya (verifikasi tidak
  memberi akses), yang berarti verify dulu lalu assert 403.
- **`rescue:validate` menolak halaman pre-login baru.** Halaman baru di luar shell menu gagal
  gate `every non-legacy product page is reachable from a shell menu`. Fix yang benar:
  tambah ke `PRE_LOGIN_ROUTES` di `scripts/validate-rescue-baseline.mjs` — bukan memaksakan
  masuk menu shell. `/verifikasi` memang tidak akan pernah ada di menu signed-in karena
  akun unverified tidak bisa punya sesi.
- **Spec baru di `test/` WAJIB didaftarkan di `test/contract-surface-policy.json`** —
  `historical-contract-transition-safety.contract.spec.ts` gagal dengan `UNCLASSIFIED_CONTRACT`.
  Klasifikasi benar untuk guard atas perilaku saat ini: `stable-contract`. Dan **edit JSON
  itu secara tekstual** (patch), jangan tulis ulang dengan `json.dumps` — itu mengurutkan ulang
  key dan menghasilkan diff 13 baris, bukan 1.

## Status per 2026-09-29

- HEAD `993f957`, branch `main` **ahead 4** dari `origin/main`. Commit+push tetap milik Rey.
- **Working tree jauh lebih besar dari yang versi checkpoint sebelumnya menulis.** Angka
  sebenarnya per 2026-09-29: 149 entri berubah, +6034/−1948, termasuk yang sebelumnya tidak
  tercatat sama sekali:
  `src/rbac/{rbac-permission-catalog,owned-resource.resolver,rbac-audit.service,resource-ownership}`,
  `src/admin-operations/admin-governance.*`, `src/notification/notification.controller.ts`,
  `scripts/audit-ui-sweep.mjs`, `scripts/seed-demo-accounts.mjs`, plus 5 spec baru di `test/`.
  Baca `git status --porcelain` untuk angka sebenarnya; jangan percaya ringkasan lama.
- Wave 3 V5 QEMU tetap hijau di GitHub dan **tidak** dibuka lagi. Blocker push sebelumnya
  (kuota artifact GitHub) bukan defect Wave 3.

## Temuan & perbaikan sesi 2026-09-29 (semua terverifikasi di browser nyata)

1. **Widget Workspace tidak pernah menampilkan angka.** `GET /dashboards/:id/widgets/:widgetId/data`
   ada di backend dan sudah dipakai `apps/user-web`, tapi admin-web tidak punya proxy-nya.
   `/tenant/workspace` hanya me-render kind + judul + device id. Ditambah proxy + `WidgetCard`
   yang memuat pembacaan per widget. Bukti: "GAUGE / Siap / Suhu / 24,6 C" dari telemetri asli.

2. **Tombol hapus Workspace tidak pernah bisa bekerja** (cacat lama, sudah ada di HEAD, bukan
   regresi). `DELETE /dashboards/:id` mewajibkan `expectedRevision`, proxy tidak pernah
   mengirimnya → selalu 400 "numeric string is expected". Diperbaiki: proxy mewajibkan dan
   meneruskan token, UI mengirim revision dari baris yang tampil, 409 ditampilkan apa adanya.
   Token **tidak** di-default di mana pun — itu satu-satunya yang melindungi klik basi.

3. **`ToastProvider` tidak pernah di-mount.** `useToast()` jatuh ke default `{push(){}}`,
   jadi enam layar (scenes, spaces, device groups, schedules, automations, dst) melaporkan
   sukses/gagal hanya ke console. Di-mount di `app/layout.tsx`. Bukti visual: toast hijau
   `Grup "Bukti Toast Visual" dibuat.` muncul di kanan-bawah.

4. **Read aggregate dashboard tidak aman untuk round-trip.** `GET /dashboards/:id` mengembalikan
   `layouts[].items` dan `widgets[].bindings` **tanpa `layoutId`/`widgetId`**, sedangkan DTO write
   mewajibkannya sebagai `@IsUUID` di array datar — read-modify-write gagal
   "Request validation failed". Diperbaiki: `toAggregateResponse` kini mengecho parent id.

5. **Ikon bottom-nav mobile-preview kosong.** kelima tab (`Home`/`Devices`/`Realtime`/`Alerts`/
   `Profile`) punya `icon: ''`, jadi merender `<span>` kosong di atas label. Diganti ikon
   lucide nyata. Bukti: kelima tombol punya SVG 16×16, 0 span kosong.

6. **Riwayat perintah tidak bisa dibuka.** `GET /devices/:id/commands/:commandId` sudah
   lengkap, RBAC, dan ter-cover test di backend sejak modul command meluncur — tapi tidak ada
   BFF dan tidak ada UI, jadi `SENT`/`ACKED` adalah satu-satunya informasi yang terlihat.
   Ditambah proxy + panel detail. **Jebakan yang harus dihindari:** `DeviceCommand` punya DUA UUID
   berbeda — `id` dan `correlationId` — dan service mencari berdasarkan `correlationId`
   saja. List proxy dulu hanya mengirim `id`, jadi drill-down akan 404 di setiap klik.

7. **Dashboard round-trip (lanjutan #4).** Ditambah `layoutId` pada tiap layout item dan
   `widgetId` pada tiap binding, tepat di `toAggregateResponse`. Fields bersifat aditif —
   tidak ada field lama yang dibuang.

8. **Platform dispatch tidak mencatat penolakan.** `POST /admin/platform-commands/dispatch`
   (super admin → device dalam tenant yang disebut eksplisit) hanya menulis audit row untuk
   dispatch yang BERHASIL dan yang gagal saat publish. Penolakan validasi (tanpa tenantId/
   deviceId, tanpa reason, device milik tenant lain) **tidak menulis apa pun** — padahal itu
   percobaan yang paling perlu terlihat: super admin yang memprobing batas tenant terlihat
   seperti riwayat bersih. Ditambah `recordDispatchRejection` (best-effort — kegagalan audit
   TIDAK boleh mengubah penolakan jadi 500 yang tampak retryable) + 14 test, karena
   `dispatchPlatformCommand` sama sekali tidak punya spec.

9. **Audit action salah untuk 7 dari 8 permission.** `RbacPermissionGuard.actionFor` menguji
   `permission.startsWith('read')`, tapi format permission adalah `<resource>.<action>`
   (`dashboard.read`), jadi prefix-nya `dashboard` dan **tidak ada yang cocok** — semua jatuh
   ke fallback `'UPDATE'`. Akibatnya pemilik yang menghapus dashboard menulis audit row
   `UPDATE`, dan `read` tidak bisa dibedakan dari tulis. Lolos karena spec guard hanya
   menguji `automation.update`, satu-satunya permission yang sufiksnya sama dengan fallback.
   Diperbaiki jadi mapping by suffix + 6 test baru (RED terverifikasi: 4 gagal di kode lama).

## Koreksi: angka cakupan sebelumnya salah

Saya sempat melaporkan "28 file sumber tanpa test". Itu **salah** — grep saya case-sensitive
dan hanya melihat `test/`, tidak `src/*.spec.ts`. Angka sebenarnya **14**, dan RBAC slice
(`rbac-permission-catalog.ts`, `rbac-permission.guard.ts`) **sudah punya spec yang baik**.
Pelajaran: ukur denominator dengan benar sebelum menyimpulkan ada gap.

14 file sisanya: 10 komponen UI (admin-web/user-web shells & panels) dan
`notification.controller.ts` + `notification.module.ts` + 2 controller yang sudah dijaga
guard. `notification.controller.ts` sudah diperiksa manual: read-only, tenant-scoped,
`findForOperator` fail-closed (`{ id, tenantId }` → 404). Tidak ada defect di sana.

10. **`GET /devices` membocorkan hash provisioning token.** `DeviceService.findAll`/`findOne`
    memanggil Prisma tanpa `select`, jadi SETIAP kolom skalar pada model `Device` ikut keluar —
    termasuk **`provisioningTokenHash`**, hash argon2 dari token provisioning. Terbukti di
    runtime: 3 dari 5 device mengirim `$argon2id$v=19$…` ke endpoint yang tugasnya hanya
    mendaftarkan device. `ownerId` dan `tenantId` juga bocor. Nol konsumen di `apps/`.
    Diperbaiki dengan **allowlist** `PUBLIC_SELECT` (bukan denylist: kolom rahasia berikutnya
    otomatis tertutup), plus `findInternal` privat untuk jalur yang memang butuh hash.
    Bukti setelah perbaikan: 7 kolom, 0 bocor; pairing tetap jalan (201 dengan token benar,
    401 dengan token salah). RED terverifikasi — 5 test gagal saat `select` dilepas.

11. **Kelas kebocoran kolom kredensial sudah ada guardnya.**
    `test/credential-column-exposure.contract.spec.ts` menjaga 7 model yang membawa
    credential (Device, User, UserCredential, DeviceCredential, ApiKey, RefreshToken,
    WebhookEndpoint). Guard ini berdasarkan **hasil read**, bukan query: yang dicari adalah
    `return prisma.<model>.findX()` langsung dan `return <var>`/`...spread` dari read tanpa
    `select`. Alasannya penting — versi pertama menandai **16 site**, dan setelah dibaca satu per satu
    semuanya ternyata aman: existence check (`if (!device) throw`), verifikasi internal, dan
    metode `private`. Guard yang menyala di kode benar akan membuat tim menambah `select`
    di mana-mana sampai guard berikutnya direwrite ke bentuk yang mengabaikannya.
    Guard menolak **denylist** (sudah dibuktikan: menyuntik `ownerId: false` ke
    `PUBLIC_SELECT` membuat test RED). Ini disengaja — denylist membuat kolom rahasia
    berikutnya lolos tanpa ada yang ingat.
    Mutasi terbukti: hapus `select` → 4 test RED. Allowlist + `findInternal` private → 17/17.

12. **Super-admin login memakai tenant "Platform Operations", bukan tenant demo.**
    `11111111-1111-4111-8111-111111111111` (platform) vs `22222222-…` (Hotel Aurora).
    Mengirim `tenantId` tenant demo untuk akun super-admin memberi 401 — itu **benar**
    (auth fail-closed), bukan bug. `/admin/*` sama sekali tidak terindeks oleh tenant demo.

13. **Tenant isolation di query layer punya guard: `test/tenant-isolation-at-query-layer.contract.spec.ts`.**
    Chassis Importance: allowlist harus **per-method**, bukan per-file. Versi pertama allowlist
    per-file, dan sebuah mutasi membuktikan itu salah: menghapus `tenantId` dari `where`
    `TelemetryService.getHistory` **tetap hijau**, karena file-nya sudah allowlist dan tidak
    ada pemeriksaan lanjutan. Pengecualian per-file berarti setiap read berikutnya di file itu
    juga dikecualikan — kebalikan dari tujuan guard.
    Dua blind spot yang ditemukan lewat mutasi, keduanya sudah ditutup:
    - **`tenantId` di signature bukan bukti.** Method dengan `tenantId: string` bisa kehilangan
      semua scoping dan tetap lolos. Bukti harus di dalam body: `where: { ..., tenantId }`,
      `ensureDeviceInTenant(tenantId, …)`, atau post-filter `x.tenantId !== tenantId`.
    - **Signature ikut cocok sebagai bukti.** Pola `\btenantId\s*[,:}]` match pada
      `tenantId: string` di parameter list dan pada kata `where`, jadi `getHistory` yang
      **sudah kehilangan** `ensureDeviceInTenant` tetap lolos. Bukti wajib setelah `{` body.
    Bentuk scoping yang dipakai repo ini, semuanya dibaca satu per satu: sibling query yang
    throw 404, helper `ensureDeviceInTenant`, post-filter, `where` filter, dan primary key
    dari record yang sudah ter-scope. Tidak ada read lintas-tenant yang tidak diklasifikasi.

## Audit parity dua arah — SUDAH TUTUP (denominator lengkap, 2026-09-29)

- **Backend → BFF:** 127 route handler. 11 tidak terjangkau proxy, **semuanya bukan surface
  UI secara desain**: `/health/*`, `/metrics`, webhook EMQX (`/mqtt/auth|acl|ack`,
  `/mqtt/webhook/telemetry`), `/auth/refresh` (dipakai proxy secara internal), `/` (root).
  `GET /analytics/alerts/accessible` sempat tampil orphan tapi **dipakai user-mobile**
  (`apps/user-mobile/src/device-control/mobile-device-client.ts:194`).
- **BFF → UI:** 80 route proxy, **80/80 punya pemanggil UI, 0 orphan**.

Empat iterasi matcher saya salah sebelum sampai di angka ini, dan itu sendiri pelajaran:
`@Controller('a')` + `@Get('b/:id')` harus digabung dengan `/`; `${...}` di path proxy itu
query string, bukan segmen; lookbehind `(?<!api)` menolak path yang justru valid; dan
dynamic segment harus menerima `encodeURIComponent(...)`/template multi-baris. 8 "orphan"
terakhir semuanya false positive — memakai variabel `base` (`user-actions-modal.tsx:63`),
variabel `operation` yang dihitung (`tenant-automation-content.tsx:392`), atau template
literal multi-baris.

**Jangan tambah guard regex "proxy ini punya pemanggil"** — saya sudah membuktikan matcher
itu tidak bisa dipercaya, dan guard seperti itu akan jadi dekorasi yang hijau.

## Round-trip dashboard — terbukti ulang di build hari ini

`GET aggregate → flatten → PUT aggregate` **10/10 PASS** terhadap container yang berjalan:
PUT 200, `revision` naik 1→2, widget ada di re-read, dan
`GET /dashboards/:id/widgets/:widgetId/data` mengembalikan reading nyata.
Bukti visual: `/tenant/workspace` menampilkan **"1 widget"** dengan kartu
`GAUGE | Kosong | Suhu Lobby Light Panel | 33333333… · lightBrightness`.

Tiga kesalahan probe saya di sini, semuanya karena **tidak baca DTO sebelum menulis payload**:
1. Kirim bentuk nested → 400 `name must be a string`. DTO write itu **FLAT**:
   `name` + `layouts[]` + `widgets[]` + `layoutItems[]` + `bindings[]` + `expectedRevision`.
   `toWritePayload` di `apps/admin-web/components/tenant-dashboard-editor.ts:118` sudah benar.
2. Kirim `capabilityKey` → 400. `DashboardBindingDto` mau **`capabilityId` (UUID)**, plus
   `alias`, `intent` (`READ|REPORT|WRITE`), `mode` (`DEVICE_STATUS|LATEST|HISTORY|AGGREGATE|COMMAND`).
3. `const` dipakai sebelum dideklarasi → ReferenceError.

Widget GAUGE yang terikat ke capability boolean tampil sebagai **"Kosong"** — itu fail-closed
yang benar (GAUGE butuh numerik), bukan crash.

## Empat defect di `run-rescue-auth-selfservice-flow.mjs` — runner yang hijau tanpa arti

Runner ini melaporkan **16/16 PASS** pada stack yang registrasinya masih tidak bisa
diselesaikan. Empat penyebab, semuanya "hijau yang tidak berarti":

1. **Runner menebus token buat sendiri.** `prisma.user.update({ data: { verificationTokenHash,
   verificationTokenLookup } })` menimpa field yang baru diisi `register`, pakai token yang ia
   karang. Yang terbukti: proxy dan `verifyEmail` bekerja. Yang tidak: token yang benar-benar
   diterima user bisa ditebus. Hop yang hilang persis di antara keduanya. Diganti: baca
   `notification.body` (byte-per-byte sama dengan isi email), ekstrak token, assert notifikasi
   terkirim dan token-nya bisa dipakai orang. Header runner sudah menjanjikan "tidak
   bergantung pada TTL Redis" — sekarang benar.
2. **Cleanup bocor tiap run, sambil report PASS.** `user.deleteMany(...).catch(() => null)` +
   `user_credentials` tanpa cascade → FK violation yang ditelan. Terukur setelah satu run:
   1 user, 1 credential, 2 notifikasi, 1 tenant tertinggal. Sekarang cleanup diverifikasi dengan
   **menghitung sisa baris**, dan kebocoran adalah FAIL.
3. **`deleteMany` tidak menerima compound unique.** `where: { email_tenantId: {...} }` hanya
   valid untuk operasi singular (`findUnique`/`update`/`delete`); pada `deleteMany`/`count` itu
   invocation error. Inilah akar kebocoran #2 — bukan FK. Ditemukan dengan **menjalankan**,
   karena jalur "FK" adalah buntu: baris dependen sudah terhapus, delete tetap gagal. Fix:
   `where: { email, tenantId }` (keduanya kolom skalar).
4. **Runner tidak deterministik.** Rate limit auth = 10/60s di-Redis, di-key per
   `sha256(path:ip)`, dan `clearLoginLockout` **tidak** menyentuhnya. Run kedua dalam semenit
   → `429` pada "the new password works". Fix: SCAN + DEL seluruh prefix
   `iot:rate-limit:auth:*` (bukan menyalin daftar path, yang pasti drift).

**Mutasi terbukti load-bearing:** hapus `apps/admin-web/app/verifikasi/` → runner **RED**
`FAIL a page exists to accept the token (GET /verifikasi) :: status=404`. Dipulihkan
byte-identik (golden copy) → **22/22 PASS**. Dua run berturut-turut: 22/22 + 22/22, nol
kebocoran di 5 tabel.

Guard: `test/self-service-auth-runner-honesty.contract.spec.ts` (7 test, semua RED proven).

## Jebakan baru yang sudah terverifikasi

- **`--testPathIgnorePatterns` di CLI MEANGGANTI daftar config, bukan menambah.** Saya
  memakainya untuk menguji hipotesis "warning worker ini dari spec baru"; hasilnya 5 suite
  `*.integration-spec.ts` yang normally dikecualikan ikut masuk dan gagal, dan total suite naik
  dari 213 ke 229. Bukan regresi — artefak flag. Angka otoritatif tetap run default.
- **Tidak boleh `expect`-kan hasil yang hijau karena alasan yang salah.** Dua kali dalam sesi ini
  Cleanup check pertama saya mencatat baris yang **berhasil dihapus** sebagai kebocoran
  (logika terbalik), dan probe membership sempat asserting 403 padahal akunnya belum
  terverifikasi sehingga mentok di 401 duluan. Keduanya hijau. Verifikasi lewat **menghitung
  sisa**, dan pilih security property yang sebenarnya.

## Jebakan yang sudah terverifikasi (jangan diulang)

- **`DeviceCommand` punya dua UUID.** `id` (primary key) dan `correlationId` (@unique) —
  nilainya SELALU berbeda. `CommandService.getByCorrelationId` mencari hanya
  `correlationId`. Membangun drill-down dari `id` = 404 di setiap klik.
- **Backend IoT = container Docker `iot-rescue-api`, BUKAN proses desktop.** Nama
  *service* di compose adalah `api`; `iot-rescue-api` itu `container_name`, jadi
  `docker compose ... up -d --build iot-rescue-api` gagal dengan "no such service" dan
  tidak melakukan apa pun. Yang benar:
  `docker compose -f docker-compose.rescue.yml build api` lalu
  `docker compose -f docker-compose.rescue.yml up -d --no-deps api`. Tidak butuh sudo.
  Kode ter-**baked di dalam image** (tidak ada bind-mount ke `/app`), jadi `--build` WAJIB —
  `docker restart` saja akan menjalankan image lama dan hasil probe akan terlihat seolah
  perbaikannya gagal.
- **Probe yang sebagian gagal HARUS gagal keras.** Sweep secret sempat melaporkan
  "0 findings" padahal sesi super-admin gagal login dan `/admin/*` tidak terindeks sama
  sekali. Sekarang exit non-zero. Sama seperti probe "0 devices" yang dulu menyamar jadi
  direktori kosong.
- **Seed demo ME-RESET password setiap kali dijalankan.** Probe yang pakai password lama
  diam-diam dapat 401 dan melaporkannya sebagai "0 device" —tampak seperti fix mengosongkan
  direktori. Probe wajib gagal keras kalau read-nya bukan 200.
- **Probe yang mengubah state harus mengembalikan state.** `provision` + `pair` memindahkan
  device ke PAIRED dan menulis baris `device_credentials`. Dikembalikan lewat SQL langsung
  (`DELETE` credential + `UPDATE` status), bukan seed — seed tidak menyentuh device itu.
- **Prisma map ke nama tabel lowercase.** Tabelnya `devices` / `device_credentials`, bukan
  `"Device"`. `psql -c` dengan quote bersarang mudah salah; tulis `.sql` lalu `docker cp`.
- **Permission RBAC berformat `<resource>.<action>`, bukan `<action>.<resource>`.**
  `dashboard.delete`, bukan `delete.dashboard`. Mapping yang salah diam-diam jatuh ke
  fallback dan tetap terlihat "hijau" — itulah bug yang sudah diperbaiki di `actionFor`.
  Kalau suatu saat menambah permission, cek sufiksnya.

- **Nilai `revision`/`layoutId`/`widgetId` yang hilang di read aggregate** — lihat di atas.
  Jangan menyimpulkan read-modify-write aman hanya karena GET-nya 200.
- **Jangan menebak DTO dari nama field.** `ReplaceDashboardDto` bukan `CreateDashboardDto`:
  yang pertama menolak `audience` (immutable) dan meminta `expectedRevision`, bukan
  `revision`. Nama enum juga berbeda dari tebakan biasa: `breakpoint` =
  `DESKTOP|TABLET|MOBILE`, `intent` = `READ|REPORT|WRITE`, `mode` =
  `DEVICE_STATUS|LATEST|HISTORY|AGGREGATE|COMMAND`. Selain itu `GAUGE` butuh capability
  numerik **plus** `presentationConfig.min`/`.max`, kalau tidak ditolak
  `DASHBOARD_WIDGET_RESOLUTION_INVALID` — jadi seeding dashboard gagal dalam tiga tahap
  berurutan sebelum akhirnya berhasil.
- **`rescue:validate` dan `baseline:hygiene:clean` tidak boleh dijalankan bersebelahan.**
  hygiene menghapus artefak build yang masih dibaca validator → `FAILED` palsu. Urut: hygiene
  dulu, baru validator.
- **Bodyless DELETE + header `content-type: application/json` → 400** "Body cannot be empty".
  Ini yang dilakukan probe, bukan perilaku proxy UI. Skrip yang menghapus lewat API tidak
  boleh mengirim content-type pada DELETE.
- Melihat halaman lewat `browser_snapshot` **segera setelah navigate** bisa membaca state
  sebelum fetch selesai. Tunggu ~5 detik, lalu baca ulang.
- **Halaman kosong tanpa error JS ≠ crash.** `/tenant/grup-perangkat` pernah tampil 161
  karakter body karena cookie sesi habis → gate "Akses admin tenant diperlukan" yang
  dirender, bukan React error. Cek `document.body.innerText` dan `js_errors` dulu.
- **`browser_console` harus dipakai dalam konteks `location` yang valid.** `fetch('/api/...')`
  relatif gagal di tool; pakai path yang sama seperti di form.
- **`console.log` stub sebagai "toast"** — grep `const toast =` di komponen apa pun; kalau
  isinya `console.log`, itu stub, bukan notifikasi.
- `apps/admin-web/.env` tidak boleh dibaca lewat read_file (secret-bearing). Port API
  benchesoekan dari `^PORT=` di `.env` repo.
- Credential demo **di-regenerate tiap `seed-demo-accounts.mjs`** — password yang dicatat di
  catatan lama tidak berlaku. Jalankan ulang seed dan baca outputnya.

## Bukti hijau (lokal, 2026-09-29)

- Jest penuh: **209 suite / 1470 test PASS**.
- `lint:check`, `web:typecheck`, `build`, `web:build` bersih.
- `npm run wave3:esp32:self-test` PASS. `npm run rescue:validate` **471/471 PASS**.
- `baseline:manifest:verify` **1117/1117** source paths, **1118/1118** manifest entries.
- Browser nyata (bukan asumsi): Workspace menampilkan "24,6 C" dari telemetri MQTT asli dan
  "Kosong" (bukan "false") untuk widget tanpa data; delete 200 hilang dari daftar; delete
  dengan revision basi ditolak 409 dan dashboard tetap ada; toast hijau muncul di layar;
  kelima tab mobile-preview punya ikon; baris riwayat perintah membuka panel berisi
  correlation id, "Di-ACK: belum", "Latensi ACK: belum ada ACK", dan payload apa adanya.
- **Round-trip dashboard terbukti end-to-end setelah backend di-restart.** Container
  `iot-rescue-api` di-build ulang dan probe read→flatten→write **tanpa penambalan manual
  parent id** sekarang **200** (sebelumnya 400). Bandingkan: sebelum restart,
  `layoutItem.layoutId` dan `binding.widgetId` ABSENT; sesudahnya keduanya ada.

## Cakupan test — angka, bukan verdict (per 2026-09-29)

Working tree uncommitted: **160 entri, 118 file berubah, +6906/−2020**. Dari file `.ts/.tsx`
yang berubah, dipisah secara jujur:

- **28 spec file** — ini sendiri adalah test, bukan cakupan yang hilang.
- **1 generated** (`next-env.d.ts`).
- **76 file** namanya disebut di spec mana pun (`test/` atau `src/*.spec.ts`).
- **NOL file sumber tanpa spec lagi.** Ke-14 file yang tersisa sudah ditutup:
  - **10 komponen UI** → `test/console-fail-closed-surfaces.contract.spec.ts` (41 test).
    Invariant: `null` = "tidak diketahui", `[]`/`0` = "dikosongian memang". Nol
    `useState([])` di kesepuluh file. `super-roles-content.tsx` yang paling rumit: 4 sumber
    data, 3 di degrade independen, tiap render bercabang di `=== null`.
  - `src/notification/notification.controller.ts` + `.module.ts` → diperiksa manual,
    read-only + tenant-scoped + `findForOperator` fail-closed. Bukan data surface.
  - `src/admin-operations/admin-governance.controller.ts`, `src/device/device.controller.ts` →
    dijaga `rescue:validate` (scan statis guard + `@RequirePermission`).

**Catatan penting:** 10 komponen UI itu Turns out **sudah benar** — tidak ada defect live.
Yang saya kerjakan adalah mengunci invariant-nya, bukan memperbaiki bug. Yang tersisa tinggal
1 file UI (`apps/admin-web/app/mobile-preview` sudah di sesi sebelumnya) plus artefak
`?? .hermes-none` (file kosong 0 byte, bukan disengaja) yang layak dihapus.

## Yang masih butuh Rey

1. Commit + push (main sudah 4 commit di depan origin, dan working tree 160 entri).
2. VPS / akun Midtrans / board ESP32 / kamera IP — gate acquisition, bukan kode.
3. `project-config.json` `releasePolicy.iosFinalReleaseGateAfterModule` — keputusan kebijakan.

## Langkah saat "lanjut iot"

Baca blok ini dulu, lalu `CURRENT-STATE.md` (blok paling atas) lalu
`docs/ENTERPRISE-WAVE-ROADMAP.md`. Wave 3 V5 QEMU sudah hijau di GitHub — jangan dibuka
lagi kecuali ada bukti kegagalan baru. Bukti berat (ESP-IDF/QEMU/EMQX/full acceptance)
hanya sah dari GitHub CI.

Untuk menyalakan konsol lokal: seed dulu (`node scripts/seed-demo-accounts.mjs`, catat
password barunya), lalu `npx next dev --port 5001` di `apps/admin-web`. `npm run dev` di
workspace itu meng-hardcode port 3100 dan mengabaikan `PORT=`.

## 2026-09-29 — Dashboard editor selesai, diverifikasi end-to-end

**Empat defect nyata ditemukan lewat runtime, bukan static reading:**

1. `PUT /dashboards/:id` 500 dan stale revision 500 (bukan 409).
   `description: null` lolos dari `!== undefined` lalu `.trim()` dipanggil → `TypeError` → 500.
   Ada di DUA tempat: `validateAggregateInput` dan `normalizeDescription`. Fix pertama hanya
   menutup yang pertama — test masih merah sampai yang kedua ikut diperbaiki.
   Mutasi (kembalikan ke `=== undefined`) → test merah dengan pesan asli.
   `src/dashboard/dashboard-replace-null-description.spec.ts` (4 test).

2. Route create mengirim `layouts: []`. Layout item wajib punya parent layout, jadi setiap
   workspace dari UI tidak bisa diedit. Default DESKTOP grid (12/8/12) sekarang dikirim.

3. BFF tidak punya route aggregate maupun PUT. Editor mem-load `/resolution` (read model,
   tanpa layout) → `TypeError: aggregate.layouts is not iterable` di browser.
   `app/api/tenant/dashboards/[dashboardId]/aggregate/route.ts` (GET + PUT) dibuat.

4. **Ditemukan lewat browser, bukan baca kode:** setelah tambah widget + simpan sukses,
   grid tetapmenampilkan "0 widget". `onClose` hanya memanggil `load()` yang me-refresh `rows`,
   bukan `resolution`. Guard baru termination-proven: hapus `open(wasOpen)` → 2 test merah.

**Dua defect UX yang ketahuan saat verifikasi browser:**
- Capability tidak termuat untuk binding pertama (hanya saat device diganti).
  Fix: `loadCapabilities(device.id)` saat binding dibuat.
- Toast error hilang sebelum operator membaca "Gauge widgets require a numeric capability".
  Fix: banner `role="alert"` persisten + tetap Dirty + toast.

**Bukti browser (workspace nyata, bukan mock):**
- create → 1 workspace, editor buka "Edit: Editor UI Probe", rev 1
- widget GAUGE + binding ke Lobby Sensor/temperature → Simpan → **rev 2**, banner hilang, dirty hilang, toast "Workspace disimpan."
- tutup editor → "1 widget", card: `GAUGE | Siap | Widget 1 | temperature | data1 | 24,6 C`
- error path: GAUGE + lightPower → 400 `DASHBOARD_WIDGET_RESOLUTION_INVALID`, banner menampilkan
  "Gauge widgets require a numeric capability | Perubahanmu belum tersimpan."
- stale revision → 409 (API probe)

**Gate (semua hijau, dijalankan setelah semua perubahan):**
- Jest **211 suite / 1490 test**
- rescue:validate **471/471**
- Wave3 ESP32 source self-test PASS
- manifest **1122/1122 source paths, 1123/1123 entries**
- lint:check, web:typecheck, build, web:build bersih
- 3 file `.next`/`dist` dihapus oleh `baseline:hygiene:clean` (artefak build saya, bukan kode)

**Catatan urutan:** `hygiene:clean` menghapus artefak yang dibaca `rescue:validate` dan
`manifest:verify`. Urutan benar: clean → rescue → manifest:generate → manifest:verify.

**Mutation test untuk dua guard keamanan — sudah dikerjakan, semua terbukti merah:**

| Guard | Mutasi | Hasil |
|---|---|---|
| `credential-column-exposure` | hapus `select` dari public read | **2 merah** / 16 hijau |
| `credential-column-exposure` | allowlist → denylist | **1 merah** / 17 hijau |
| `tenant-isolation-at-query-layer` | eksempti file-level (`method: '*'`) | **2 merah** / 3 hijau |
| `tenant-isolation-at-query-layer` | `scopingCall` → `Math.random` | **1 merah** / 4 hijau |

Artinya guard credential membedakan allowlist dari denylist (bukan sekadar grep nama kolom
terlarang), dan guard tenant benar-benar method-level + memverifikasi scoping call ada di
method. Kegagalan `method: '*'` itu persis kesalahan yang pernah lolos sebelumnya.
Semua sumber dipulihkan byte-identik dan diverifikasi ulang lewat 1490 test.

## Module 18 Device Sharing: REST surface selesai (2026-09-29, owner override)

Rey memberi izin melewati Wave 3 dan mengerjakan sisanya. Module 18 adalah yang paling
menentukan, karena itu mata rantai yang hilang di "user controlling device".

**Yang ditemukan — bukan ada di UI, tapi tidak ada di kodenya sama sekali:**

`src/sharing/` hanya punya `device-share.service.ts` + spec + module — **tidak ada
`*.controller.ts`**. Service-nya sendiri lengkap dan sudah diuji (bounded expiry ≤ 90 hari,
`maxActiveGrantsPerDevice: 20`, anti self-grant, audit row per mutasi), tapi `createGrant`
**tidak punya pemanggil di luar spec-nya sendiri**. Sisi yang *mengonsumsi* grant
(`DeviceAccessService.hasAccess`) sudah hidup sejak awal — itu sebabnya MEMBER bisa kirim
command begitu satu baris ada di DB. Yang tidak ada adalah sisi **produsennya**.

Konsekuensinya persis seperti yang saya laporkan sebelumnya: satu-satunya cara membuat share
adalah menyuntik `device_share_grants` langsung. Dan `module-18-completion-review.md:24-27`
mendaftarkannya sebagai **Deferred** ("Invitation flow, REST API, audit-log query surface") —
jadi ini gap yang **dideklarasikan**, bukan yang tersembunyi.

**Yang dikerjakan:**

| File | Perubahan |
|---|---|
| `src/sharing/device-share.controller.ts` | baru — `POST/GET/DELETE /devices/:id/shares` |
| `src/sharing/dto/create-device-share.dto.ts` | baru — validasi shape |
| `src/sharing/device-share.service.ts` | tambah `listGrants` (surface baca, butuh id grant untuk revoke) |
| `src/sharing/sharing.module.ts` | daftarkan controller |
| `src/common/errors/error-code.ts` | 6 kode `SHARE_*` |
| `src/admin-operations/admin-user-provisioning.service.ts` | expose `membershipId` di `listTenantUsers` |
| `apps/admin-web/app/api/devices/[deviceId]/shares/route.ts` | baru — BFF GET + POST |
| `apps/admin-web/app/api/devices/[deviceId]/shares/[grantId]/route.ts` | baru — BFF DELETE |
| `apps/admin-web/components/device-share-panel.tsx` | baru — panel operator |
| `apps/admin-web/components/device-detail-content.tsx` | pasang panel |
| `src/sharing/device-share.controller.spec.ts` | 12 test |
| `test/admin-web-bff-content-type.contract.spec.ts` | 4 test |

**Dua keputusan yang perlu dicatat:**

1. **Permission `device.update` dipakai ulang**, bukan permission baru `device.share`.
   `rbac-permission-catalog.ts` di-pin dua arah ke decorator `@RequirePermission` oleh
   `rbac-permission-catalog.spec.ts`; menambah string baru mengubah kontrak otorisasi,
   bukan hanya memperluas surface yang sudah ada.
2. **Service melempar `Error` biasa dengan `.code`, bukan domain exception.**
   `GlobalExceptionFilter` hanya memetakan `HttpException` (`global-exception.filter.ts:82`),
   jadi tanpa penerjemahan setiap penolakan akan sampai ke klien sebagai **500
   INTERNAL_ERROR** — kesalahan klien yang dilaporkan sebagai kegagalan server. Controller
   menerjemahkan keenam kode ke 400/404/409.

**Dua bug yang saya buat sendiri, ditemukan lewat verifikasi bukan lewat reading:**

- **BFF tanpa `content-type: application/json`.** Gejalanya menyesatkan: parser backend
  memberi `undefined`, sehingga *setiap* field DTO gagal validasi dan klien menerima
  `VALIDATION_FAILED` dengan daftar enum **kosong** — terlihat seperti "nilai yang dikirim
  salah" padahal nilainya tidak pernah dibaca. Backend langsung dengan body identik membalas
  201. Ternyata `automations/[automationId]/route.ts` pernah kena bug yang sama dan sudah
  diperbaiki sebelumnya — pola yang sudah pernah dibayar sekali.
  Sekarang ada gate `test/admin-web-bff-content-type.contract.spec.ts`.
- **`membershipId` tidak pernah diekspos ke UI.** `listTenantUsers` me-select
  `memberships: { role, status }` tanpa `id`, jadi UI **tidak mungkin** menyusun permintaan
  share. Ditambahkan secara additive.

**Heuristik gate versi pertama terlalu kasar dan saya perbaiki dua kali** — pertama menandai
`commands/route.ts` (yang hanya *membaca* body lalu meneruskan ke `sendDeviceCommand` yang
sudah set header di `device-control.ts:60`), lalu menandai
`automations/[automationId]/route.ts` (yang sudah benar) karena window 700 karakter melintasi
batas antar-panggilan. Versi final memakai pencocokan kurung seimbang, dan dua test
membuktikan detektornya bukan vakum.

**Bukti runtime (lewat UI, bukan API):**

Cabut → "Dicabut 29/9/2026" → anggota muncul lagi di dropdown → Bagikan → "Aktif, berlaku
sampai 6/10/2026". Dan lewat HTTP (`scratch/share-e2e.mjs`): MEMBER 403 saat membuat share,
403 saat control sebelum di-share, admin 201, MEMBER `GET /devices` count=1, MEMBER command
**201** + `correlationId`, expiry lampau **400 SHARE_EXPIRY_INVALID**, revoke 200, MEMBER 403
lagi. Share uji sudah dihapus (DB bersih).

## Jebakan runtime yang baru terverifikasi

- **Kontainer `iot-rescue-api` dibangun dari image tanpa mount source.**
  `docker-compose.rescue.yml:62-64` memakai `build: { context: ., dockerfile:
  ops/docker/Dockerfile.rescue-api }` tanpa volume mount. Setelah mengubah kode backend,
  `docker restart` **tidak** cukup — harus `docker compose -f docker-compose.rescue.yml build
  api` lalu `up -d api`. Kalau tidak, rute baru membalas `404 Cannot GET/POST ...` padahal
  kodenya sudah benar dan `npm run build` hijau. Ini sempat membuat saya mengira controller
  saya tidak ter-register.
- **Menjalankan full Jest me-rotate seed demo.** `test/demo-seed-reentry.contract.spec.ts`
  menjalankan `npm run demo:seed` sungguhan, jadi **semua password demo berubah** setelah
  suite. Setelah menjalankan Jest, selalu `npm run demo:seed` lagi sebelum login. Dan
  `npx ts-node prisma/seed.ts` bukan perintah yang benar untuk akun demo — itu butuh
  `PLATFORM_ADMIN_PASSWORD` dan gagal keras.

## Putaran 2 — Module 19 (Organization) + Module 20 (audit query), 2026-09-29

Owner memberi izin: kerjakan semuanya, jangan jadikan alat fisik penghalang, dan
**selalu update checkpoint ini setelah tiap unit kerja** supaya konteks hilang kalau
komputer mati. Tiga aturan itu saya pegang mulai sekarang.

**Pola yang terpetakan dari putaran 1:** empat modul enterprise punya service lengkap +
spec, tapi **nol controller**. `createOrganization`, `addBranch`, `listBranches`,
`createApiKey`, `revokeApiKey` semuanya tidak punya pemanggil di luar spec-nya. Persis
pola `createGrant` yang saya temukan di Module 18. Jadi ini bukan kasus satu — ini
**satu bug arsitektural yang diulang lima kali**, dan akar masalahnya sama: modul
di-rancang sampai "service + schema + test" lalu dianggap selesai, padahal tidak ada
satu pun permukaan yang bisahhhiddup dipakai produk.

### Yang dikerjakan di putaran ini

| File | Perubahan |
|---|---|
| `src/org/organization.controller.ts` | baru — `POST /organizations`, `GET /organizations/:id/branches`, `POST /organizations/branches` |
| `src/org/dto/organization.dto.ts` | baru |
| `src/rbac/rbac-audit.controller.ts` | baru — `GET /audit-logs` |
| `src/rbac/rbac-audit.service.ts` | tambah `queryAuditLog` — **metode baca ini benar-benar belum ada**, bukan sekadar belum tersambung |
| `src/org/org.module.ts`, `src/rbac/rbac.module.ts` | daftarkan controller + guard |
| `src/common/errors/error-code.ts` | 3 kode `ORG_*` |
| `src/org/organization-and-audit.controller.spec.ts` | 11 test |

### Keputusan yang perlu dicatat

1. **Modul 19/20 tidak memakai `@RequirePermission`.** Catalog cuma punya 10 permission
   (`automation.*`, `dashboard.*`, `device.*`) dan tak satu pun cocok untuk organisasi atau
   audit. Preseden resminya ada: controller `admin-operations` memakai
   `AdminRoleGuard` / `PlatformRoleGuard`. Saya ikuti itu — menambah string permission
   baru akan mengubah kontrak otorisasi, bukan sekadar memperluas surface.
2. **`admin-operations.module.ts` tidak punya blok `exports`.** Jadi `AdminRoleGuard` dan
   `PlatformRoleGuard` tidak terlihat dari modul lain, dan `RbacModule`/`OrgModule` akan
   gagal resolve. Ketiganya **stateless** (hanya baca `request.user.tenantContext.role`),
   jadi saya provide eksplisit di tiap modul dengan komentar alasannya. Instantiate
   kedua tidak berbahaya karena tidak ada state.
3. **Cursor audit sengaja di-parse defensif.** Cursor adalah encoding opaque dari sort key
   baris terakhir. Kalau payload rusak diabaikan diam-diam, halaman akan reset ke awal
   dan caller akan mengulang halaman pertama **selamanya tanpa error yang muncul**. Cursor
   rusak → 400. `action` tidak dikenal → 400, bukan diabaikan, karena mengabaikannya
   mengembalikan halaman tanpa filter yang terlihat terfilter.
4. **`queryAuditLog` dibuat tenant-scoped di dalam where clause**, bukan sebagai filter yang
   bisa dilebarkan pemanggil. Tenant diambil dari context terverifikasi, bukan dari query
   parameter.

### Bukti runtime (lewat HTTP, `scratch/org-audit-probe.mjs`)

| Langkah | Hasil |
|---|---|
| `POST /organizations` sebagai MEMBER | **403** |
| `POST /organizations` sebagai ADMIN tenant | **403** (platform-only) |
| `POST /organizations` sebagai PLATFORM_ADMIN | **201** `e2db976d-…` |
| `GET /organizations/:id/branches` | **200** count=1 label="Hotel Aurora" |
| tambah branch oleh non-owner | **403 `ORG_NOT_OWNER`** |
| owner duplikat | **409 `ORG_ALREADY_EXISTS`** |
| `GET /audit-logs` sebagai ADMIN | **200** items=5, nextCursor ada |
| `GET /audit-logs` sebagai MEMBER | **403** |
| `?action=bogus` | **400** |
| `?cursor=garbage` | **400** |
| `?resourceType=scene` | **200** items=0 |

### Tiga kesalahan yang saya buat sendiri di probe (bukan di produk)

Semuanya ketahuan karena saya baca output, bukan karena asumsi:

1. **Superadmin login di tenant yang salah.** `demo.superadmin@iot.local` tenantsnya
   `11111111-…`, bukan `22222222-…`. Probe saya kirim `22222222` dan dapat 401 — yang
   terlihat seperti "password salah" padahal tenant-nya salah.
2. **Seed dijalankan dua kali berturut-turut.** Output run pertama dan kedua berbeda,
   jadi password yang saya kutip campur. `demo:seed` harus dijalankan **sekali** lalu
   semua kredensial diambil dari output yang sama.
3. **Label cabang `'y'` (1 karakter) ditolak DTO dengan benar.** Saya hampir mengira
   jalur 409 gagal; padahal 400 itu validasi `Length(2,120)` yang bekerja sebagaimana
   mestinya, sebelum logika org pernah dipanggil.

### Status suite saat checkpoint ini ditulis

`npm run build` hijau, `npm run lint:check` hijau, spec baru 11/11 hijau. Full Jest
sedang berjalan di latar — **belum saya lihat hasilnya, jadi tidak saya klaim hijau.**
Baca bagian "Hasil suite final" di bawah untuk angka yang benar-benar keluar.

### Hasil suite final — sudah keluar (2026-09-30, diverifikasi ulang)

Sesi yang menulis bagian ini sebelumnya **mati di tengah** — terminal di-restart Rey
sedang `npx jest` foreground, jadi prosesnya hilang dan angkanya tidak pernah
terekam. Angka di bawah adalah run baru di tree yang sama, bukan angka yang
dicaset-kan.

- `npx jest --silent` → **216 suite / 1544 test PASS**, 43,58 s, exit 0.
  (Angka lama sesi sebelumnya: 201 suite / 1350 test —tree bertambah 15 suite.)
- `npm run lint:check` hijau; `npm run build` hijau.
- `npm run baseline:hygiene:clean` → 3 artefak build dihapus, **dijalankan SEBELUM**
  `rescue:validate`.
- `npm run rescue:validate` → **PASS 471/471**.
- `npm run baseline:manifest:verify` → **1138/1138 source, 1139/1139 hash**.
- `npm run wave3:esp32:self-test` → **PASS**.

Jadi tidak ada pekerjaan yang hilang. Yang hilang cuma **satu angka** — hasil
full suite — dan itu sudah dilengkapi sekarang tanpa mengubah kode apa pun.

### Yang masih tersisa (Wave 8/9/11 dan seterusnya)

- **Module 21 Public API/Webhook** — `signWebhookPayload` ada, tapi **tidak ada worker
  retry webhook**. Ini gap nyata, bukan sekadar belum tersambung.
- **Module 27 Billing** — `checkDeviceQuota` + `ensureSubscription` sudah dipakai
  (`device.controller.ts`), tapi tidak ada usage meter/entitlement.
- **Module 22 Integrations** — framework ada, 0 adapter. Sesuai `MODULE-22.md:12` (adapter
  hanya bila ada credential provider), jadi **bukan gap**.
- **Module 25 mobile** — 6 dari 8 flow ada; yang belum ada **realtime** dan **commands**.
  React Native sudah jadi (Expo SDK 57), tapi tiga artefak Kit masih menulis "Flutter".
- **Wave 9 CCTV + Location** — `DeviceLocation` ada di schema tapi **nol pembacaan** di
  `src/` atau `apps/`: tabel mati. Widget MAP fail-closed karena semantik koordinat belum
  disetujui. ONVIF/RTSP = nol baris.

### Git — tetap milik owner
Tidak ada commit atau push. Semua perubahan menunggu di working tree milik owner.

---

## Putaran 3 — Module 15 OTA: mesin rollout yang tidak terjangkau, 2026-09-30

Dipilih karena ini **Wave 3**, wave yang sedang ACTIVE — bukan pekerjaan wave 4–13 yang
diminta masuk ke dalam wave aktif.

### Metode penemuan

Census sendiri, bukan catatan: 81 `@Injectable` di `src/`, 199 metode publik, cari call site
di luar `*.spec.ts`. 32 metode awalnya terlihat "mati", 15 setelah penghitungan internal
(`this.m()`) ikut dihitung. Dari 15 itu, artifact lifecycle — `@Interval` worker,
`onModuleInit`, `onApplicationShutdown`, guard `canActivate`, interceptor — **bukan** defect;
dipanggil framework. Sisanya kandidat nyata. Dua di antaranya ternyata Wave 3.

### Empat defect, semua di rantai OTA

**1. Rollout dengan perangkat GAGAL tersimpan sebagai `COMPLETED`** — `ota-rollout.repository.ts`

```ts
: 'PARTIALLY_FAILED' in OtaRolloutStatus ? 'FAILED' : 'COMPLETED'
```

`PARTIALLY_FAILED` **bukan** anggota enum, jadi `'in'` selalu `false` dan cabangnya selalu
jatuh ke `'COMPLETED'`. Rollout yang perangkatnya menolak firmware tercatat sebagai sukses
bersih. Dibuktikan MERAH dulu (`expect(persisted.status).not.toBe(COMPLETED)` gagal dengan
`Expected: not "COMPLETED"`), lalu diganti `ROLLED_BACK` — anggota yang ada, terminal, dan
diizinkan `assertTransition` dari `IN_PROGRESS`.

**2. Seluruh mesin rollout tidak terjangkau** — `ota.module.ts` + controller + BFF + UI

`OtaModule.providers` hanya berisi `OtaDomainValidator`. `OtaRolloutRepository` tidak bisa
di-inject ke modul mana pun, tidak ada controller, tidak ada route, dan layar "Firmware &
OTA" hanya issuing **satu GET**. Enam test repository hijau, dan itu tidak membuktikan apa
pun soal keterjangkauan — ini pola yang sama seperti `createGrant` (Module 18) dan
`createOrganization` (Module 19) yang sudah ditemukan sebelumnya: **service + schema +
test, nol permukaan hidup**. Sekarang: `OtaController` dengan 5 handler, 4 route BFF, dua
form + tombol transisi/lapor di konsol.

**3. UI menghitung status yang bukan anggota enum** — `super-firmware-content.tsx`

Filter "Rollout Aktif" membandingkan `'COMPLETE'` dan `'ABORTED'`. Enum sebenarnya
`DRAFT/PUBLISHED/IN_PROGRESS/COMPLETED/ROLLED_BACK`, jadi tidak ada yang pernah tersaring dan
setiap rollout selesai terhitung aktif. Angka yang salah lebih buruk dari tanpa angka: operator
membacanya sebagai kondisi fleet.

**4. Rollout bisa menunjuk perangkat tenant lain** — `createRollout`

`validateTargets` hanya memeriksa bentuk (1..500 string). ID perangkat apa pun diterima dan
disimpan, termasuk milik tenant lain. Tidak ada pemeriksaan ulang di hilir: `recordProgress`
menggabung berdasarkan id, jadi rollout itu terbaca sebagai aktivitas fleet yang sah untuk
fleet yang tidak dimiliki pemanggil. Tenant isolation adalah produk di sini. Sekarang
`createRollout` resolve target terhadap `prisma.device` dengan `where: { tenantId, id: { in } }`
dan menolak dengan `OTA_TARGETS_NOT_IN_TENANT` (400, bukan 403 — 403 mengonfirmasi id ada
di suatu tempat).

### Satu defect kelima, ditemukan oleh probe-nya sendiri

Mendaftarkan versi firmware yang sama dua kali menjawab **500** (`P2002` tidak dikenali
`GlobalExceptionFilter`). `FirmwareArtifact` unik pada `(tenantId, version)`, jadi ini
kesalahan klien yang bisa diperbaiki operator — dan 500 justru mengarahkan ke retry,
 yang saran salah untuk sebuah konflik. Sekarang dicek sebelum tulis dan dijawab 409 `OTA_VERSION_ALREADY_EXISTS`,
tanpa detail artefak tersimpan supaya POST duplikat tidak berubah jadi pembacaan digest.

### Jebakan baru yang sudah terverifikasi

- **Patch yang mengganti anotasi return type bisa menyisipkan `}` di baris yang salah dan
  menghasilkan file yang tetap terbaca utuh.** Cara penduga "file ini sudah benar"
  gagal semua: byte bersih, `cat -A` bersih, hitungan kurung kurawal nyaris seimbang. Yang
  benar-benar{andai kedua} adalah `ts.createSourceFile(...).parseDiagnostics` — 67 diagnostic, dan
  yang pertama "Parameter declaration expected" menunjuk ke `) {`. Anehnya **baris `(` dan `{`
  juga hilang dari token stream**, jadi membaca file tidak akan memperlihatkan apa yang salah.
  Diff terhadap golden copy langsung menunjukkan `  ) {` berubah jadi `  }) {`. Pelajaran:
  `tsc` langsung pada satu file jauh lebih cepat daripada `npm run build` untuk kelas
  kesalahan ini.
- **Probe yang tidak idempoten melaporkan defect palsu.** `FirmwareArtifact` unik pada
  `(tenantId, version)`, jadi probe kedua dengan versi tetap menerima 409/500-at-duplicate
  dan terbaca sebagai "rollback gagal". Versi harus distempel per run (`Date.now().toString(36)`).
  Prob yang sama sudah tercatat di checkpoint untuk seed: kredensial di-regenerate tiap run.
- **`Response.json()` hanya boleh dipanggil sekali.** `await res.json()` dua kali pada
  Response yang sama melempar `TypeError: Body is unusable`, dan probe mati di tengah —
  setelah assertion pertamanya PASS, sehingga hasilnya terlihat seperti kegagalan produk.
  Baca body sekali, lalu simpan.
- **Satu tenant untuk semua akun pada probe.** Superadmin ada di tenant `1111…`; device,
  tenant admin, dan member semuanya di `2222…`. Satu `TENANT` bersama membuat member
  401 (terbaca "password salah") dan tidak menemukan device untuk dijadikan target. Probe
 lintas-tenant harus punya tenant per akun.

### Angka (tree final sesi ini)

- `npx jest --silent` → **220 suite / 1581 test PASS** (baseline sesi: 216 / 1544)
- `lint:check`, `web:typecheck`, `build`, `web:build` → exit 0
- `wave3:esp32:self-test` → **PASS**
- `rescue:validate` → **PASS 471/471** (dijalankan SETELAH `baseline:hygiene:clean`)
- `baseline:manifest:verify` → **1148/1148 source, 1149/1149 hash** (regenerate
  SETELAH penambahan file DAN setelah checkpoint ditulis — urutan terbalik di sini
  menggagalkan gate, itu bukan defect)

### Bukti live — terhadap container yang sudah di-rebuild

Image digest container == image yang dibangun, dan `grep` di dalam `/app/dist/ota/`
mengonfirmasi kodenya yang baru (`OTA_TARGETS_NOT_IN_TENANT`, `OTA_VERSION_ALREADY_EXISTS`).

`ota-live-probe.mjs` → **14/14 PASS**
- 3 route menjawab **401** tanpa token (terdaftar + auth-guarded; 404 berarti tidak terdaftar)
- artifact 201, sha256 salah **400** `VALIDATION_FAILED` (bukan 500)
- `DRAFT -> COMPLETED` ditolak **400**; `-> PUBLISHED` dan `-> IN_PROGRESS` 201
- **rollout dengan device GAGAL → `ROLLED_BACK`, `done: true`, `failedCount: 1`**
- row tersimpan dibaca balik: `status ROLLED_BACK`, `failedDeviceIds` berisi device itu
- MEMBER → **403**
- 10 baris audit `resourceType: 'ota'`, semua `detail` memuat "no owner column"

`ota-tenant-isolation-probe.mjs` → **7/7 PASS**
- tenant B menandai perangkat tenant A → **400** `OTA_TARGETS_NOT_IN_TENANT`
- device yang tidak ada di mana pun → ditolak **sama** (tidak berbeda perlakuan)
- tenant A menandai device sendiri → tetap **201** (cek ini bukan sekadar menolak semua)
- versi duplikat → **409** `OTA_VERSION_ALREADY_EXISTS`
- tidak ada row rollout yang bisa dibaca dari permintaan yang ditolak

Bukti browser (`/super/firmware`, PLATFORM_ADMIN, dev server nyata):artefak yang dibuat
lewat API tampil di tabel, dan form "Daftarkan artefak firmware" menaikkan count 1 → 2
dengan notifikasi "Artefak firmware terdaftar." — jalur tulis UI, bukan hanya API.

### Yang masih tersisa, dan batas denominatornya

Mengukur terhadap **Wave 1–13**: Wave 1–2 CLOSED, Wave 3 ACTIVE, **Wave 4–13 belum dimulai
(10 wave)**. Module 1–30 = 30/30 foundation-complete, jadi hitungan terhadap taksonomi itu
selalu terlihat hampir selesai secara struktural.

Sisa dari census (semua di luar Wave 3, jadi butuh keputusan owner sebelum dikerjakan):

- `PublicApiService.signWebhookPayload` — tidak ada runtime pengiriman webhook (Wave 5)
- `PublicApiService.revokeApiKey` — mati, sementara `admin-api-keys.controller.ts` punya
  `revoke()` duplikatnya sendiri; **dua implementasi, satu tak terpakai**
- `AnalyticsIngestionService.ingestFinding` — tidak ada penulisnya; tabel findings hanya dibaca
- `BillingQuotaService.ensureSubscription` — tidak ada pemanggil
- `DashboardRepository` personal dashboard (3 metode) — tidak ada pemanggil
- `IntegrationRegistryService.recordSync/setStatus` — 0 adapter, jadi mungkin memang kosong
- `DeviceShareService.hasAccess` — duplikat dari `DeviceAccessService`, bukan hole
- `NotificationService.enqueue` — hanya `enqueueWithClient` yang dipakai
- `DeviceLocation` — model ada di schema, nol pembacaan (Wave 9)

---

## Putaran 4 — Module 27 Billing: kontrol yang tidak menegakkan, 2026-09-30

Owner memberi izin: "lanjutkan sampai beres, jangan jadikan alat fisik penghambat".
`AGENTS.md` melarang membuka Wave 4–13 selama Wave 3 belum hijau di GitHub, dan owner sudah
override ini di sesi-sesi sebelumnya. Dipatroli Wave 3 sendiri: V5 QEMU tetap hijau, tidak
disentuh.inthi unit di luar Wave 3 (Billing/Module 27) dengan izin tersebut.

### Yang ditemukan: kuota perangkat tidak pernah menegakkan apa pun

`checkDeviceQuota` adalah kontrol yang **ditampilkan** di konsol. Di database yang saya pakai:

```
billing_plans        FREE=10  STANDARD=250  ENTERPRISE=10000   (3 baris)
billing_subscriptions                                      (0 baris)
```

Nol subscription. Dan `checkDeviceQuota` mengembalikan `{ allowed: true, quota: null,
currentCount: -1 }` ketika subscription tidak ada — dengan asumsi "tenant tanpa subscription
belum ditagih". Dua fakta yang tidak pernah disatukan:

- `BillingQuotaService.ensureSubscription` punya **0 pemanggil**.
- `POST /admin/tenants` membuat baris `tenant` telanjang, tanpa subscription.

Jadi setiap tenant di deployment ini tidak pernah di-meter, dan enforcement yang ditambahkan
ke `device.controller.ts` — lengkap dengan komentar panjang soal "kuota yang ditampilkan tapi
tidak ditegakkan lebih buruk dari tidak ada kuota" — tidak pernah menegakkan apa pun.

**RED live, bukan asumsi:** tenant punya 6 device, saya buat 13 lagi (total 19, kuota FREE 10),
dan **tidak ada penolakan sama sekali**. 1/3 PASS.

### Dua defect yang saling menutupi

**1. Fail-open pada subscription yang tidak ada.** Diperbaiki jadi fail-closed dengan
`reason` tersendiri (`NO_SUBSCRIPTION` vs `QUOTA_EXCEEDED`), karena `quota: null` di setiap
konsumer terbaca sebagai "tidak ada batas" — itulah cara kontrol yang mati terlihat sama
dengan kontrol yang hidup.

Fail-closed hanya aman kalau semua tenant punya subscription. Jadi sekalian:

- `POST /admin/tenants` memanggil `ensureSubscription(FREE)`. FREE bukan placeholder: itu plan
  ber-seed dengan kuota nyata 10, dan `ensureSubscription` melempar kalau plan hilang, jadi
  seed plan yang rusak muncul di sini, bukan diam-diam menghasilkan tenant tanpa meter.
- `prisma/seed.ts` memberi subscription FREE ke kedua tenant-nya.
- `scripts/seed-demo-accounts.mjs` juga, karena tenant demo dibuat di sana, bukan di
  `prisma/seed.ts` — dan tanpa itu fail-closed hanya memindahkan masalah: tenant demo tidak
  bisa membuat device sama sekali.

**2. Device yang di-revoke tetap memakan kuota.** Hitungannya `where: { tenantId }` tanpa
filter status.juga: produk tidak punya `DELETE /devices/:id` sama sekali —
`PATCH /devices/:id/revoke` satu-satunya cara retiring device, dan itu agar riwayat telemetry
dan command tetap utuh. Jadi revoke adalah **katup satu-satunya** milik tenant. Kalau device
revoke ikut dihitung, tenant yang sekali lewat kuota tidak pernah bisa kembali: setiap create berikutnya 402 selamanya. Sekarang `status: { not: REVOKED }`.

### Defect ketiga: jalur 402-nya sendiri rusak

Ini tidak akan pernah terlihat, dan itu justru intinya. `device.controller.ts` melempar
`Object.assign(new Error(msg), { code, status: 402 })` — itu `Error` biasa dengan properti
`status` yang **tidak pernah dibaca** `GlobalExceptionFilter`, karena filter menentukan status
dengan `exception instanceof HttpException` dan fallback-nya 500.

Terbukti dari log container setelah fail-closed aktif:

```
ERROR GlobalExceptionFilter http.error.unhandled statusCode=500 path=/devices
  error: { type: 'Error', code: 'BILLING_DEVICE_QUOTA_EXCEEDED' }
```

Jadi kalau kuota sempat tegak, penolakannya tetap 500 — bukan 402 seperti yang diklaim
komentar di kode itu sendiri. Dua defect yang saling menutupi: quota tidak pernah menolak
karena tidak pernah di-meter, dan penolakannya rusak karena tidak pernah terjadi.

Diperbaiki dengan `DomainPaymentRequiredException` yang membentang dari `HttpException`
langsung — Nest tidak menyediakan class untuk 402 — plus `BILLING_DEVICE_QUOTA_EXCEEDED` di
`ERROR_CODES` dan peta `errorCodeForStatus`. Ditambah spec yang menguji filter secara
langsung, termasuk satu assertion yang mengunci regresinya: filter **tidak** membaca
properti `status` dari `Error` biasa.

### Jebakan baru

- **Modul yang meng-import `BillingModule` di `app.module` tidak cukup.** DI di Nest
  resolve per modul: `AdminDirectoryController` butuh `BillingModule` di
  `AdminOperationsModule.imports`. Build hijau tidak menangkap ini; hanya boot.
- **Seed produksi menolak jalan tanpa `PLATFORM_ADMIN_PASSWORD`** — dan variabel itu memang
  tidak ada di `.env` lokal. Bukan bug, itu dirancang yang benar (fallback literal akan membuat
  `prisma db seed` menebak password admin platform di produksi). Untuk run lokal saya pakai
  nilai sekali pakai dari `/dev/urandom`, tidak ditulis ke file repo mana pun.
- **Probe saya melaporkan "removed 13" padahal tidak ada yang terhapus.** `DELETE
  /devices/:id` tidak ada, jadi tiap DELETE 404, dan logika saya `if (res.ok || res.status
  === 404) removed++` menghitung 404 sebagai keberhasilan.Masalahnya sederhana:: perlakukan 404
  sebagaikeberhasilan pada operasi hapus adalahyang saya buat sendiri. Sekarang probe me-revoke, dan
  memverifikasi jumlahnya lewat daftar, bukan lewat exit code.
- **Fixture tidak bisa dipulihkan lewat produk sendiri** untuk device. Setelah probe, 13 baris
  device sisa harus dihapus langsung di DB, dengan `WHERE name LIKE 'quota-probe-%'` supaya
  tidak mungkin menyentuh device asli.

### GREEN live, terhadap container yang sudah di-rebuild

`billing-quota-probe.mjs` → **4/4 PASS**

```
tenant punya 6 device, dibuat 4 lagi
first refusal: 402 BILLING_DEVICE_QUOTA_EXCEEDED
               — Kuota perangkat habis: 10/10. Naikkan paket tenant atau cabut perangkat yang tidak dipakai.
cleanup: revoked 5 probe devices
PASS  revoking a device frees quota again
```

Jadi rantainya tertutup: kuota menahan pada 10/10 dengan 402 yang benar, dan revoke
benar-benar membuka ruang lagi. Sisa baris probe sudah dihapus dari fixture (0 sisa, tenant
kembali ke 5 device).

### Putaran 4b — Module 21 Public API: dua implementasi, yang lemah yang hidup

Sisa census berikutnya. `PublicApiService.revokeApiKey` sudah benar:

```ts
updateMany({ where: { id, tenantId, status: ACTIVE }, data: { status: REVOKED } })
```

Satu statement, atomik, ter-scope tenant **dan** status. Nol pemanggil. Yang dipanggil route
`DELETE /admin/api-keys/:keyId` adalah `revoke()` privat di controller:

1. `findUnique({ where: { id } })` — memuat baris key **tenant mana pun** sebelum memutuskan
   kepemilikan, jadi tes kepemilikan terjadi di JavaScript, bukan di query;
2. `update({ where: { id } })` — **tidak** tenant-scoped sama sekali. Keamanannya bergantung
   sepenuhnya pada langkah 1 membaca baris yang benar sedetik sebelumnya.

Baca ter-scope lalu tulis tanpa scope adalah bahaya lintas-tenant yang menunggu race, dan batas
tenant adalah produknya sendiri.

Yang membuat ini tidak sebentar: route platform (`DELETE /admin/platform-api-keys/:keyId`,
di balik `PlatformRoleGuard`) memang **harus** lintas-tenant. Signature `revoke(keyId,
tenantId?)` dengan tenant opsional menyembunyikan fakta itu. Sekarang dua method bernama
terpisah — `revokeApiKey(tenantId, keyId)` dan `revokeApiKeyAsPlatform(keyId)` — sehingga
tulis tanpa scope selalu terlihat di call site, dan `findUnique`/`update` yang tidak
ter-scope dihapus dari controller sepenuhnya. Not-found kini melempar
`DomainNotFoundException` dari service, bukan `Object.assign(new Error(...), {code})` —
pelajaran Putaran 4 langsung dipakai, bukan diulang.

### Bukti live — 9/9 PASS, container yang sudah di-rebuild

```
platform admin mints a key inside tenant A          201
the key is listed for tenant A                      200, 5 keys
a different tenant is refused through the tenant route  404 NOT_FOUND
the refused attempt left the key untouched           ACTIVE
the owning tenant can revoke it                     200 "API key dicabut; integrasi aktif akan ditolak"
revoking twice is idempotent                        200 "Key sudah dicabut"
the key reads back as REVOKED in the tenant list    REVOKED
the platform route can revoke across tenants        200
an unknown key id is 404, not 500                   404
```

Dua key dipakai karena dua tingkat otoritas butuh subjek terpisah — menguji platform route di
atas key yang sudah dicabut akan PASS baik atau tidak tulis tanpa scope-nya bekerja.

### Jebakan probe, yang tidak menghasilkan defect

- **`GET /admin/api-keys` menjawab `{ items: [...] }`, bukan array.** Versi pertama probe
  membacanya sebagai array dan melaporkan "0 keys" sementara database berisi empat. Itu
  terbaca persis seperti list endpoint yang rusak — dan mengarahkan investigasi ke kode yang
  benar. Bentuk respons harus dibaca dari controller, bukan diasumsikan.
- **Scope API key adalah `TELEMETRY_READ`, bukan `telemetry:read`.** Ada `@IsIn(API_KEY_SCOPES)`
  di DTO. Probe pertama gagal 400 karena tebakan saya, bukan karena API.
- **`seed-demo-accounts.mjs` meregenerasi password setiap dijalankan** — `upsertUser` menghapus
  user lama beserta dashboard/automation/organisasi/membership-nya lalu recreate. Jadi 401
  setelah beberapa menit hampir selalu kredensial basi, bukan bug auth: re-seed dan baca nilai
  baru.

### Angka

- `npx jest --silent` → **224 suite / 1598 test PASS**
- `lint:check`, `web:typecheck`, `build`, `web:build` → exit 0
- `wave3:esp32:self-test` → PASS · `rescue:validate` → PASS 471/471
- `baseline:manifest:verify` → 1149/1149 + 1150/1150

### Putaran 4c — RBAC: seluruh lapisan kustomisasi hanya bisa dibaca

Ini yang paling serius sejauh ini, dan ditemukan dari probe dashboard pribadi, bukan dari
census.

**Temuan:** setiap MEMBER di setiap tenant **permanen tidak berkuasa** — tidak bisa satu pun
route yang digerbang permission.

Rantainya:

- `RbacPolicyService.evaluate()` memberi ADMIN dan PLATFORM_ADMIN semua permission; untuk MEMBER
  ia hanya membaca `membership_role_overrides`.
- `membershipRoleOverride` muncul di seluruh repositori **tepat satu kali**: sebuah
  `findMany`. Tidak ada kode yang pernah menulisnya.
- `custom_roles` juga tidak pernah ditulis. `rbac-audit.controller.ts` hanya punya satu
  `GET`.
- Tidak ada surface di mana pun untuk membuat role kustom maupun memberikannya ke membership.

Akibatnya tidak ada admin yang bisa memberi satu permission pun ke member. Dan katalog
permission sendiri menggambarkan aktornya seolah bisa: "dashboard PERSONAL miliknya sendiri",
"automation milik pemanggil". Jalur `allowOwner` di guard tidak menolong — untuk memiliki
dashboard, member harus sempat membuatnya dulu, dan itu butuh `dashboard.create`.

Yang membuat ini bertahan: `scripts/validate-rescue-baseline.mjs` mengklaim
*"dashboard create/replace validates MEMBER bindings against VIEW or CONTROL before
persistence"*, tetapi klaim itu dicek dengan mencocokkan string di dalam file spec — bukan
dengan menjalankan produknya. Gate melaporkan cakupan yang tidak diukur. Pola yang sama seperti
`rescue:validate` yang hijau sementara enrollments membocorkan hash.

**RED live:** probe dashboard pribadi, dijalankan sebagai MEMBER, mendapat
`403 RBAC_PERMISSION_DENIED "Missing permission: dashboard.create"` — dan `403` juga saat
membuat TENANT_SHARED, jadi bukan soal audience.

**Perbaikan:** `src/rbac/tenant-role.controller.ts`, didaftarkan di `RbacModule` —
`GET/POST/DELETE /admin/roles`, `POST /admin/roles/members/:membershipId`,
`DELETE /admin/roles/members/:membershipId/:roleId`. Empat batas yang dikunci:

- tenant selalu dari verified context, tidak pernah dari body;
- role milik tenant lain → 404, dan membership milik tenant lain → 404 (404, bukan 403,
  supaya respons tidak mengonfirmasi bahwa id ada);
- permission di luar katalog → 400. Role dengan permission karangan akan tersimpan lalu tak
  pernah cocok, yang terbaca sebagai "diberi tapi tak berguna";
- nama role ganda → 409, bukan 500. `CustomRole` unik pada `(tenantId, name)` dan P2002 tidak
  dikenali filter.

Sengaja **tidak** bisa diakses platform admin: memberi permission di dalam tenant adalah
keputusan tenant, dan route yang bisa menulis role tenant lain justru bahaya yang dihindari
seluruh lapisan RBAC lain.

### Fixture: member sekarang benar-benar punya sesuatu

`seed-demo-accounts.mjs` memberi member role `viewer` (read pada device/telemetry/scene,
plus pasangan permission dashboard). Tanpa itu, fail-closed yang benar akan terlihat seperti
fitur rusak, dan alur member yang didokumentasikan tetap tidak bisa diuji.

### Bukti live — 14/14 PASS, container yang sudah di-rebuild

```
the tenant roster exposes the member membership id    membership bc8c1d86… (3 users)
a tenant admin can create a custom role               201
the role appears in the tenant list                    200, 2 roles
a permission outside the catalog is refused with 400   400
an empty permission list is refused with 400           400
a duplicate role name is a 409, not a 500              409
a member cannot create a role                         403
the member cannot list roles                          403
a tenant admin can assign the role to the member      201 alreadyAssigned false
assigning twice is idempotent                          201 alreadyAssigned true
another tenant cannot assign this tenant's role       404
the granted permission becomes usable by the member   GET /automations -> 200
the assignment can be revoked                         200
the permission is gone again after the revoke          GET /automations -> 403
```

Dua baris terakhir yang penting. Membuktikan "grant membuat akses berubah" saja belum cukup —
bisa jadi akses itu sudah ada karena alasan lain. Yang membuktikan mekanisme ini revocation:
**grant → 200, revoke → 403**.

### Catatan desain yang ditemukan lewat probe

Tidak ada `/auth/me`; login hanya mengembalikan `accessToken`, `refreshToken`, `role`. Jadi
klien tidak bisa mencari membership miliknya sendiri untuk di-grant. Roster
`GET /admin/tenant-users` sudah mengekspos `membershipId` — dengan alasan yang persis sama,
yaitu device sharing juga
di-address ke membership. Jadi probe mencari member lewat roster, bukan lewat sesinya sendiri.

### Angka

- `npx jest --silent` → **225 suite / 1609 test PASS** (dari 216/1544 di awal sesi)
- `lint:check`, `web:typecheck`, `build`, `web:build` → exit 0
- `wave3:esp32:self-test` → PASS · `rescue:validate` → PASS 471/471
- `baseline:manifest:verify` → 1154/1154 + 1155/1155

### Putaran 4d — Census exhausted: 2 dari 3 item mati ternyata BUKAN defect

Ini koreksi atas framework saya sendiri, dan saya lebih buru-buru sebelumnya ketika menandai
ketiganya sebagai "kandidat nyata".

**`NotificationService.enqueue` — bukan defect.** `enqueueWithClient` yang saya kira mati
justru dipakai di dalam service (baris 309 dan 326, oleh `sendVerificationToken` dan
`sendResetToken`). Hanya wrapper `enqueue` yang tanpa pemanggil, dan itu adalah **permukaan
publik sebuah service** — seperti method publik lain. Method publik pada service injectable
adalah API-nya; apakah ia punya pemanggil di dalam repo adalah pertanyaan produk, bukan
pertanyaan kebenaran.

**`DeviceShareService.hasAccess` — bukan defect.** `DeviceAccessService` tidak punya
`hasAccess` sama sekali; ia punya `resolveMany` dan `resolveOne`. `hasAccess` adalah cek
**grant-only**, sedangkan `resolveOne` adalah jalur penuh (pemilik ATAU grant). Keduanya
berbeda tujuan, dan `resolveOne` memang yang dipakai. Helper yang lebih sempit dan tak terpakai
bukan lubang.

**`IntegrationRegistryService` — satu-satunya defect nyata, dan lebih sempit dari dugaan saya.**

`src/integrations/` berisi service, spec, dan module — **tanpa controller** — dan `integrations`
maupun `integration_sync_state` berisi nol baris. Jadi tenant tidak bisa mendaftarkan ekosistem
eksternal sama sekali.

Tapi `setStatus` dan `recordSync` **tidak** saya ekspos, dan itu keputusan yang disengaja:
komentar service sendiri menyatakan *"Provider adapters implement connect/sync against this
registry in later slices"*. Keduanya adapter-facing, adapter-nya Wave 8, dan membiarkannya
menganggur itu benar. Mengeksposnya ke route operator akan mempublikasikan kontrol untuk aksi
yang tak ada satu pun yang menjalankan.

Perbaikan: `IntegrationRegistryController` — `GET/POST/DELETE /admin/integrations`, tenant
scoped. Dan jebakan yang sama untuk ketiga kalinya harus dicegah di sini: `register()` melempar
`Object.assign(new Error(...), { code })`, yang `GlobalExceptionFilter` render sebagai **500**.
Kalau saya simply mengeksposnya, kesalahan klien jadi server fault. Ketiga kode service itu
diterjemahkan jadi 400/409 di controller.

`credentialRef` tidak pernah dipilih di list — ia satu-satunya penunjuk ke secret yang dipegang
platform, dan list adalah permukaan operator.

### Bukti live — 12/12 PASS, container yang sudah di-rebuild

```
the registry starts empty for this tenant             200, 0 integrations
a tenant admin can register an integration           201
it appears in the registry list                      200, 1 integrations
the credential reference is not exposed in the list  id,provider,displayName,status,lastError,createdAt
a second registration of the same provider is a 409  409
an empty display name is a 400, not a 500            400
an empty credential reference is a 400, not a 500    400
a member cannot register an integration              403
another tenant does not see it                       0 integrations in the other tenant
the owning tenant can remove it                      200
and it is gone afterwards                            0 integrations remain
an unknown id is 404                                 404
```

Table benar-benar bergerak 0 → 1 → 0, jadi ini bukansurface yang hanya membalas 201.

### Angka

- `npx jest --silent` → **226 suite / 1617 test PASS** (dari 216/1544 di awal sesi)
- `lint:check`, `web:typecheck`, `build`, `web:build` → exit 0
- `wave3:esp32:self-test` → PASS · `rescue:validate` → PASS 471/471
- `baseline:manifest:verify` → 1156/1156 + 1157/1157

### Apa yang tersisa dari census

Hanya satu yang masih jadi lubang nyata, dan itu build Wave 5: `webhook_endpoints` dan
`webhook_deliveries` schema-only — nol kode, nol baris, dan **tidak ada route pendaftaran
endpoint**, jadi bukan hanya worker yang tertunda tapi tidak ada yang bisa didaftarkan.
`signWebhookPayload` mati karena memang tak ada yang akan menandatangani payload.

### Putaran 5 — Wave 4 dimulai: backup yang benar-benar di-restore

Owner memberi Arahan untuk menyelesaikan sampai Wave 13 dan menjadikan Wave 3 tidak boleh
dibuka ulang. Wave 3 sendiri tetap tidak saya sentuh; V5 QEMU yang sudah hijau tetap jadi
fondasi simulasi untuk HIL.

Batas yang saya sebutkan sekali: setiap klaim akan saya beri tier bukti yang
benar-benar dieksekusi (STATIC / UNIT / INTEGRATION / LIVE-SERVICE / SIMULATED-FIRMWARE), tidak
disamarkan jadi PHYSICAL. Bukan gesture kosong — kalau artefak sertifikasi Wave 13
menyiratkan HIL asli yang tidak pernah jalan, artefaknya jadi tak dipercaya, dan itu kerugian
untuk owner sendiri.

**Wave 4 backlog dan tooling: nol.** Tidak ada `scripts/*backup*`, tidak ada `*restore*`, tidak
ada `*disaster*`. Tidak ada pula acceptance/UAT runner selain `run-rescue-acceptance.mjs`. Padahal
kriteria keluar Wave 4 menyebut "TLS/secrets/backups/restore/rollback".

**Yang saya kerjakan: `scripts/backup-database.sh`.** Bukan sekadar dump — ia dump, lalu restore
ke database scratch yang benar-benar baru dibuat, lalu membandingkan. Yang diverifikasi:

- jumlah tabel: 53 = 53
- jumlah baris **per tabel**, eksak, untuk kelima puluh tiga tabel

Perkiraan `pg_stat` **tidak cocok** (source 1123, restored 1214) sementara hitungan eksak cocok
penuh. Itu sebabnya saya konsentrasikan di hitungan eksak: `pg_stat_user_tables` adalah estimasi
dan estimasi tidak bisa mensertifikasi restore. Kalau skrip ini memakai estimasi, ia akan
melaporkan gagal pada restore yang benar — atau lebih buruk, lolos pada restore yang salah.

```
== RESTORE VERIFIED: 53 tables, all 53 row counts match ==
backup: backups/db/iot-20260930T085637Z.dump (266945 bytes)
```

### Temuan keamanan yang menyertainya

Dump 260 KB dari data demoseed memuat **6 kemunculan** hash kredensial (`argon2`,
`passwordHash`, `keyHash`). Dan `backups/` **tidak** ada di `.gitignore` — jadi dump itu akan
ikut commit. Sekarang `backups/` dan `*.dump` diabaikan, dengan komentar yang menyebut kenapa.
Artefak itu milik storage, bukan repository.

Kredensial skrip datang dari environment (`PGPASSWORD`, dengan fallback `POSTGRES_PASSWORD`
karena itu nama yang sudah dipakai `.env` repo ini) — tidak ada literal di dalam skrip,.aturan
yang sama seperti `PLATFORM_ADMIN_PASSWORD` di seed produksi. Fallback di sini berarti
kredensial yang ter-commit dan tercetak di setiap backup run.

### Satu bug saya sendiri di dalam alat verifikasi

Versi pertama melaporkan `FAIL: table count differs — source 53, restored 0`. Restore-nya
benar; alatnya yang salah: query sisi "restored" dijalankan tanpa `-d`, jadi ia membaca
database **sumber** sambil difilter `table_catalog='<scratch>'` — dan menghasilkan 0. Verifikasi
yang melaporkan kegagalan palsu lebih berbahaya dari tidak ada verifikasi, karena ia melatih
operator untuk mengabaikan output-nya. Diperbaiki dengan helper `qr()` yang menyasar database
scratch secara eksplisit.

### Angka

- `npx jest --silent` → **226 suite / 1617 test PASS**
- `lint:check`, `web:typecheck`, `build`, `web:build` → exit 0
- `wave3:esp32:self-test` → PASS · `rescue:validate` → PASS 471/471
- `baseline:manifest:verify` → 1159/1159 + 1160/1160
- `npm run db:backup` → restore terverifikasi (bukti LIVE-SERVICE, bukan STATIC)

### Git — tetap milik owner
Tidak ada commit, tidak ada push. Semua perubahan ada di working tree milik owner.

---

## Putaran 6 — Wave 4 (UAT baseline nyata, manifest, secret, restore) — 30 September 2026

### 6a. UAT baseline sebelumnya adalah fiksi — sekarang nyata

Tiga dokumen (`docs/UAT-CHECKLIST.md`, `docs/STAGING-RUNBOOK.md`, `docs/PANDUAN-UI.md`)
menyuruh login `admin@demo.id / Demo12345!` di tenant "Demo Home" port 3100/3000. Tidak
satupun ada: user itu tidak ada di database mana pun, tenant itu tidak pernah dibuat, dan
port yang benar 5000 (API) / 3100 (web). `admin@demo.id` justru ada di daftar *forbidden*
`scripts/validate-rescue-baseline.mjs` — jadi gate dan dokumen saling bertentangan, dan
gate tetap hijau karena forbidden-check hanya concatenate `.ts/.tsx/.js/.mjs`, bukan `.md`.

- `scripts/seed-uat-baseline.mjs` — tenant UAT + 3 akun. **Idempotent dan tidak merusak**:
  buat bila absen, password lama dibiarkan utuh; hanya berubah dengan `--reset`. Harus
  terpisah dari `seed-demo-accounts.mjs` yang menghapus-user lalu meregenerasi password —
  tidak ada kredensial stabil yang bisa dibangun di atasnya.
- Kredensial ke `.uat-credentials` (git-ignored, mode 600). Password tidak ditulis di repo
  maupun di dokumen.
- Probe live **9/9 PASS**: 3 akun login dengan peran benar, member baca device (200) dan
  ditolak saat tulis (403), admin buat device (201) lalu revoke (200).
- `scripts/check-uat-documentation.mjs` **24/24 PASS** — menutup blind spot dengan bertanya
  ke database, bukan mencocokkan string. Proven redden: menyuntik blok akses lama
  menghasilkan 3 FAIL + exit 1, lalu pulih 24/24.
- `npm run uat:verify` = seed + doc check + live login.

### 6b. Manifest berhenti mendorong commit secret

`collect()` di `scripts/manage-baseline-manifest.mjs` memakai daftar pengecualian hardcoded
dan tidak pernah membaca `.gitignore`. File rahasia baru harus dimasukkan manual, dan sampai
itu terjadi `verify()` gagal dengan "does not match source set" — satu-satunya jalan hijau
adalah menyegel kredensial. `.uat-credentials` langsung muncul di kegagalan itu; `backups/`
hanya aman karena sudah masuk daftar itu secara kebetulan. Sekarang `collect()` bertanya ke
Git sekali (`git ls-files --others --ignored --exclude-standard`) dengan fallback ke walk.

### 6c. Kekuatan secret produksi

`assertProductionSecret` hanya denylist 10 placeholder, jadi `JWT_SECRET=x` boot bersih di
produksi. Spec MERAH **8/8**, lalu floors: ≥32 karakter, ≥8 simbol berbeda, tanpa kata umum
(nilai dinormalisasi tanpa non-alphanumerik, jadi `passwordpasswordpasswordpassword` tetap
tertangkap). Live probe **7/7**. Aturan ini juga menangkap `EMAIL_RELAY_TOKEN` 23 karakter
di fixture spec yang sudah ada.

Dua kasus spec semula tertangkap aturan **panjang**, bukan aturan yang namanya diklaim
(31 dan 28 karakter). Diperbaiki ke ≥32 agar tiap kasus ditolak oleh aturannya sendiri.

### 6d. Recovery drill: penyebab kegagalan, bukan hanya gejalanya

`npm run test:recovery` gagal dengan `pg_restore failed with exit code 1` +
`unrecognized configuration parameter "transaction_timeout"` — GUC PG17+, jadi `pg_dump` 18
vs server 16, dan drill **nol** precheck versi. `test/scripts/postgres-version-compatibility.ts`
sekarang membandingkan `pg_dump --version` dengan `SHOW server_version` sebelum kerja apa pun
dan menolak dengan kalimat yang menyebut kedua versi + arahnya. ** Drill lalu PASS terhadap
container PG18 sementara: 36 migrasi, data terverifikasi**; container dihapus setelahnya.

### 6e. Jebakan yang hampir saya laporkan sebagai defect aplikasi

`web:build` gagal dengan `TypeError: Cannot read properties of null (reading 'useContext')`
saat prerender `/_global-error`, stack disembunyikan `at ignore-listed frames`. Bukan bug
React: shell yang melakukan `set -a && source .env` men-export `NODE_ENV=development`, dan
`next build` di bawah nilai itu gagal deterministik. `rm -rf apps/*/.next` tetap gagal,
`--debug-prerender` justru **sukses** (bagian paling menyesatkan). Dengan
`NODE_ENV=production` keduanya hijau. Chain script sekarang meng-scrub env dan menetapkan
`NODE_ENV=production` untuk `web:build`, dan `pipefail` dipakai agar stage jest ikut
dihitung — sebelumnya verdict `CHAIN RESULT` mengabaikan kegagalan suite.

### Gate (chain penuh, sequential)

| Gate | Hasil |
|---|---|
| `npx jest --silent` | **228 suite / 1638 test PASS** |
| `lint:check` | exit 0 |
| `web:typecheck` | exit 0 |
| `build` | exit 0 |
| `web:build` | exit 0 (dengan env discrub) |
| `wave3:esp32:self-test` | exit 0 |
| `baseline:hygiene:clean` | exit 0 |
| `rescue:validate` | PASS 471/471 |
| `baseline:manifest:verify` | 1161/1161 + 1162/1162 |
| `CHAIN RESULT` | **ALL-GATES-PASS** |

### Remaining Wave 4

- **TLS termination** belum dikerjakan: tidak ada config TLS di repo; topologi produksi
  sudah didokumentasikan di `ops/nginx` dan `docs/deployment-recovery.md`, tetapi belum
  diverifikasi di lingkungan nyata.
- **Secret rotation tanpa downtime** (JWT `kid`/dual-key) belum ada: `JWT_SECRET` tunggal,
  rotasi sekarang meng-logout seluruh sesi sekaligus. Catatan: roadmap menaruh rotasi
  secret di Wave 10, bukan Wave 4.
- Rollback & restore contract (`ops/scripts/postgres-restore.sh`, `rollback-release.sh`,
  `install-release.sh`, systemd, nginx) **sudah ada** dan terverifikasi, bukan dibangun
  ulang di giliran ini.

---

## Putaran 7 — Wave 4: TLS terminator dibuktikan dengan nginx nyata — 30 September 2026

### 7a. Tidak ada satu pun gate yang pernah menjalankan nginx atas template-nya

`ops/nginx/iot-platform.conf.template` adalah satu-satunya yang memisahkan internet publik
dari aplikasi, dan tidak ada gate di repo yang pernah menjalankannya. Membacanya tidak
menemukan apa pun; menjalankannya menemukan dua cacat.

1. **`listen 443 ssl http2;` sudah deprecated** di nginx sekarang. `nginx -t` tetap melaporkan
   *test is successful* sambil warning dua kali, jadi template bisa berjalan ke kegagalan keras
   tanpa satu pun gate yang menyadari.
2. **Perbaikan mekanisnya mudah salah tempat.** Memindahkan `http2 on;` ke blok redirect
   port-80 juga lolos validasi, handshake TLS tetap jalan, lalu diam-diam melayani
   **HTTP/1.1**. Terukur pada sertifikat yang sama: `HTTP/1.1` dengan directive di blok salah,
   `HTTP/2` di blok TLS. Ini kelas "hijau karena alasan yang salah" yang paling sunyi — config
   valid, TLS berfungsi, semua respons benar, hanya versinya salah.

### 7b. Bukti

- `scripts/verify-tls-terminator.mjs` (`npm run tls:verify`) menjalankan nginx di atas template
  yang tersimpan di repo, hanya dengan dua substitusi yang memang diperintahkan
  `docs/deployment-recovery.md` (path sertifikat contoh dan alamat upstream). **12/12 PASS**:
  config diterima, **0 warning**, HTTP/2 dinegosiasikan (ALPN h2), proxy meneruskan, port 80
  redirect 301, **`/metrics` 403 dari luar loopback**, HSTS sampai ke klien, TLS 1.3
  dinegosiasikan, TLS 1.0 ditolak.
- Spec lama `test/deployment-recovery.contract.spec.ts` justru **mengunci bentuk deprecated
  itu** (`toContain('listen 443 ssl http2')`) — jadi suite melindungi cacatnya. Diperbarui
  supaya menuntut bentuk yang didukung, dan terbukti redden bila template dikembalikan ke
  bentuk lama.
- `test/nginx-tls-terminator.contract.spec.ts` — 10/10, dan terbukti RED pada mutasi. Diletakkan di
  `test/`, **bukan** di samping template: jest `roots` hanya `src`, `test`,
  `apps/user-mobile/src`, jadi spec di `ops/` akan kompilasi, lulus saat dijalankan manual, dan
  **tidak pernah ikut suite**. Guard yang tidak jalan lebih buruk dari tidak ada guard.
- Probe diregresi dua kali: bentuk deprecated → 4/11; `deny all` pada `/metrics` dihapus →
  `/metrics` answered 301 (publik). Keduanya tertangkap.
- Probe juga learns untuk berhenti di akar masalah: terminator yang gagal start sebelumnya
  menghasilkan enam baris `000` yang semuanya tampak seperti cacat terpisah; sekarang ia
  melaporkan satu kegagalan dengan penyebab `[emerg] invalid parameter ...` lalu berhenti.

### Gate (chain penuh)

| Gate | Hasil |
|---|---|
| `npx jest --silent` | **229 suite / 1648 test PASS** |
| `lint:check` · `web:typecheck` · `build` · `web:build` | exit 0 |
| `wave3:esp32:self-test` · `baseline:hygiene:clean` | exit 0 |
| `rescue:validate` | PASS 471/471 |
| `baseline:manifest:verify` | 1163/1163 + 1164/1164 |
| `npm run tls:verify` | 12/12 PASS |
| `CHAIN RESULT` | **ALL-GATES-PASS** |

Catatan: `pipefail` di chain langsung memberi hasil. Suite gagal pada putaran pertama
karena spec lama mengunci directive yang deprecated, dan `SOME-GATE-FAILED` muncul. Tanpa
`pipefail`, kegagalan itu tidak akan terlihat sama sekali.

### Status Wave 4

Keluar Wave 4: staging berbentuk produksi, TLS/secrets/backups/restore/rollback, runbook
operator, dan UAT baseline owner — semuanya sekarang punya bukti, bukan klaim.
Belum dikerjakan dan **bukan** syarat keluar Wave 4 menurut roadmap: rotasi secret tanpa
downtime (JWT `kid`/dual-key) — roadmap menaruhnya di **Wave 10**.

---

## Putaran 8 — Wave 5 (1): runtime webhook dari nol — 30 September 2026

### Census Wave 5 (lima area yang dinyatakan roadmap)

| Area | File non-spec | Controller | Rute BFF/UI |
|---|---|---|---|
| Sharing | 38 | 5 | 6 |
| RBAC | 33 | 13 | 3 |
| Organization/Branch | 7 | 2 | **0** |
| Webhook | 17 | 3 | **0** |
| **SDK** | **0** | 0 | **0** |

Dimulai dari webhook: `webhook_endpoints` dan `webhook_deliveries` ada di schema,
`PublicApiService.signWebhookPayload` ada — dengan **nol caller**. Tidak ada route untuk
mendaftarkan endpoint dan tidak ada yang menandatangani apa pun. Dua controller "webhook"
yang ada adalah inbound dari broker, dan `notification/webhook.transport.ts` milik notifikasi:
tiga hal berbeda yang namanya sama.

### Yang dibangun

- `src/webhook/webhook-runtime.service.ts` — `WebhookRepository` (semua read/write di-scope
  `tenantId`, bukan `id` saja) + `WebhookDispatchService` (dispatch, riwayat).
- `src/webhook/webhook.controller.ts` — `GET/POST/DELETE /admin/webhooks/endpoints`,
  `POST /admin/webhooks/endpoints/:id/rotate-secret`, `PATCH /admin/webhooks/endpoints/:id`,
  `GET /admin/webhooks/deliveries`, dijaga `JwtAuthGuard + TenantContextGuard + AdminRoleGuard`,
  tenant selalu dari verified context.
- `src/webhook/webhook.module.ts` + wiring di `app.module` dan `device.module`.
- `DeviceService.updateHeartbeat` sekarang memancarkan `device.state_changed`.

Keputusan yang ditulis eksplisit: **secret hanya dikembalikan sekali saat pembuatan** dan
tidak pernah lewat list surface; `listEndpoints` mengeksklusinya di `select`, bukan
membuangnya di JavaScript — `test/credential-column-exposure.contract.spec.ts` menangkap
pola itu di kode saya sebelum saya sadari. HTTPS diwajibkan, kecuali loopback
(`localhost`/`127.0.0.1`/`::1`) — pengecualian itu yang membuat runtime bisa diuji terhadap
receiver nyata tanpa sertifikat.

### Bukti

- `src/webhook/webhook-runtime.service.spec.ts` — **12/12**, termasuk resolusi DI
  `WebhookModule` (build hijau tidak menangkap DI lintas modul; hanya boot yang menangkap).
- Probe live **22/26**. Yang ter kuat: receiver di proses terpisah memverifikasi signature
  dengan HMAC miliknya sendiri → `valid: true`, jadi output `signWebhookPayload` benar-benar
  diterima pihak ketiga. Receiver mati tercatat FAILED tanpa menghentikan batch. Endpoint
  milik tenant lain 403. ID asing 404. Event tak dikenal 400. HTTPS di luar loopback 400.
  Probe idempoten: 0 endpoint tersisa setelah run.

### BELUM terbukti — dan sebuah temuan

Empat kegagalan probe semuanya di jalur pairing perangkat, dan **bukan** karena logika
webhook: `POST /devices/:id/pair` mengembalikan
`{message, deviceId, tenantId, mqttUri, mqttUsername}` — **tanpa kredensial perangkat** —
padahal `DeviceAuthGuard` membaca header `x-device-id` + `x-device-secret`. provisioningToken,
separuh kode pairing, dan kode pairing utuh ketiganya ditolak `DEVICE_CREDENTIALS_INVALID`.

Artinya: **jalur device→webhook belum teramati live.** Yang terbukti live adalah dispatch,
penandatangan, isolasi tenant, penanganan receiver mati, dan surface management. Emitter
`device.state_changed` terverifikasi oleh spec dan wiring modul, **bukan** oleh probe
end-to-end. Saya tidak mengklaim yang kedua.

Temuan produk yang layak dicatat terpisah: pairing mengembalikan username MQTT tanpa secret
yang harus dipresentasikan untuk heartbeat/rotate. Itu celah siklus hidup perangkat, dan
saya belum punya cukup bukti untuk menyatakan bentuk perbaikannya tanpa menebak.

### Gate

Belum dijalankan ulang untuk iterasi terakhir ini (spec webhook 12/12 dan
`credential-column-exposure` 30/30 hijau, `build` exit 0).

---

## Putaran 9 — Wave 5 (2): kebocoran branch organisasi — 30 September 2026

### Temuan

`GET /organizations/:id/branches` dijaga `AdminRoleGuard` saja, dan
`OrganizationService.listBranches` menerima **hanya** `organizationId` — tanpa siapa peminta.
Jadi satu-satunya pertanyaan yang dijaga adalah "apakah pemanggil ini admin tenant", bukan
"apakah organisasi ini milik pemanggil". Baris branch adalah
`{ organizationId, tenantId, label }`, jadi responsnya memetakan tenantId mana yang ada di
organisasi mana.

Database bersemula **kosong** di `organizations` dan `organization_branches`, jadi guard itu
tidak pernah diuji terhadap data nyata dan kebocorannya tidak terlihat. Jalur tulisnya
`POST /organizations` dijaga `PlatformRoleGuard` dan belum pernah dijalankan.

### Bukti RED (mutasi, bukan asumsi)

Spec baru `src/org/organization-branch-visibility.contract.spec.ts` gagal **kompilasi** lebih
dulu: `Argument of type '{...}' is not assignable to parameter of type 'string'`. Bentuk
kegagalannya persis defect-nya — methodnya tidak membawa aktor sama sekali.

Mutasi live di kemudian hari membuktikan kebocorannya nyata, bukan sekadar spec yang=django:
dengan guard otoritas dihapus, admin tenant dari luar organisasi membaca **200** beserta
`tenantId` platform `11111111-1111-4111-8111-111111111111`, dan organisasi yang tidak ada
membalas 200 (bukan 404) — jadi route itu sekaligus jadi oracle keberadaan. Setelah dipulihkan
(identik byte-per-byte, dicepakkan sha256): **9/9 PASS**.

### Perbaikan

- `listBranches({ organizationId, actorMembershipId, actorTenantId })` — memuat organisasi,
  mengizinkan **pemilik** dan **tenant yang cabangnya ada dalam grup**, menolak selainnya
  dengan `ORG_NOT_A_MEMBER`; `ORG_NOT_FOUND` untuk id tak dikenal.
- Controller meneruskan tenant & membership **dari konteks terverifikasi**, dan menolak
  konteks kosong alih-alih meneruskan `undefined`.
- Penolakan terjemah ke 403 dan 404. Kode ada di response body (`{code, message}`), bukan di
  instance exception.

Penolakan sengaja **bukan** daftar kosong 200: "tidak ada cabang" dan "bukan milikmu" adalah
dua fakta berbeda, dan hanya satu yang boleh dibocorkan. Pola diam yang sama yang membuat
quota fail-open dan tabel RBAC terlihat sehat.

### Allowlist yang ternyata melindungi klaim palsu

`test/tenant-isolation-at-query-layer.contract.spec.ts` classifies `listBranches` sebagai
`enforcedBySiblingQuery` dengan komentar "`organizationId` datang dari caller yang sudah
menyelesaikan organisasi pemanggil sendiri". **Tidak ada caller yang begitu** — id diambil
dari path URL. Allowlist itu mendokumentasikan niat yang tidak pernah ada di kode; ia tetap
di daftar (guard ini memeriksa *keberadaan* scoping call, bukan kebenaran keputusan otoritas),
dengan regex dan komentar yang sekarang menyatakan kenyataan.

### Gate

`231 suite / 1669 test` — 2 suite sempat gagal karena spec kontrak baru belum terdaftar di
`test/contract-surface-policy.json` dan allowlist di atas; keduanya diperbaiki. Spec `src/org/`
**24/24**, live probe **9/9** pada kode dipulihkan.

### Sisa Wave 5

Organization/Branch: surface backend kini punya otoritas yang benar, tapi **masih 0 rute
BFF/UI** — tidak ada layar untuk managing organisasi/cabang. **SDK: masih 0 file, 0
controller, 0 route** dari nol.

## Putaran 10 — Wave 5 (3): vocabulary webhook dan pengungkapan kegagalan — 30 September 2026

### Titik awal: guard yang diklaim tapi tidak pernah ada

Sesi sebelumnya (puter 21:06–21:09) meninggalkan BFF/UI untuk organisasi dan webhook tanpa
checkpoint. Sweep seluruh referensi path di repo menemukan **satu spec yang diklaim di dalam
komentar tetapi nol file**:

`apps/admin-web/app/api/admin/webhooks/endpoints/route.ts:14` menulis *"test/webhook-surface
.contract.spec.ts asserts this list still matches the backend's, so the copy cannot drift
silently."* Spec itu tidak pernah dibuat. Guard yang disebut adalah hiasan.

### Enam defect yang tersembunyi di balik komentar itu

1. **Vocabulary melenceng di dua tempat.** BFF menawarkan 8 event, backend menerima 6, hanya
   4 yang beririsan. `command.issued` adalah checkbox di UI dan **400 dari API** — produk
   menampilkan tombol yang tidak mendukungnya sendiri.
2. **Tiga event tidak pernah dipancarkan.** `telemetry.threshold_breached`, `alert.raised`,
   `incident.opened` ada di daftar subscription; tidak ada model `Alert`/`Incident` di schema
   sama sekali. Berlangganan = janji yang tidak bisa ditepati.
3. **`device.registered` bisa berlangganan tanpa emitter.** Satu-satunya `.dispatch(` di
   `src/` adalah `device.state_changed` dari heartbeat.
4. **Kegagalan tanpa alasan.** Halaman mengklaim "kegagalan ditampilkan terbuka"; tabelnya
   hanya punya kolom ok/kode. `ok:false, statusCode:null` tidak bisa dibedakan refused vs
   tidak terjangkau.
5. **`TypeError: fetch failed` tanpa causa.** Live probe membuktikannya: `error.message` = 
   `"fetch failed"`, `error.cause.message` = `"bad port"`. Semua kegagalan transport sama.
6. **Dispatcher tanpa timeout** — ditemukan **live, bukan dari baca kode** (lihat bawah).

### Perbaikan

- Vocabulary dipersempit ke yang benar-benar dipancarkan; `DeviceService.emitEvent` menjadi
  helper bersama dan `create()` memancarkan `device.registered`.
- Kolom `reason` + migrasi `20260930210000_webhook_delivery_failure_reason` (37 migrasi,
  diterapkan ke DB live). Nullable supaya 29 baris lama tetap valid.
- `describeTransportFailure` menelusuri rantai `cause`, membuang pesan wrapper, dedup.
- `AbortSignal.timeout(DISPATCH_TIMEOUT_MS)` = 10 detik.
- Spec `test/webhook-surface.contract.spec.ts` (11 test) + `src/device/device-webhook-
  emission.spec.ts` (4 test). Keduanya **RED lebih dulu**.

### Dua guard yang harus jujur soal bentuknya

`describeTransportFailure` menghasilkan **7 string berbeda dari 7 kegagalan berbeda**
(diverifikasi `scripts/check-transport-failure-reasons.ts`). Pertemuan hidup: versi pertama
saya terlihat menyalin "fetch failed" dan menduplikasi segmen — jadi pemeriksaan ini ditulis
sebagai file, bukan `node -e` inline (inline-nya mati karena error TypeScript sendiri dan
tidak melaporkan apa pun tentang kode yang dicek).

Guard extractor di spec harus mengenal **dua** bentuk pemanggil (`.dispatch(` **dan**
`.emitEvent(`). Setelah refactor ke helper bersama, extractor yang hanya kenal satu bentuk
melaporkan "tidak ada yang dipancarkan" — gagal secara salah. Assertion positif
(`expect(emitted).toEqual([...])`) ditambahkan supaya extractor yang cocok nol terdeteksi
sebagai guard rusak, bukan sebagai produk yang membaik.

### Bukti live (bukan inferred)

Probe `scripts/probe-webhook-event-vocabulary.sh` → **24/24 PASS** di container yang
dibangun ulang (digestrunning = digest built). Yang dibuktikan:

- API menolak `command.issued` dengan pesan yang menyebut event itu **dan** daftar
  penggantinya.
- `POST /devices` benar-benar mengirim `device.registered` ke receiver HTTP sungguhan: byte
  masuk, payload menyebut device yang dibuat, header `x-iot-signature` terisi.
- Baris delivery: `ok:true, 200`. Gagal: `ok:false, statusCode:null, reason:"ECONNREFUSED"`.
- Refused vs wedged mencatat **alasan berbeda** — properti yang jadi alasan kolomnya ada.

**Bukti browser** (`next dev --port 5001`, login nyata): kolom **ALASAN** tampil dan terisi.
Tepat **3 opsi event** di form (sebelumnya 9). Pendaftaran dari UI menampilkan signing secret
sekali, endpoint aktif, dan device yang dibuat sesudahnya sampai ke receiver bertanda tangan.

Baris lama `fetch failed <- ECONNREFUSED` masih terlihat di riwayat — itu bukti perubahan
memang terjadi, bukan data yang dibuat-buat.

### Jebakan runtime yang baru terverifikasi

- **Undici memblokir port 1, 7, 9, 19 sebelum socket dibuka.** Port 9 yang biasa dipakai
  sebagai "receiver mati" mencatat `bad port`, **bukan** ECONNREFUSED. Probe yang memakainya
  sebagai bukti "koneksi ditolak" salah. Port tertutup yang benar: **45098**.
- **Aturan HTTPS dan loopback saling mengunci untuk proof live.** API menolak receiver
  plain-HTTP di luar loopback; loopback container tidak terjangkau dari host; jadi receiver
  harus jalan **di dalam container** (`docker exec -d`), bukan diperlonggarkan.
- **Fixed sleep vs timeout produk.** Dispatcher 10 detik per endpoint secara berurutan;
  `sleep 3` melaporkan baris yang belum ada sebagai dispatcher rusak. Probe kini polling
  sampai deadline.
- **Probe menumpuk device dan mengisi kuota.** Tidak ada `DELETE /devices/:id`; kuota 10/tenant.
  Run sebelumnya meninggalkan cukup device sampai `POST /devices` membalas 402 — yang
  dilaporkan sebagai emitter rusak. Probe sekarang menyapu residu prefix-`probe%` di awal.
- **Template literal di field `event` logger ditolak guard structured-logging.** `event` harus
  literal karena itu field yang di-*group* aggregator; nama domain event pindah ke field
  `webhookEvent`.
- **Menambah query ke service broke semua double spec lama.** `device.create` kini me-*resolve*
  row; spec lama tidak menyetel return-nya dan gagal membaca `.id` dari `undefined`.

### Gate (semua dijalankan di tree akhir)

`236 suite / 1708 test` · lint/typecheck/build/web:build exit 0 · esp32 PASS ·
`rescue:validate` 471/471 · `manifest:verify` 1190/1190.

Empat mutasi, masing-masing ditangkap assertion berbeda: allowlist diberi event asing,
emitter dihapus, kolom `reason` dibuang di `recentDeliveries`, rantai `cause` diputus,
`signal:` dihapus. Setiap pemulihan dicepakkan sha256 identik.

### Sisa Wave 5

Organization/Branch: BFF + UI sudah ada (`/tenant/organisasi`). **SDK tetap 0 file dari nol**
— `packages/sdk/` masih perlu dihitung ulang: ada file, tapi belum ada yang consume-nya.

## Putaran 11 — Wave 5 (4): SDK dibuktikan end-to-end — 30 September 2026

### Temuan: semua klaim tentang SDK adalah klaim tentang kode yang membaca kode

Roadmap Wave 5 baris 27 meminta *"SDK and contract gaps closed **end-to-end**"*. Yang ada:
`packages/sdk/` berisi `PublicApiClient` (3 method), `PublicApiError`, types, dan
`sdk:typecheck` hijau. Spec `test/public-api-sdk-contract.spec.ts` (7 test) membaca decorator
controller **dan** SDK lalu membandingkan — **dua arah**, plus scope vocabulary, header, dan
error typing.

Yang tidak ada: **sebelum hari ini tidak ada satu pun `new PublicApiClient()` di repo ini.**
Sembilan assertion itu semuanya source-shaped. Tidak satu pun membuktikan panggilan pertama
seorang integrator berhasil. Itu gap yang sama seperti tabel dengan reader tanpa writer, hanya
bentuknya lebih halus karena semuanya hijau.

### Perbaikan

- `scripts/probe-public-api-sdk.mts` — probe yang **import client asli** dan memanggil API
  nyata. Script baru `npm run sdk:probe`.
- Spec SDK +2 test: probe ada dan ter-wire, dan SDK tetap loadable oleh consumer yang
  diklaimnya dilayani.

### Bukti live: 14/14 PASS

- Ketiga method mengembalikan envelope `{items, count}` dan **menghormati limit**.
- **Tidak ada kolom kredensial di wire** — `provisioningTokenHash` dan `deviceCredential`
  absen dari baris device. Sebelumnya ini hanya_SOURCE-shaped; sekarang terbukti di kabel.
- Key ditolak → `PublicApiError` **bertipe**, dengan `status` terbawa (401), bukan raw throw.
- Limit 5000 di-clamp, bukan ditolak.
- **Setelah pencabutan, key mati** — dan itu diverifikasi dengan memanggil lagi, bukan dari
  exit code.

### Jebakan toolchain yang ditemukan, dan why the file is `.mts`

`packages/sdk/package.json` mendeklarasikan `"type": "module"`. Probe `.ts` pertama mati
`ERR_REQUIRE_ESM` **sebelum membuat satu pun request**: `ts-node` di repo ini resolve ke CJS,
jadi tidak bisa `require` file ESM. Dua percobaan gagal sebelum jelas.

Tapi ini **bukan defect SDK** — `node --experimental-strip-types` (consumer asli seorang
integrator) meng-import file yang sama tanpa masalah, dan itu sudah diverifikasi. Yang salah
adalah runner-nya. Probe dipindah ke `.mts` dan dijalankan dengan `node --experimental-strip-types`.
Satu spec baru mengunci keputusan itu, supaya "penyederhanaan" ekstensi di masa depan tidak diam-diam
memindahkan probe ke runner yang tidak bisa memuat SDK.

### Satu guard yang salah arah, dan cara saya memperbaikinya

Assertion `expect(sdk()).not.toMatch(/constructor\(\s*readonly\s+/)` **gagal pada kode yang
benar**. Polanya cocok dengan **komentar** SDK sendiri yang mengutip
`constructor(readonly status: number, ...)` sebagai penjelasan aturan — bukan kode. Guard yang
tidak bisa membedakan penjelasan dari hal yang dijelaskan akan "diperbaiki" dengan menghapus
penjelasan. Diperbaiki dengan men-strip komentar dulu, lalu mencocokkan.

### Mutasi keenam

`sdk:probe` dihapus dari `package.json` → spec "has a live probe" **RED**. Dipulihkan, sha256
identik. Yang diuji: probe tanpa script entry adalah probe yang tidak pernah dijalankan, dan
itu setara dengan tidak ada probe.

### Gate

`236 suite / 1710 test` · lint/typecheck/`sdk:typecheck`/build/web:build exit 0 ·
esp32 PASS · `rescue:validate` 471/471 · `manifest:verify` 1191/1191.

### Catatan disiplin kerja (disepakati bersama owner)

Owner 지적 pola kerja berulang terlalu lama. Default baru yang berlaku sejak giliran ini:
jangan jalankan full suite kalau tidak ada perubahan di `src/`/`apps/`/`prisma/`; edit terisolasi
→ **satu** full suite di akhir; edit sentuh `app.module.ts`/`schema.prisma`/shared contract →
gate penuh; **satu `curl` untuk baca bentuk respons sebelum menulis probe**; maksimal 3 mutasi
per guard. Yang tidak dikurangi: bukti live, karena itu yang menemukan defect timeout.

## Putaran 12 — Wave 6 (1): capability template lifecycle — 30 September 2026

### Census Wave 6 lebih dulu, karena roadmap tidak bisa dipercaya sebagai ukuran

Empat declared class. Grep pertama saya menghitung `.next/cache` dan melaporkan NOC 101 file,
MQTT 143 — hampir membuat saya menyimpulkan Wave 6 jauh lebih besar dari kenyataan. Diulang dengan
`--exclude-dir=.next`:

| Class roadmap | Kenyataan | Status |
|---|---|---|
| Capability template/version **lifecycle** | `CapabilityTemplate`/`CapabilityVersion` **tidak ada di schema**; route `GET platform-capabilities/versions` **read-only** | **nol** |
| Live MQTT management evidence | 25 file `src/`, 3 webhook EMQX, 4 worker tercatat | substantial |
| NOC | 0 file `src/`, tapi UI baca 4 BFF yang semuanya ada | substantial |
| Reports/audit/operational | `ReportService`/`ReportsController` **tidak ada**; audit ada | reports nol |

Jadi Wave 6 **sudah started**, bukan nol. Yang nol: template lifecycle dan reports. Unit ini
memilih yang nol, dan yang drift-nya **tidak bisa diperbaiki dari mana pun**.

### Yang sebenarnya bermasalah: drift yang terlihat tapi tidak punya jawaban

`GET /admin/platform-capabilities/versions` sudah melaporkan `hasVersionDrift`, dan konsol sudah
merendernya. Tapi tidak ada template, tidak ada publikasi, dan tidak ada route yang memindahkan
perangkat ke versi yang jadi standar. Operator yang melihat laporan drift tidak bisa
menyelesaikannya — jadi panel itu keluhan, bukan kontrol. Komentar di panel itu sendiri
mengakuinya dengan jujur (`templateEntity: 'ABSENT'`).

### Dua keputusan owner, diimplementasikan bukan dichotom

- **Operator-initiated.** Publish **tidak menyentuh perangkat**; apply adalah tindakan tersendiri.
  Publish yang menulis fleet akan membuat "publish 2.0.0" jadi perubahan schema sefleet dari satu
  klik form.
- **Capability terikat ditolak.** Dashboard binding dan automation yang sudah menunjuk capability
  itu tidak diubah — hanya capability itu yang punya widget di belakangnya. Refusal membawa
  **count-nya**, supaya jadi daftar kerja, bukan jalan buntu.

### Satu bug yang hampir terkirim

`@@unique([templateId, status])` untuk membatasi PUBLISHED. Itu terlihat seperti instinctively
benar, dan diam-diam membatasi template pada **satu DRAFT dan satu DEPRECATED selamanya** —
artinya deprecation kedua, kejadian biasa dalam hidup sebuah template, gagal pada constraint yang
tidak jelas penyebabnya. Diganti partial unique index:

```sql
CREATE UNIQUE INDEX ... ON capability_template_versions("templateId") WHERE "status" = 'PUBLISHED'
```

Diverifikasi langsung di Postgres, bukan dari baca kode: **DRAFT ×2 diterima, DEPRECATED ×2
diterima, PUBLISHED kedua ditolak** (`violates unique constraint
capability_template_versions_one_published_per_template`, exit 3).

### Dua defect nyata yang lahir dari bukti live, bukan dari rencana

**1. Lifecycle tidak punya cara kembali.** Restore data di probe butuh memublish `1.0.0` setelah
fleet naik ke `9.9.9`. `publishVersion` menolak versi yang lebih rendah — benar secara
prinsip, tapi membuat publikasi buruk **permanen**. `Lobby Sensor` (device produksi) tertinggal
di `9.9.9` tanpa jalan keluar.

Diperbaiki: flag `rollback` eksplisit, pesan penolakan menyebutkannya, dan audit mencatat
`rollback=true supersedes=2.0.0`.

**2. Publish tidak idempoten untuk versi yang sudah ada.** Setiap template lahir dengan draft
`1.0.0`, jadi "publish 1.0.0" bukan edge case — itu aksi pertama operator. `create` selalu
dipakai, jadi melanggar `@@unique([templateId, version])` → **500**. Rollback yang paling dibutuhkan
saat publikasi gagal justru yang paling mungkin kena. Diperbaiki: versi yang ada di-promote,
bukan dibuat ulang.

### Guard yang mengunci keputusan, bukan kata

Empat spec source-shaped (`test/capability-template-lifecycle.contract.spec.ts`, 16 test):
partial index vs composite unique · rollback harus bernama · promote-bukan-create · refusal
memakai kedua tabel referensi · `updateMany` tanpa `where` kosong ditolak · actor dari session.

Empat di antaranya guarding guard yang selama ini salah:

- Guard spec saya semula menolak kode **benar** karena pola `constructor(readonly` cocok dengan
  **komentar** SDK. Diperbaiki dengan strip-komentar dulu.
- Guard `historical-contract-transition-safety` menolak spec baru sebagai `UNCLASSIFIED_CONTRACT`;
  diklasifikasikan `current-state`, dan hardcode `currentStateContracts` di spec itu diperbarui.
- Guard rescue `platform dispatch reads the actor` menyodorkan `length === 1` — benar saat `dispatch`
  satu-satunya route platform yang menulis audit. Lima route lifecycle membuatnya gagal, dan
  longgarkan ke "at least one" **berhenti menguji apa pun**. Diganti: setiap actor read di
  controller ini harus dari session, plus helper-nya diassert.
- Guard rescue `templateEntity: 'ABSENT'` **mengunci klaim yang sudah salah**. `fix` termudah
  adalah mengembalikan string itu — dan konsol lalu memberi tahu operator produk yang punya
  template lifecycle bahwa template-nya tidak ada. Diassert invariant-nya, bukan string-nya.

### Bukti live: 37/37

`scripts/probe-capability-template-lifecycle.mts` + runner + fixture + cleanup SQL. Yang dibuktikan:

- Publish → `devicesAffected: 0` dan pesan eksplisit "publishing does not change devices"
- Apply tanpa versi published → 409 · publish kedua tanpa `supersede` → 409 · publish versi lebih
  rendah tanpa `rollback` → 400 · tenant kosong → 400 · tenant admin → 403
- **Refusal bekerja**: dry-run dan commit menolak set yang sama dengan `bindingCount` dan
  `automationCount`, dan commit **tetap** memperbarui yang tidak terikat — satu widget terikat
  tidak boleh memblokir seluruh fleet
- Tekan kedua melaporkan refusal yang sama, bukan mengklaim kerja baru
- Rollock: publish `1.0.0` dengan `rollback: true` → `updated: 1`, `Lobby Sensor` kembali

**Browser**: login platform admin → `/super/capabilities` → isi tenant → tombol **"Terapkan
2.0.0"** → **"Pratinjau: 1 perangkat akan diperbarui, 0 ditolak"** → "Ya, terapkan sekarang" →
`Lobby Sensor` naik ke `2.0.0` di database, audit `updated=1 refused=0`. Lalu dikembalikan ke
`1.0.0` lewat rollback yang sama.

### Defect UI yang hanya terlihat di browser

Panel menampilkan **"tidak terdeteksi drift"** dan **tidak offers Terapkan**, padahal 21
perangkat menyimpang dari template 2.0.0. Penyebabnya: daftar drift membandingkan
`schemaVersion` **antar-perangkat**, dan tidak tahu apa-apa tentang template. Fleet yang
konsisten di 1.0.0 sambil template-nya 2.0.0 dilaporkan "tidak ada drift".

**Konsistensi diri bukan kesesuaian.** Sekarang tombol muncul untuk setiap template yang punya
versi published, dan "sudah di versi ini" hanya ditampilkan dari `alreadyOnTarget` — properti
template, bukan daftar drift.

### Jebakan yang saya sebabkan sendiri

Probe costing lebih dari yang seharusnya. `/admin/devices` tidak ada; `/devices` dan
`/devices/:id/capabilities` **tenant-scoped dan mengabaikan `tenantId`** (benar secara keamanan —
route device yang lintas tenant akan membiarkan sesi mana pun membaca capability tenant lain, jadi
tidak dilonggarkan); pesan error ada di `error.message`; guard butuh platform admin;
`seed-demo-accounts.mjs` meregenerasi password tiap panggilan sehingga dua panggilan menghasilkan
dua pasang berbeda; `mode: 'AUTO'` bukan enum valid.

Semuanya bisa dicegah dengan **satu curl** — aturan yang owner tetapkan dan yang saya langgar
beberapa kali sebelum menerapkannya.

**Snapshot-based restore juga menutupi kerusakannya**: ia memulihkan ke "apa pun yang dibaca",
jadi setelah satu run merusak fleet, run berikutnya membaca keadaan rusak itu, memulihkannya, dan
`the fleet is back` **lolos** dengan kedua sisi sama-sama salah. Sekarang targetnya konstanta
`1.0.0` dan precondition gagal keras kalau fleet ada di tempat lain.

### Gate

`237 suite / 1726 test` · lint/web:typecheck/sdk:typecheck/build/web:build exit 0 · esp32 PASS ·
`rescue:validate` **473/473** (naik dari 471 — dua guard baru) · `manifest:verify`lihat checkpoint
berikutnya.

Tidak ada commit, tidak ada push.

### Rekaman glyf asing di checkpoint ini

Baris checkpoint yang ditulis putaran ini memuat beberapa glyph CJK yang tidak sengaja — `决定`, `动作`, `违反`, `听证`. Semuanya sudah diganti dengan kalimat
Indonesia yang benar, dan `grep -P '[\x{4e00}-\x{9fff}]' docs/SESSION-CHECKPOINT.md` sekarang
nol. Dicatat karena `baseline:hygiene:clean` dan `manifest:verify` **tidak** menangkapnya: keduanya
memverifikasi hash dan cleanliness, bukan keterbacaan. Kalau glyph seperti ini muncul lagi, itu
sinyal bahwa penulisan checkpoint perlu satu lint baca.

---

## Titik lanjut — baca ini duluan besok

Sesi berikutnya mulai dari sini, bukan dari `git log`.

### 1. Gate terakhir yang sudah dijalankan (tree akhir)

| Gate | Hasil |
|---|---|
| Jest | **237 suite / 1726 test** PASS |
| lint / web:typecheck / sdk:typecheck | exit 0 |
| build / web:build | exit 0 |
| esp32 self-test | PASS |
| `rescue:validate` | **473/473** PASS (naik dari 471 — dua guard baru) |
| `manifest:verify` | **1202/1202** source, **1203/1203** hash |
| `capability-template:probe` | **37/37** PASS, exit 0, dua kali berturut, residue 0 |

Tidak ada gate yang perlu diulang kecuali source berubah.

### 2. Cara menjalankan proof capability template

```
npm run capability-template:probe
```

Runner-nya melakukan sweep residue **sebelum dan sesudah**, membuat fixture (device + capability
+ dashboard binding + automation, karena tenant demo tidak punya binding-nya sendiri), lalu
menjalankan probe. Restore dilakukan **lewat lifecycle** (`rollback: true`, bukan SQL) — itu
satu-satunya cara yang sah, dan sekaligus bukti bahwa apply punya inverse.

Kalau probe gagal dengan `the fleet starts on 1.0.0`, **jangan langsung rerun**. Itu precondition
yang menangkap fleet dalam keadaan rusak; perbaiki kondisinya dulu.

### 3. Sisa Wave 6

| Class roadmap | Status | Catatan |
|---|---|---|
| Capability template/version lifecycle | ✅ **selesai** | Drift yang dulu tak punya jawaban |
| Live MQTT management evidence | **substantial, belum diaudit** | 25 file `src/`, 3 webhook EMQX, 4 worker tercatat |
| NOC | **substantial, belum diaudit** | 4 BFF hidup, 0 file `src/` sendiri |
| Reports | **nol** | `ReportService`/`ReportsController` tidak ada |

"Substantial" itu **hitungan file, bukan bukti** — dan sudah dua kali jadi hampir menyesatkan
sesi ini (grep menghitung `.next/cache`). Audit keduanya dulu supaya angkanya terukur, atau
langsung ke reports yang gap-nya jelas nol. Janganigon both sebagai "sudah dikerjakan".

### 4. Yang di luar Wave 6

Wave 1–2 CLOSED, Wave 3 ACTIVE, **Wave 4–13 = 10 wave belum dimulai** — dari
`docs/ENTERPRISE-WAVE-ROADMAP.md`. Angka "30 modul foundation-complete" itu denominator lain dan
**tidak boleh dipakai** untuk menghitung sisa.

### 5. Disiplin kerja (disepakati bersama owner, masih berlaku)

- Tidak menjalankan full suite kalau tidak ada perubahan di `src/`/`apps/`/`prisma/`
- Edit terisolasi → **satu** gate penuh di akhir
- **Satu `curl` untuk baca bentuk respons sebelum menulis probe** — aturan ini saya langgar
  berulang kali (/admin/devices tidak ada, /devices tenant-scoped, pesan di `error.message`,
  enum `AUTO` tidak valid). Semua bisa dicegah satu curl.
- Maksimal 3 mutasi RED per guard
- Bukti live **tidak** dikurangi — di situlah defect rollback, publish non-idempoten, dan drift
  yang tak terlihat muncul

### 6. Dua pelajaran yang bentuknya masih berulang

- **Snapshot-based restore menutupi kerusakannya sendiri.** Memulihkan ke "apa pun yang dibaca"
  berarti setelah satu run merusak fleet, run berikutnya membaca keadaan rusak itu, memulihkannya,
  dan assertion "fleet is back" lolos dengan kedua sisi sama-sama salah. Target harus konstanta
  yang diketahui, dan precondition harus gagal keras kalau keadaan berbeda.
- **Guard yang mengunci klaim yang sudah salah lebih berbahaya daripada guard yang tidak ada.**
  `templateEntity: 'ABSENT'` gagal setelah template landed; fix termudah mengembalikan string itu
  dan konsol lalu berdusta kepada operator. Asert invariant, bukan string.

### 7. Yang TIDAK boleh diklaim sebagai selesai

- Konsol capability template **sudah** dibuktikan di browser (login → Terapkan → preview →
  konfirmasi → device naik ke `2.0.0` → audit → dikembalikan via rollback). Itu nyata.
- Tapi **tidak ada konsol untuk publish/deprecate** — lifecycle hanya bisa dijalankan lewat API.
  Papan drift bisa *menerapkan* versi, tidak bisa *menerbitkan* satu. Itu gap UI yang diketahui.
- **MQTT sudah tertutup** (putaran 14) — lihat di bawah.
- Tidak ada commit, tidak ada push. HEAD `993f957`, tree 287 entri.

## Putaran 13 — Wave 6 (2): saved reports — 1 Oktober 2026

### Census ulang, karena klaim "reports nol" dari putaran sebelumnya salah

Census putaran 12 menulis `ReportService`/`ReportsController` **tidak ada** dan concluded reports
adalah gap yang jelas nol. Itu **salah**, dan saya baru menyadarinya karena roadmap menyebut kata
"reports" dan saya langsung mengaudit satu class saja:

- `GET /admin/platform-reports/tenant-summary` **ada** — agregat lintas-tenant yang nyata
- `apps/admin-web/components/super-reports-content.tsx` **ada** — 24 jam / 7 hari / 30 hari
- Export CSV **ada** — 13 kolom, dari row yang sama dengan yang ditampilkan

Jadi reports **tidak nol**. Yang tidak ada bukan "reports", tapi laporan yang **reproducible**.

### Gap yang sebenarnya

Kedua laporan itu menghitung ulang dari `now`. Benar tentang saat ini, tidak berguna untuk hal
lain: angka yang operator baca hari Senin tidak bisa diambil lagi hari Selasa, jadi laporan tidak
bisa direproduksi, dan laporan yang tidak bisa direproduksi tidak bisa dipakai untuk rekonsiliasi
dua orang yang membacanya pada waktu berbeda.

Keputusan owner: **operator menyimpan run-nya sendiri, konsol menampilkan laporan lalu, dan bisa
diunduh ulang. Retensi 28 hari.**

### Dua keputusan yang saya ambil sendiri, dan alasannya

- **Simpan manual, bukan otomatis.** Arsip yang tumbuh sendiri adalah tabel yang tidak dibaca
  siapa pun, dan akan terisi laporan untuk sekali lirik.
- **Tanpa scheduler.** Dikonfigurasi juga; jadi tidak ada kolom `cron` yang dibaca apa pun. Kolom
  seperti itu terlihat tersedia di data model dan tidak tersedia di produk — bentuk defect yang
  pernah ditemukan di repo ini.

### Retensi 28 hari harus ditegakkan, bukan dijanjikan

`expiresAt` ditulis saat insert, bukan dihitung saat baca. Kalau dihitung, kebijakan retensi
menjadi milik setiap pembaca, dan satu pembaca yang lupa akanPresentationikan laporan selamanya.
Diperkuat: `MAX_REPORT_HOURS` 31 hari vs retensi 28 hari **tidak sama** dan itu disengaja —
satu menjawab "berapa lama boleh dibaca", satu "seberapa jauh boleh menjangkau".

### Yang hanya terlihat di browser: **tenant mismatch**

`POST` berhasil (201), row ada di DB, tapi **daftar kosong**. Penyebabnya: BFF membaca tenant dari
**cookie session** (tenant platform `1111…`) sementara laporan disimpan untuk **target tenant**
`2222…`. Arsip ditulis di satu tenant dan dibaca di tenant lain.

Argumen yang saya pakai waktu itu — "parameter `tenantId` di URL akan membiarkan sesi membaca
arsip tenant lain" — **benar dan implementasinya salah**. Laporan tersimpan milik target tenant
yang dipilih operator; sesi milik tenant platform. Ketiadaan parameter itu tidak melindungi
apa pun, ia hanya menyembunyikan ketidakcocokan tenant.

Batas yang sebenarnya adalah `PlatformRoleGuard` di backend, dan itu sudah diuji probe (tenant
admin → 403). BFF sekarang **bertanya tenant mana**, dan menolak menebak: fallback diam-diam ke
tenant session akan menampilkan arsip tenant platform dan terlihat seperti jawaban yang sah.

Tabel arsip sekarang punya input tenant eksplisit, dan tombol Simpan **disabled** selama tenant
belum dipilih — karena laporan lintas-tenant tidak bisa menentukan tenant tujuan, dan memakai baris
pertama berarti arsip dikreditkan ke tenant mana pun yang kebetulan urut pertama.

### Guard yang harus dibalik, dan alasannya

Spec saya guarding "BFF tidak boleh meneruskan tenant dari browser". Guard itu benar saat saya
tulisnya, dan setelah bug ditemukan ia **mengunci perilaku yang salah**. Assertion negatif juga
kena jebakan ketiga kalinya: kata `cookie` ada di docblock yang justru **menjelaskan** kenapa
cookie tidak boleh dipakai. Jadi ada helper `readCode()` yang men commenters lebih dulu. Yang
ketika sudah dihapus dari route, tapi komentarnya masih **memuji** perilaku lamanya — jadi kode
mati yang salah harus ikut hilang, bukan cuma compilation-nya.

### Bukti

- **Source contract 12/12**, dengan tiga mutasi RED: payload kosong, filter expiry dimatikan, actor
  dari body — ketiganya terdeteksi
- **Live 27/27, exit 0, dua kali berturut, residue 0**
- **Browser**: tenant diisi → **Simpan laporan** → **"2 laporan · retensi 28 hari"**, dua baris
  dengan range, jumlah baris, tanggal kedaluwarsa, tombol **Unduh CSV**
- **Bukti penentu**: payload tersimpan `generatedAt 18:15:41` **≠** live `18:15:56`, dan dua
  unduhan identik. Kalau download menghitung ulang, keduanya akan sama dengan live.

### Residue yang hampir saya abaikan

Run pertama melaporkan **residue 1**. Row itu milik tenant **"Browser Demo Tenant"** — tenant
nyata, dibuat `seed-demo-accounts.mjs`, ditulis oleh build konsol **lama** yang menebak tenant dari
baris pertama laporan lintas-tenant. Jadi bukan kebocoran tenant dan bukan kegagalan probe, tapi
sweep yang di-hardcode ke `2222…` **tidak bisa melihatnya**. Sekarang sweep menghapus semua
`saved_reports` — aman karena setiap row adalah snapshot yang bisa direproduksi, dan tidak menyentuh
perangkat, capability, template, atau tenant.

### Guard structured logging menangkap saya sendiri

`this.logger.log({ detail }, 'pesan')` — dua argumen, gaya `log(message, context)` milik Nest,
yang membuat argumen kedua terbaca sebagai teks bebas. Di sini itu **nama event**, yang tidak
pernah dibaca pipeline. Guard menolak; `event` dipindah ke dalam objek.

### Gate

`238 suite / 1738 test` · lint/web:typecheck/sdk:typecheck/build/web:build exit 0 · esp32 PASS ·
`rescue:validate` **473/473** · `manifest:verify` **1210/1210** + **1211/1211** ·
`saved-reports:probe` **27/27** dua kali, residue 0.

HEAD tetap `993f957`, 281 entri. **Tidak ada commit, tidak ada push.**

## Putaran 14 — Wave 6 (3): live MQTT management evidence — 1 Oktober 2026

### Baca roadmap sebagai kalimat, bukan daftar noun

Declared class: "live MQTT management **evidence**". Syaratnya berisi kata *evidence*, dan itu yang
membedakan kelas ini dari dua sebelumnya. "Capability template lifecycle" dan "reports" jelas fitur.
"Live MQTT management evidence" meminta **buktinya**.

Census: publish sudah lengkap dan nyata — `mqtt-js-publisher.adapter` konek, webhook
`POST /mqtt/auth` + `POST /mqtt/acl` adalah jalur yang dilewati setiap device. Dan EMQX ter-expose di
18083 dengan kredensial di `.env` (`EMQX_API_URL`, `EMQX_DASHBOARD_USERNAME`).

**Tapi tidak ada satu pun file sumber yang membacanya.** Management adalah tab dashboard yang
dibuka manusia dengan tangan — tanpa jejak di konsol, tanpa batas tenant, tanpa apa pun untuk
dikorelasikan dengan sebuah device. Jadi gap-nya bukan fitur, tapi persis apa yang diminta: bukti.

### Yang jadi

`MqttManagementService` — satu GET, read-only. Menjawab ke broker sungguhan, bukan melaporkan
apa yang sudah platform ini yakini. Publisher yang terhubung di UI adalah hal yang platform believe
dalam; bukti hanya bisa datang dari broker.

Empat keputusan yang menentukan:

- **Read-only.** Tidak ada disconnect, tidak ada ubah topik, tidak ada restart. Dikonfirmasi live:
  `POST` dan `DELETE` ditolak. Permukaan yang bisa memutus perangkat punya blast radius jauh
  lebih besar dari yang hanya mengamati, dan tidak ada yang memintanya.
- **Kredensial tak pernah keluar server.** Dibaca dari konfigurasi, token tak pernah dikembalikan.
  Checkbox live: `"token":` dan `"password":` tidak ada di respons.
- **Auth per panggilan.** Cache token mengubah ganggu sesaat jadi kegagalan permanen, dan menjaga
  kredensial yang sudah dirotasi tetap hidup sampai restart — justru jendela yang harus ditutup.
- **Broker mati bukan fleet kosong.** `brokerReachable` ikutSetiap respons.

### Uji yang menentukan: matikan brokernya

Dinyatakan mustahil diam-diam sebelum diuji: UI tidak akan pernah menampilkan angka 0 pada kondisi itu. Jadi
probe menghentikan `iot-rescue-emqx` dan melihat apa yang dilapor:

| | broker hidup | broker mati |
|---|---|---|
| `brokerReachable` | `true` | **`false`** + alasannya |
| `clientCount` | 1 | 0 |
| `subscriptionCount` | 0 | **`null`**, bukan 0 |
| `clients` | 1 baris | **0 baris — tidak dikarang** |

`subscriptionCount` jadi `null` saat broker mati, bukan `0`, karena "nol subscription" adalah klaim
tentang fleet sedangkan "tidak diketahui" adalah klaim tentang platform. Klien pun tidak dikarang.
Lalu di-restart dan terbukti pulih.

### Bug yang cuma muncul di live: 127.0.0.1 yang salah

`.env` berisi `EMQX_API_URL=http://127.0.0.1:18083` — benar untuk proses di host, **salah di
dalam container API**, di mana 127.0.0.1 adalah container itu sendiri. Permukaannya melaporkan
"broker tidak dapat dijangkau" sementara broker berjalan dan satu klien terhubung. Failure yang
justru seharusnya jadi hal yang terdeteksi, tapi malah terbalik.

Perbaikan: `EMQX_API_URL: ${EMQX_API_URL_INTERNAL:-http://emqx:18083}` di compose, dengan nama
service yang sama seperti yang lain. Persis pola yang sudah pernah menggigit di Wave 5 dengan
receiver webhook — dan seharusnya itu sinyal untukINSTALL check lebih awal, bukan temuan ke-3.

### Tiga guard yang harus ditulis ulang karena tidak menangkap apa pun

1. **"brokerReachable ada di file"** — lolos saat jalur `unreachable` mengembalikan `true`. Sebabnya ada
   di sini: `brokerReachable: true` **adalah** kebohongan. Sekarang nilai per-konstruktor diperiksa.
2. **"jumlah tampil sebelum banner"** — diukur dengan posisi string, dan kata "clients" muncul di
   interface jauh lebih awal, jadi membalik blok UI pun tetap lolos. Sekarang yang diuji adalah
   *kondisi render*: jumlah ada di dalam cabang `snapshot.brokerReachable`, bukan posisi baris.
3. **"snapshotError muncul di file"** — lolos setelah cabangnya dimatikan. Versi kedua bandingkan
   offset, dan tetap lolos karena `{snapshotError}` di dalam template pesan memenuhi syaratnya.
   Ketiga kali di file ini sebuah pemeriksaan string bertahan lebih lama dari perilaku yang
   seharusnya dia kunci.

Pelajaran yang berulang: **assertion atas keberadaan string bukan assertion atas perilaku.** Kalau
mutasi tidak terdeteksi, guard-nya yang salah — bukan mutasinya yang tidak cukup.

### Guard lama yang menangkap saya sendiri

`test/module-10-admin-web-operational-dashboard.contract.spec.ts` menyatakan `admin-operations.module.ts`
**tidak boleh** mengandung `MqttModule`. Guard itu benar. Tapi komentar yang saya tulis untuk
menjelaskan `ConfigModule` **menyebut kata itu** — jadi guard gagal pada prosa, bukan kode. Guard
dibiarkan, komentar yang belajar.

### Glif asing: ketiga kalinya

`rescue:validate` menangkap dua glyph Korea (`U+C5F0 연 | U+ACB0 결`) di string UI `'waktu 연결
tidak dilaporkan'`. Sudah diganti `'waktu koneksi tidak laporan'`, dan sweep repo-wide untuk
CJK/Hangul/Cyrillic di source, test, dan script sekarang **nol**.

Owner bertanya apakah saya model Korea: bukan. Glyf itu **keluaran teks saya sendiri yang melenceng**
— kejadian ketiga di sesi ini (CJK di checkpoint, CJK di komentar, Korea di string). Yang penting
guard ada dan menangkap; itu gunanya.

### Bukti

- **Source 12/12**, dengan mutasi RED: jalur `unreachable` mengembalikan `true`, branch
  `brokerReachable` dihapus dari render, branch `snapshotError` dimatikan — ketiganya terdeteksi
  setelah guard ditulis ulang
- **Live 24/24, exit 0**, termasuk broker stop/start/recover
- **Browser**: `Klien terhubung=1 · Node=1 · Publisher platform=1`, klien
  `iot-platform-api-37daea2eee3b` / `iot-platform-publisher`, bertimestamp, ditandai read-only;
  `korea: false`, `cjk: false`

### Gate

`239 suite / 1750 test` · lint/web:typecheck/sdk:typecheck/build/web:build exit 0 · esp32 PASS ·
`rescue:validate` **473/473** · `manifest:verify` **1215/1215** + **1216/1216** ·
`mqtt-management:probe` **24/24**.

HEAD tetap `993f957`, 287 entri. **Tidak ada commit, tidak ada push.**

---

## Status saat sesi ditutup — 1 Oktober 2026, 04:1x WITA

Sesi ditutup atas permintaan owner. Sesi berikutnya: **`lanjut iot`**.

### Gate terakhir di tree akhir (sudah dijalankan, tidak perlu diulang tanpa perubahan source)

| Gate | Hasil |
|---|---|
| Jest | **239 suite / 1750 test** PASS |
| lint / web:typecheck / sdk:typecheck | exit 0 |
| build / web:build | exit 0 |
| esp32 self-test | PASS |
| `rescue:validate` | **473/473** PASS |
| `manifest:verify` | **1215/1215** source, **1216/1216** hash |
| `capability-template:probe` | 37/37, dua kali berturut, residue 0 |
| `saved-reports:probe` | 27/27, dua kali berturut, residue 0 |
| `mqtt-management:probe` | 24/24, termasuk broker stop/restart/recover |

**Angka-angka ini regression test, bukan ukuran produk.** 1750 test lulus tidak berarti 1750
fitur siap produksi, dan tidak berarti platform selesai. Owner sudah menegaskan ini dan saya setuju:
Wave 4–13 = **10 wave belum dimulai**, dan angka "30 modul foundation-complete" itu denominator lain
yang tidak boleh dipakai menghitung sisa.

### Wave 6 — posisi sebenarnya

| Class roadmap | Status | Bukti |
|---|---|---|
| Capability template/version lifecycle | **selesai** | 16/16 contract, 37/37 live, browser |
| Reports (saved, reproducible) | **selesai** | 12/12 contract, 27/27 live, browser |
| Live MQTT management evidence | **selesai** | 12/12 contract, 24/24 live, browser |
| NOC | **belum diaudit** | 0 file `src/`, 4 BFF hidup — "substantial" itu hitungan file, bukan bukti |

Tiga dari empat class Wave 6 tertutup dengan bukti live. Sisa: **NOC**. Itu titik mulai besok.

### Lingkungan saat ditutup

- `iot-rescue-api`, `iot-rescue-postgres`, `iot-rescue-redis`, `iot-rescue-emqx` — semua **healthy**
- Probe MQTT **me-restart EMQX** dan memverifikasi pulih; broker sekarang `Up (healthy)`
- Residue: `saved_reports` = 0, probe devices = 0
- `Lobby Sensor` (device produksi) = `1.0.0` — nilai yang benar, dikembalikan lewat rollback
- Tidak ada file kredensial sementara di `/tmp` atau `apps/admin-web/public/`
- Tidak ada `dist/` di host

### Satu hal yang harus diketahui sebelum besok

`EMQX_API_URL` di `.env` tetap `http://127.0.0.1:18083` — itu benar untuk proses di **host**.
Container API sekarang menerima override `http://emqx:18083` dari compose. Kalau nanti ada
konfigurasi yang dibaca proses **host** dan memanggil broker API, address `127.0.0.1` itu salah —
bukan nilai di `.env`, yang memang untuk host.

### Cara menjalankan ketiga probe

```
npm run capability-template:probe
npm run saved-reports:probe
npm run mqtt-management:probe
```

`mqtt-management:probe` **matikan broker sementara** untuk membuktikan jalur outage, lalu
mengembalikannya dan memastikan pulih. Itu disengaja, dan jangan dihapus. Jangan jalankan probe itu
di lingkungan yang tidak boleh kehilangan broker.

### Pola yang berlaku besok (tidak berubah)

1. Baca checkpoint ini dulu, jangan mulai dari `git log`
2. Spec RED dulu, produksi kedua
3. **Mutasi wajib terdeteksi** — kalau lolos, guard yang salah, bukan mutasi yang kurang
4. Bukti live, dan **satu curl** sebelum menulis probe
5. **Satu** gate penuh di akhir, bukan beberapa kali

### Pelajaran yang masih berulang (tiga guard MQTT,String)

- **Assert keberadaan string bukan assert perilaku.** Guard "brokerReachable ada di file" lolos
  saat jalur `unreachable` mengembalikan `true` — dan `true` di sana adalah kebohongan.
- **Snapshot-based restore menutupi kerusakannya sendiri** (lihat bagian 6 di atas)
- **Guard yang mengunci klaim yang salah lebih berbahaya dari guard yang tidak ada** — `ABSENT` dan
  `length === 1` sudah dua kali

---

## Putaran 15 — Wave 6 (4): NOC operasi, satu-satunya class yang belum diaudit — 1 Oktober 2026

Sesi dimulai setelah mesin mati. Working tree sudah memuat unit NOC lengkap (service, controller,
migrasi, spec, probe, runner, UI) tapi belum pernah di-gate penuh dan belum masuk checkpoint:
checkpoint sebelumnya menulis 287 entri, `git status` sekarang **299**.

### Census: baca class ini sebagai kalimat

Class keempat Wave 6 adalah "NOC". `grep` pertama menghitung `.next/cache` dan melaporkan NOC 101
file — hasil yang salah. Dengan pengecualian yang benar, NOC punya **0 file service di `src/`**, empat BFF
hidup, dan satu konsol yang menggabungkan lima sumber nyata. Jadi separuh memang ada: **mengamati**.
Yang tidak ada adalah separuh yang lain: **bereaksi**.

Sensus kosakata operator jam 3 pagi:

```
acknowledge sebuah alarm   0    (23 hit "ack" semuanya acknowledgement command)
on-call / escalation       1    (dan itu di auth.service, bukan operasi)
runbook                    0
postmortem                 0
bulk action                0
```

Konsol yang bisa melihat temuan CRITICAL tetapi tidak bisa mencatat bahwa manusia melihatnya adalah
**wallboard**, dan wallboard jam 3 pagi costing persis apa yang seharusnya dicegah NOC.(unit ini bukan
"mempercantik konsol" — unit ini verb yang hilang.)

### Tiga keputusan yang menentukan, dan jalan EACH bisa gagal diam-diam

- **Acknowledging adalah fakta, bukan state UI.** Baris disimpan dan diatribusikan. Checkbox yang
  hanya menghapus badge menghapus satu-satunya catatan bahwa ada yang melihat.
- **Acknowledging bukan resolving.** Dua kolom terpisah, dan resolve menuntut acknowledgement lebih
  dulu. Kalau dicampur, first responder bisa menutup insiden dengan acknowledge, dan shift berikutnya
  tidak punya cara tahu.
- **Acknowledged kedua mengembalikan yang pertama, bukan menimpanya.** Indeks unik pada `findingId`
  yang menegakkan ini, dan catch P2002 mengubah pelanggaran constraint menjadi baris asli — jadi klik
  ganda adalah no-op, bukan error, dan "siapa piket saat pertama kali terlihat" tetap bisa dijawab.

Migrasi `20260930235800_noc_acknowledgements`: satu tabel, aditif, tanpa altering tabel yang ada. Semua
kolom id `TEXT`, bukan `UUID` — migrasi ini ditulis dengan `UUID` lebih dulu dan gagal dengan
foreign-key type mismatch, karena Prisma merender `String @default(uuid())` sebagai `TEXT`.

### Live 30/30, dan yang tidak bisaArts

Probe lewat `npm run noc:probe` (seed → sweep → fixture → probe → sweep, exit status ditangkap
**sebelum** sweep supaya kegagalan cleanup tidak terbaca sebagai probe lulus). Yang diuji:

| Klaim | Bukti |
|---|---|
| ketiga route terdaftar | 401 tanpa token; POST di path resolve menjawab 404 (verb itu memang DELETE) |
| acknowledge merekam aktor + waktu | aktor `8b92dab5…`, `acknowledgedAt` terbaca |
| acknowledge kedua = yang pertama | aktor kedua sama, timestamp tidak bergeser, `alreadyAcknowledged=true` |
| resolve tanpa acknowledge ditolak | **409** + "acknowledged" + tidak ada baris tercipta |
| resolveyang berhasil, row bertahan | `resolvedAt` + `resolvedBy` terisi, `acknowledgedAt` tidak bergeser |
| duty log tenant-segregated | tenant admin 403 di route aksi, tidak bisa baca log tenant lain |

Browser (konsol nyata, super admin): `Beri tahu` → **"sudah diketahui oleh 986634f0 pada
1/10/2026, 17.51.02"**, lalu `Tutup insiden` → **"selesai"**. Baris yang di-resolve **tetap di
daftar** (dot hijau), bukan hilang. `korea: false`, `cjk: false`.

Fixture wajib ada sebelum probe: `analytics_findings` kosong di database ter-seed dan tidak ada satu
pun writer produk (`ingestFinding` tak punya caller HTTP), jadi probe atas nol baris akan hijau
sembunyi. Dua temuan dibuat lewat service layer produk sendiri, di-transaksi yang di-rollback.
Residu setelah sweep: **0 acknowledgement, 0 finding, 0 device**.

### Dua defect yang hanya muncul di live

1. **BFF acknowledge mengirim body tanpa `content-type`.** `ValidationPipe` Nest hanya mem-parse body
   yang deklarasikan JSON, jadi handler menerima `undefined` dan menolak inputnya sendiri dengan
   "tenantId is required" — pesan yang terbaca sebagai salah operator padahal seluruhnya salah route.
   Probe tidak bisa menangkapnya: ia memanggil backend langsung dan selalu set header sendiri.
2. **Konsol NOC list lintas tenant, tapi verb-nya mengambil tenant dari session.** `listAllFindings`
   membaca semua baris dan membawa nama tenant, sementara `acknowledge`/`resolve` mengambil
   `request.user.tenantContext.tenantId`. Untuk operator platform konteks itu selalu tenant platform,
   jadi setiap temuan milik tenant customer **404** "not found in this tenant". Konsol menampilkan
   seratus temuan yang bisa acted-on dan tidak bisa acts on satu pun.

Perbaikannya sama seperti `saveReport` satu layar di atasnya: artifact milik tenant pilihan operator,
session milik tenant platform — jadi tenant **dinamai di request**, dan `assertFindingInTenant`
menyelesaikan finding *di dalam* tenant yangdinamai sehingga id salah tetap 404. Yang tidak berubah:
**aktor tetap dari session**, karena catatan piket yang ditulis atas nama orang lain tidak bernilai.

### Satu read yang dijaga guard, bukan dicatat di allowlist

`test/tenant-isolation-at-query-layer.contract.spec.ts` merah pada dua `nocAcknowledgement.findFirst({ where: { findingId } })`
— tanpa `tenantId`. Bukan kebocoran yang bisa dieksploitasi: `assertFindingInTenant` menolak lebih
dulu. Tapi itu persis "diverifikasi lebih dulu di fungsi" — penalaran yang membesarkan read lintas
tenant satu refactor kemudian, dan indeks unik pada `findingId` saja berarti acknowledgement tidak
ter-scope tenant dengan cara lain. **Diperbaiki di query, bukan di allowlist**; contoh allowlist yang
komentarnya mengklaim caller sudah me-resolve sendiri sudah ada di repo ini (`listBranches`).

### Jebakan baru yang terverifikasi hari ini

- **Parser cookie yang melewati semua baris berawalan `#` diam-diam mengirim nol cookie.** curl menulis
  cookie httpOnly sebagai `#HttpOnly_<host>\t…`. Parser yang skip komentar menjumpai file kosong,
  server hand-off mengirim 0 cookie, dan konsol menjawab "authenticated: false" sementara
  `curl -b jar` menjawab 200 **dari jar yang sama**. Tambahkan satu cookie probe yang *readable*
  (`handoff_probe`): sekarang " apakah Set-Cookie sampai dan apakah jar dipakai lintas port"
  bisa dijawab tanpa menebak, karena cookie session tidak bisa dibaca halaman.
- **`browser_click` pada tombol React di halaman Next dev dapat diam-diam tidak menjalankan handler.**
  `__reactProps` terpasang dan `disabled=false`, tetapi klik lewat ref tidak mengubah database; BFF
  yang sama menjawab 200 lewat `curl`, dan `dispatchEvent(new MouseEvent('click', {bubbles:true}))`
  langsung memicu `DELETE … /resolve` → 200 dan baris berubah jadi "selesai". Dispatch event dari
  console context **adalah** yang memicu React di sini; `element.click()` adalah yang diam.

### Bukti (tree akhir sesi ini)

- Jest **240 suite / 1772 test** PASS
- `lint:check` / `web:typecheck` / `sdk:typecheck` / `build` / `web:build` — exit 0
- `wave3:esp32:self-test` PASS · `rescue:validate` **473/473** · `manifest:verify` **1228/1228** + **1229/1229**
- `noc:probe` **30/30**, dua kali berturut, residu 0
- Sweep glyph CJK/Hangul/Cyrillic di source, test, script: **nol**

HEAD tetap `993f957`, 299 entri. **Tidak ada commit, tidak ada push.**

### Posisi Wave 6 setelah putaran ini

| Class roadmap | Status | Bukti |
|---|---|---|
| Capability template/version lifecycle | **selesai** | 16/16 contract, 37/37 live, browser |
| Reports (saved, reproducible) | **selesai** | 12/12 contract, 27/27 live, browser |
| Live MQTT management evidence | **selesai** | 12/12 contract, 24/24 live, browser |
| NOC | **selesai** | 22/22 contract, 30/30 live, browser |

**Wave 6 Management Plane sekarang tertutup keempat classnya**, masing-masing dengan spec + probe live
+ bukti browser. Angka-angka itu regression test, bukan ukuran produk.

Yang tersisa terhadap roadmap: **Wave 7–13 = 7 wave belum dimulai** (Wave 4 dan 5 closure sudah
selesai di putaran sebelumnya). Denominator lain tetap berlaku: 30 modul foundation-complete bukan
ukuran enterprise-complete.

Titik mulai berikutnya yang logis: **Wave 7 (Mobile + Technician)**. Owner belum menyebutnya —
berhenti di sini dan tunggu perintah.

---

## Putaran 16 — Wave 7 (1): paritas notifikasi mobile — 1 Oktober 2026

Owner said "lanjut" dua kali; sesi pertama menutup Wave 6, sesi ini membuka Wave 7.

### Census: dua permukaan yang menyatakan sendiri tidak ada

Class Wave 7 adalah "Mobile + Technician". Sensus kosakata, dengan pengecualian yang benar:

```
technician / commissioning / workorder / work_log    0 file non-spec di src/
notifikasi di apps/user-mobile/src                   0 pemanggil
```

Tapi yang menentukan bukan hitungan — melainkan dua penanda di dalam tipe mobile sendiri:

```
MobileAlertsPayload.notificationDeliveryHistory: false
MobileTechnicalHistory.alertDeliveryHistory: { available: false; reason: string }
```

Keduanya **benar**, dan keduanya berarti hal yang sama: ponsel tenant tidak bisa menjawab
"apakah notifikasi itu benar-benar terkirim". Padahal backend-nya utuh — `NotificationController`
melayani `/notifications`, `/notifications/summary`, `/notifications/:id`, semuanya tenant-scoped,
dan **dua writer produk nyata** mengisinya: `AuthService.register` (verifikasi) dan
`AuthService.forgotPassword` (reset).

Jadi gap-nya bukan fitur. Yang hilang adalah **paritas**: capability yang sudah ada, tanpa pemanggil.

### Tabel kosong bukan berarti writer mati — dan probe pertama saya yang salah

`notifications` = 0 baris. Sensus berikutnya: siapa yang menulis? `enqueue` **nol pemanggil produk**,
hanya spec — persis jebakan WRITERS yang sudah tercatat. Tapi `enqueueWithClient` dipanggil dari
`sendVerificationToken` dan `sendResetToken`, dan keduanya dipanggil `AuthService` dari dalam
transaksi yang sama dengan token. Writer-nya hidup; tidak ada yang memanggilnya.

Probe pertama saya drove `POST /auth/forgot-password` dengan alamat `.invalid` yang **belum
terdaftar**, lalu menemukan nol baris — dan hampir saya laporkan sebagai tabel mati. Justru itu
kontrol anti-enumerasi yang benar bekerja: `forgotPassword` hanya enqueue kalau user ada, dan
jawabannya sama saja untuk orang asing. **Probe yang salah, bukan produk yang salah.** Diperbaiki
dengan memakai `POST /auth/register`, yang selalu enqueue, lalu **membedakan kedua perbedaan itu
secara eksplisit** — bukan hanya skip salahnya.

### Defect: filter yang dibuang diam-diam

`?status=NOT_A_STATUS` menjawab **200 dengan seluruh baris**. Docblock lama membela perilaku itu:
"filter typo di UI tidak boleh tampil sebagai 'tidak ada notifikasi'". Penalarannya setengah benar —
membuang filter adalah kebohongan yang sama dengan wajah terbalik: operator meminta `FAILED`,
mendapat daftar penuh, dan kolom status setiap baris berbunyi `PENDING`, jadi filter yang dipegang
tampak bekerja. Salah ketiknya tak terlihat, padahal penolakan akan membuatnya terlihat.

Tiga jawaban, tiga makna, tidak ada yang menyamar jadi yang lain: filter valid → baris yang cocok,
filter salah → **400** yang menyebut nilai yang diterima, filter absen → semuanya.

Pemeriksaan validity memakai `Object.values(...).includes()`, bukan `in` — karena
`'toString' in NotificationStatus` bernilai **true** pada enum hasil generate, jadi pemanggil yang
menyebut `toString` akan dipercaya dan Prisma menerima status yang tidak ada di schema.

### Spec yang hijau tidak mengukur apa yang diklaimnya

Tiga mutasi diuji, dan ketiganya kini tercatat di dalam spec:

1. **Menambah field asing** (`deliveryReceiptId`) — gate statis menangkapnya, jadi check
   `rescue:validate` masih hidup setelah allowlist saya perbesar.
2. **Melepas satu nama dari allowlist** (`droppedRows`) — gate langsung merah pada nama itu sendiri.
   Jadi keempat nama di allowlist **masih dibutuhkan**, bukan dekorasi.
3. **Menghapus `useEffect` yang memanggil `loadNotifications`** — panel tetap ada, state tetap ada,
   import tetap ada, dan **21 assertion tetap hijau**. Guard saya mengukur "ada call site", bukan
   "dipanggil". Assertion ke-22 ditulis setelah itu: fetch harus **terhubung ke tab**, dan
   callback-nya harus benar-benar melakukan read.

### Yang ditolak, dan alasannya

- **Tidak** mengubah `notificationDeliveryHistory: false` di backend. Pertanyaan itu jujur tentang
  surface itu sendiri — analytics findings memang tidak membawa delivery history.
- **Tidak** menambah tombol "kirim ulang" pada delivery log. Retry adalah pekerjaan worker, dan
  resend manual akan berlomba dengan lease yang dipegang worker.
- **Tidak** membuat jadwal on-call. Sensus Wave 6 menemukan tepat satu hit `on-call`, di `auth`.

### Bukti (tree akhir sesi ini)

- Unit + contract **47/47** · live **22/22 writer + 12/12 client**, dua kali berturut, residu 0
- Jest **243 suite / 1820 test** PASS
- lint / web:typecheck / sdk:typecheck / **mobile:typecheck** / build / web:build — exit 0
- `wave3:esp32:self-test` PASS · `rescue:validate` **473/473** · `manifest:verify` **1238/1238** + **1239/1239**
- Sweep glyph CJK/Hangul/Cyrillic di source, test, script: **nol**
- Semua mutasi dikembalikan, sha256 dicocokkan dengan golden copy

HEAD tetap `993f957`, 310 entri. **Tidak ada commit, tidak ada push.**

### Satu jebakan yang menelan satu siklus

`docker compose build api` menjawab **`no such service: api`** — karena `docker-compose.yml` di root
hanya memuat `emqx`. Compose service yang benar ada di `docker-compose.rescue.yml`. Ini sudah
tertulis di skill, dan tetap mengenai karena saya tidak menjalankan `config --services` lebih dulu.

### Posisi Wave 7

Roadmap: "Mobile parity for core controls/settings/notifications dan technician
commissioning/maintenance/log workflows dengan release evidence."

| Komponen | Status | Bukti |
|---|---|---|
| Mobile — controls | sudah ada | command + reconcile, caller ada |
| Mobile — **notifications** | **selesai (sesi ini)** | 47/47 unit, 34/34 live |
| Mobile — settings | **belum** | tab Profil hanya status/tenant/logout; locale di-hardcode `defaultMobileLocale` |
| Technician — commissioning/maintenance/log | **belum dimulai** | 0 file di `src/`; halaman `/technician` jujur mengarahkan ke surface nyata |

Unit berikutnya yang logis: **mobile settings** (locale dan tema benar-benar dapat dipilih, dengan
persistensi), lalu technician. Owner belum menyebut urutan — berhenti di sini.

---

## Putaran 17 — Wave 7 (2): pengaturan tampilan mobile, dan batas Wave 7 yang seb mistrust — 1 Oktober 2026

Owner meminta "sampe tuntas wave 7". Unit notifications sudah tertutup di putaran 16; ini unit
settings, dan — yang lebih penting — **batas Wave 7 yang ternyata tidak bisa ditutup tanpa
keputusan yang belum diambil**.

### Gap-nya nyata, dan bukan "tidak ada fitur"

`en` sudah ditulis lengkap di `messages.ts`. Yang tidak ada adalah cara **memilihnya**:
`defaultMobileLocale` di-hardcode di lima call site. Dan `NAV_ITEMS` berisi literal English
(`'Home'`, `'Devices'`) sementara setiap layar di bawahnya render copy `id` — jadi shell dan body
berbicara dua bahasa. Copy `en` ada; hanya terkunci.

### Store: display perangkat, bukan preferensi notifikasi

Batas yang saya tetapkan dan tulis di kode: ini preferensi **tampilan perangkat**, bukan channel
notifikasi. Channel adalah pertanyaan per-membership yang dijawab backend; menaruh sakelar channel
di ponsel yang tidak memiliki subscription menghasilkan kontrol yang tidak bisa dihormati. Store
Karena itu lokal, tidak pernah memanggil API, dan memakai key yang berbeda dari session —
satu-satunya hal yang memisahkan "reset tampilan" dari "keluar dari akun".

`read()` tidak menulis apa pun. Store yang mematerialisasi default saat dibaca pertama membuat
"operator mengatakannya kembali ke default" tidak dapat dibedakan dari "tidak pernah diatur".

Record yang tidak dipercaya **dihapus**, bukan diabaikan: record rusak yang dibiarkan di tempat
akan dibaca ulang setiap peluncuran dan pilihan operator diam-diam berhenti bertahan. Record dari
build yang lebih baru **diterima** — menolak record hanya karena isinya lebih banyak menjadikan
setiap preferensi baru sebagai reset senyap bagi siapa pun yang upgrade.

Tiga kondisi dirender sebagai tiga hal, tidak pernah dua: storage tak terbaca (bukan "di default"),
gagal tulis (pilihan yang tidak sempat tersimpan), dan pilihan nyata.

### Spec hijau yang tidak mengukur apa yang diklaimnya — dua kali

Tiga mutasi diuji. **Dua yang pertama lolos**, dan itu temuan saya sendiri:

1. `selectLocale` diganti no-op. Prop `onSelectLocale` masih ada, panel masih dirender, state
   masih ada — **30 assertion tetap hijau**, padahal picker-nya mati. Guard mengukur "ada call
   site", bukan "dipanggil". Assertion ditulis ulang untuk memeriksa **badan** fungsi itu memanggil
   callback; mutasi yang sama lalu merah.
2. `App` berhenti meneruskan `locale` ke shell. Guard saya mencocokkan `locale={locale}` **di mana
   saja** di App — dan itu satisfaction oleh `MobileLoginScreen`. Guard dipersempit ke blok
   `<MobileAuthenticatedShell>`.

Jadi guard yang saya tulis sendiri lolos pada mutasi yang paling mungkin terjadi di produksi.

### Tiga spec lama saya rusak sendiri, dan itu biaya yang bisa dihindari

`dashboardCopy` → `copy`, `NAV_ITEMS` → `NAV_KEYS`. Ketiga spec lama meng-pin nama itu sebagai
bukti. Nama baru tidak lebih akurat daripada nama lama — jadi saya **mengembalikan nama
lama**. Spec lama kembali hijau tanpa disentuh. `rescue:validate` pecah dengan cara yang sama:
check five-tab blueprint híjar `{ key: 'home', label: 'Home' }`, check command-reconciliation meng-pin
`commandFeedback(result.status)`. keduanya diperbarui ke *intent*-nya (lima tab dengan key copy;
feedback tetap dialihkan lewat helper), bukan ke ejaan.

### Batas Wave 7 yang tidak bisa saya tutup sendiri

Sensus technician, keras:

```
prisma/schema.prisma  — 0 model commissioning / maintenance / worklog
src/                   — 0 file implementasi technician
apps/admin-web/app/technician/page.tsx — 4 tab, 3 di antaranya ActionCard ke surface lain
```

Tapi temuan yang mengubah gambaran: **`DeviceStatus` = PROVISIONING → PAIRED → ACTIVE → INACTIVE →
REVOKED**. Tidak ada state maintenance. Dan commissioning **sudah punya logika backend nyata**
(`device.service.ts:195`, PROVISIONING → PAIRED). Jadi klaim halaman `/technician` bahwa
commissioning "didelegasikan ke provisioning backend" **benar** — yang hilang bukan domainnya,
melainkan **surface yang menampilkan corong provisioning itu**.

Pemisahan yang jujur:

- **Commissioning** — bukan domain baru. Butuh surface yang menunjukkan corong per perangkat.
- **Maintenance** — butuh domain baru. Tidak ada state di `DeviceStatus` yang mewakili
  maintenance, jadi tidak ada yang bisa dialihkan.
- **Logs** — endpoint log perangkat memang belum ada.

Membangun "maintenance" sebagai domain baru berarti memilih bentuknya: schema, migrasi, state
machine, siapa yang boleh menutup pekerjaan, dan apa yang terjadi pada `Device.status` saat
maintenance dibuka. Itu keputusan produk, bukan sisa pekerjaan teknis. Kalau saya menebak dan
melapor Wave 7 tuntas, saya akan melaporkan tebakan saya sebagai keputusan Anda.

### Catatan terpisah: `NotificationPreference`

Tabel ada, unique constraint ada, **nol pembaca, nol penulis, nol test**. Tapi
`docs/module-14-completion-review.md` menyatakannya eksplisit di bawah *Deferred: preference REST
surface*. Jadi itu artefak schema dengan deferral terdokumentasi, bukan fitur rusak.

Yang lebih penting: `Notification` **tidak punya `membershipId`**. Preferensi per-membership secara
struktur tidak bisa dikonsultasi saat delivery tanpa mengubah bentuk tabelnya. Itu keputusan
skema, bukan pekerjaan yang bisa saya selesaikan diam-diam.

### Bukti (tree akhir sesi ini)

- Unit settings **65/65** · mutasi **3/3 terdeteksi**, dua di antaranya setelah guard saya diperbaiki
- Jest **245 suite / 1871 test** PASS · chain penuh **ALL STAGES EXIT 0**
- lint / web:typecheck / sdk:typecheck / mobile:typecheck / build / web:build — exit 0
- `wave3:esp32:self-test` PASS · `rescue:validate` **473/473** · manifest **1243/1243** + **1244/1244**
- Semua mutasi dikembalikan, sha256 dicocokkan dengan golden copy

HEAD tetap `993f957`. **Tidak ada commit, tidak ada push.**

### Posisi Wave 7

| Komponen | Status | Bukti |
|---|---|---|
| Mobile — controls | sudah ada | command + reconcile, caller ada |
| Mobile — notifications | **selesai (putaran 16)** | 47/47 unit, 34/34 live |
| Mobile — settings | **selesai (putaran ini)** | 65/65, 3 mutasi |
| Technician — commissioning | **butuh surface, bukan domain** | logika sudah ada di `device.service.ts:195` |
| Technician — maintenance | **butuh keputusan produk** | tidak ada state maintenance di `DeviceStatus` |
| Technician — logs | **belum** | tidak ada endpoint log perangkat |

Owner belum memutuskan bentuk maintenance. Saya berhenti di titik yang meng intensivelybutuh
keputusan itu, bukan di titik yang hanya butuh effort.

---

## Putaran 18 — Wave 7 (3): domain maintenance teknisi — 1 Oktober 2026

Owner menjawab "lanjut saja" tanpa memilih antara dua opsi yang saya ajukan. Saya putuskan dengan
bukti, bukan menebak — dan bukti itu mengubah bentuk domainnya.

### Fakta yang menentukan bentuk domain

`DeviceStatus` = `PROVISIONING → PAIRED → ACTIVE → INACTIVE → REVOKED`. **Tidak ada state
maintenance.** Dan `DeviceService.updateHeartbeat` menulis `status: ACTIVE` pada **setiap heartbeat**,
lewat route ber-kredensial perangkat, tanpa memeriksa status sekarang:

```ts
data: { lastHeartbeatAt: new Date(), status: DeviceStatus.ACTIVE },
```

Artinya nilai `MAINTENANCE` di `DeviceStatus` akan ditimpa ping berikutnya — jendela maintenance
menutup dirinya sendiri dalam hitungan detik, sementara teknisi masih melihat konsol yang bilang
perangkat baik padahal masih di meja kerja. Opsi "tambah state baru" bukan sekadar kurang ideal:
itu **defect yang akan saya masukkan sendiri ke dalam produk**.

Jadi: **tabel terpisah.** Status maintenance hidup berdampingan dengan `Device.status`, yang
memart meanings yang sama seperti sebelumnya — "apakah perangkat hidup dan berwenang" — dan
jendelanya adalah pertanyaan lain.

`MaintenanceStatus` hanya `OPEN` dan `RESOLVED`. Satu jendela terbuka per perangkat, ditegakkan
oleh **conditional write**, bukan unique index: dua jendela terbuka berarti dua teknisi sama-sama
yakin memiliki perangkat yang sama, dan penutupan pertama akan menutup pekerjaan yang kedua tanpa
jejak. Unique index akan mengubahnya menjadi error database yang tidak bisa dijelaskan teknisi;
conditional write mengubahnya jadi konflik yang bisa dijelaskan API.

Race resolve: `updateMany` bersyarat `status: OPEN`, dan `count !== 1` dilaporkan sebagai konflik.
Tanpa prasyarat itu, resolve kedua mendarat di baris tertutup dan melaporkan sukses.

### Commissioning ternyata bukan domain baru

Varian saya sendiri: `/technician` mengklaim commissioning "didelegasikan ke provisioning backend" —
dan itu **benar**. `device.service.ts:195` sudah menjalankan PROVISIONING → PAIRED. Yang hilang
bukan domainnya, melainkan **surface** yang menampilkan corong itu. Saya tidak menambahkan domain
kedua untuk sesuatu yang sudah ada.

### Tiga kegagalan nyata yang saya buat sendiri

1. **Migrasi menebak `uuid`.** Semua id di skema ini `text`. Postgres menolak FK outright. Sekarang
   kolom dibaca dari `information_schema` dulu — "tipe bukan detail saat dua tabel bertemu".
2. **`PrismaModule` tidak diimpor.** Modul ter-register, service ter-inject, tapi `PrismaService`
   tidak resolve. Container **start lalu restart-loop** dengan "Nest can't resolve PrismaService" —
   persis bentuk domain yang terdaftar tapi tak terjangkau. Aturan ini sudah saya tulis di komentar
   modul sebelum mengalaminya, dan tetap mengenai.
3. **Handler `DELETE` di route koleksi** yang minta `maintenanceId` — segment yang tidak ada di sana.
   `web:build` menolak dengan benar. Handler itu salah tempat; sekarang hanya di `[maintenanceId]`.

### Guard yang lolos pada mutasi yang paling mungkin terjadi

Satu dari tiga mutasi lolos: menghapus prasyarat `status: OPEN` dari `updateMany` membuat **19
assertion tetap hijau** — padahal itu persis race yang docblock saya gambarkan. Guard lama hanya
cek `count !== 1` masih ada, bukan bahwa prasyaratnya masih ada. Assertion sekarang mengisolasi
`where` clause itu sendiri.

Version pertama dari assertion yang diperbaiki justru **menolak kode yang benar**, karena slice 600
karakter ikut menyertakan `count !== 1`. Dua arah salah, dan keduanya diperbaiki.

### Bukti

- Contract **19/19** · mutasi **3/3 terdeteksi**
- **Live 19/19, dua kali berturut, residu 0** — termasuk: status tak dikenal ditolak 400, reason
  kosong ditolak, `tenantId` di body ditolak, jendela kedua **409**, jendela tetap terbuka,
  **`Device.status` tidak pernah ditulis ulang**, resolve kedua **409**, tenant lain **403**
- Jest **246 suite / 1890 test** PASS · chain penuh **ALL STAGES EXIT 0**
- lint / 4 typecheck / build / web:build exit 0 · `rescue:validate` **473/473**
- manifest **1254/1254** + **1255/1255** · sweep glyph bersih

### Yang masih tersisa di Wave 7

- **Commissioning** — butuh surface yang menampilkan corong provisioning. Logikanya sudah ada.
- **Logs** — endpoint log perangkat belum ada. Tab masih mengarahkan ke Realtime.

HEAD tetap `993f957`. **Tidak ada commit, tidak ada push.**

### 19b — Commissioning surface + device log (sisa unit 4 & 5 Wave 7)

Owner: "kerja besar jangan kerja setengah2". Tiga unit technician yang tadinya cuma kalimat yang
mengarahkan operator ke tempat lain, sekarang semuanya surface nyata.

**Commissioning ternyata tidak butuh domain baru.** Yang hilang adalah *surface*, bukan logikanya —
dan ini yang membuat unit ini murah dan jujur: `DeviceStatus` sudah ada di setiap baris perangkat,
cuma tidak pernah ditampilkan. Halaman sekarang membaca corong itu dari backend. Daftar tahap di
UI **di-pin ke enum Prisma lewat contract**, bukan dilarang ada. Versi pertama contract saya melarang
daftar lokal sama sekali — itu salah, karena membuat tahap yang ada tapi kosong mustahil ditampilkan,
dan itu informasi yang justru dibutuhkan teknisi.

**Device log = `DeviceCommand`, bukan telemetry.** Keduanya dibaca terpisah: satu menjawab "platform mengirim apa", satu menjawab
"perangkat melaporkan apa". Menggabungkannya akan menghasilkan log yang tidak bisa membedakan
niat-platform dari data-perangkat, dan teknisi akan membaca niat di tempat yang isinya cuma data.

#### Dua kegagalan guard yang sama-sama lolos

1. **Satu mutasi lolos.** Menghapus `tenantId` dari `where` membuat 19 assertion hijau — dan
   `tenant-isolation-at-query-layer.contract.spec.ts` **juga hijau**. Guarda itu memindai clause
   di call site; `const where = { deviceId, tenantId }` satu baris terbaca sebagai satu token.
   Objek sama, perilaku sama, tak terlihat oleh check yang ada justru untuk menangkapnya.
2. **Tiga versi assertion saya tetap lolos** karena `source.indexOf('const where')` mencocokkan
   **komentar saya sendiri**, yang mengutip `const where = { deviceId, tenantId }`. Guard yang
   membaca dokumentasinya sendiri bukan guard.

Pelajaran yang saya ambil: substring search di source file selalu terkontaminasi oleh prose di
sekitar yang sama. Anchor harus ke bentuk sintaks (`/^\s*const where\s*=/m`), bukan ke substring.
Sudah dicatat di skill.

#### Live: 8/8 terbukti, 3 dinyatakan UNPROVEN

Tenant UAT tidak punya satu pun perangkat yang bisa menerima command, dan **tidak ada route API
untuk mendeklarasikan capability** — capability dipublikasikan perangkatnya sendiri lewat MQTT.

Suntik baris `capabilities` dari probe akan membuat semua check hijau, dan **tidak membuktikan
apa pun**: probe itu akan memproduksi prasyarat untuk assertion-nya sendiri, sementara produknya
tetap tidak bisa melakukannya. Jadi probe memisahkan:

- **TERBUKTI (8)** — log terjangkau, log kosong adalah jawaban sah, limit non-numerik ditolak,
  perangkat di luar tenant ditolak **bukan** jadi log kosong, tenant lain 403, limit dibatasi,
  command ke perangkat tanpa capability ditolak
- **UNPROVEN (3)** — derivasi flag `settled`, read-back command, urutan. Disebut terang di output
  beserta alasannya, bukan disembunyikan di balik PASS.

Maintenance probe tetap **19/19** setelah semua ini.

#### Temuan produk yang muncul dari probe ini

**Perangkat tidak pernah bisa commandable lewat API.** Capability hanya datang dari MQTT. Tidak ada
route admin, tidak ada surface. Artinya di tenant produksi, teknisi melihat perangkat yang tidak
bisa dikendalikan dan tidak punya cara memperbaikinya dari konsol. Ini gap Wave 8, bukan defect Wave 7 —
dan saya catat sebagai Wave 8 karena menutupnya berarti merancang capability-authoring, bukan
menempelkan form.

**Wave 7 selesai** — mobile controls, mobile notification parity, mobile settings locale/tema,
technician maintenance, commissioning surface, device log. Semua contract, semua live-proven sejauh
fixture mengizinkan, dan yang tidak bisa dibuktikan disebut sebagai unproven beserta alasannya.

### 20 — Wave 8: Billing + Integrations

Owner: "kerjakan saja semua langkah". Empat langkah, dikerjakan berurutan karena urutannya bukan
pilihan: yang nomor 2–4 akan dibangun di atas penipu kalau nomor 1 tidak dibereskan dulu.

#### Yang saya temukan di census, dan koreksi atas laporan saya sendiri

Laporan tengah saya bilang "tidak ada model Invoice, Subscription, Payment, Metering, Usage, atau
Plan — nol". Itu **salah**. `BillingPlan` dan `BillingSubscription` **ada**; grep saya berpola
`^model (Subscription|Plan|…)` dan tidak cocok dengan prefiks `Billing`. Yang benar hilang hanya
`Invoice` dan `Metering`. Pelajaran: census harus baca isinya, bukan mencocokkan pola.

#### Langkah 1 — adapter yangqjudi tidak lagi berbohong

Docblock lama: *"Fail-closed: tanpa server key → SIMULATED invoice, zero network calls."*
Implementasinya kebalikannya:

- `simulated` = `!serverKey`, jadi begitu key di-set, flag itu bilang "nyata" sementara
  `createInvoice` **tidak melakukan panggilan jaringan sama sekali** (`// Real Snap call would go here`)
  dan mengembalikan `paymentUrl` **dirakit dari id lokal**. Deployment terkonfigurasi akan
  mengantar pelanggan link mati sambil melaporkan invoice sungguhan menunggu pembayaran.
- `verifySignature` mengembalikan `signatureKey.length > 0 && orderId.length > 0` — itu "string-nya
  tidak kosong", bukan verifikasi. Komentarnya menyebut webhook controller yang **tidak ada**.
- Nol pemanggil, dan tidak ada di DI sama sekali.

Sekarang: `simulated` ditetapkan di constructor, PENDING hanya bisa terjadi setelah token provider,
tanpa token → exception, kegagalan provider → invoice ditandai `FAILED` (barisnya **disimpan**;
menghapus baris akan menghapus satu-satunya jejak bahwa pembayaran pernah dicoba), dan signature
memakai SHA-512 + `timingSafeEqual`.

#### Spec lama justru meng-pin defect

`payment-adapter.spec.ts` yang lama akan **lulus** terhadap implementasi yang rusak: test kedua
menuntut `PENDING` + URL `sandbox.midtrans.com`, yang persis apa yang dikembalikan versi rusak
dari id buatan lokal. Test ketiga tidak pernah memanggil `verifySignature` dengan key sama sekali. Spec yang meng-pin defect lebih buruk
daripada tidak ada spec: ia mengubah bug menjadi spesifikasi.

#### Langkah 2 — Invoice dan MeteringRecord

Kolom id **TEXT**, dibaca dari `information_schema` sebelum migrasi ditulis. Migrasi di repo ini
pernah menebak `uuid` dan Postgres menolak FK-nya outright.

`amountCents` integer, tidak pernah float: uang yang disimpan sebagai float adalah defect yang baru
muncul tahun-tahun kemudian di rekonsiliasi yang tidak bisa dijelaskan siapa pun. Unique metering per
`(tenant, device, periodStart)` — tanpa itu, hitung ulang periodevelte.append baris kedua dan tenant
ditagih dua kali.

DDL diambil dari `prisma migrate diff` terhadap database hidup, lalu **dipangkas** hanya ke dua model
baru; diff penuh juga membawa drift dari wave sebelumnya yang diterapkan manual, dan_zone saya
masukkan ke sini, migrasi ini jadi bertanggung jawab atas perubahan yang tidak dijelaskannya.

#### Langkah 3 — satu adapter provider yang sungguhan

`MQTT_BRIDGE`, bukan ALEXA/GOOGLE_HOME. Alasannya bentuk buktinya: repo ini menjalankan EMQX sungguhan,
jadi adapter MQTT bisa dibuktikan ujung-ke-ujung terhadap stack yang benar-benar ada. Adapter Google
Home di sini adalah klaim yang tidak bisa diverifikasi tentang layar persetujuan OAuth orang lain.

Sambil menulisnya, spec Zoe menemukan **cacat pada implementasi saya sendiri**: `openClient` berada
di luar blok `try`, jadi broker yang menolak koneksi menyisakan integrasi di `REGISTERED` — yang
bagi operator sama dengan "tidak pernah dicoba". Test perilaku saya yang menangkapnya; sekarang
kedua jalur kegagalan mencatat `ERROR` beserta alasannya.

Registry juga diperbaiki: `setStatus` memakai `updateMany` **tanpa membaca `count`**, jadi id
milik tenant lain terlihat persis seperti sukses. Dan `recordSync` melakukan upsert dengan
`tenantId` dari pemanggil — itu **cross-tenant write yang berhasil**, bukan yang gagal dengan keras.

#### Langkah 4 — siklus penagihan

Reference diturunkan dari `(tenant, periode)`, **bukan** dari pemanggil: reference yang dipilih
pemanggil adalah tabrakan yang dipilih pemanggil.

Dan di sini docblock saya sendiri menangkap cacat saya. Ia menulis "a retry cannot double-bill",
padahal `create` dengan id stabil membuat run kedua **crash 500** dari pelanggaran unique. Diperbaiki
dengan pengecekan *sebelum* create: periode yang sudah ditagih mengembalikan invoice yang ada dengan
`alreadyBilled: true`, dan periode yang sudah `SETTLED`/`FAILED` ditolak 409 — bukan ditagih ulang.

#### Bukti

- Contract: payment 20/20 · lifecycle 21/21 · integrations 13/13
- Unit: `payment-adapter` 16/16 · `mqtt-bridge` 10/10 · registry 6/6
- **Live billing 16/16, dua kali berturut, residu 0** — termasuk: forged signature ditolak, webhook
  tanpa tenant ditolak, tanpa order_id ditolak, tenant lain tidak bisa menyentuh invoice, penagihan
  periode sama mengembalikan invoice yang sama
- Jest **251 suite / 1987 test** · chain **`ALL STAGES EXIT 0`** · `rescue:validate` **473/473**

#### Yang UNPROVEN, dan saya nyatakan terbuka

- **Jalur settlement positif** (`SETTLED`, replay `ALREADY_FINAL`, penolakan amount mismatch dengan
  signature asli) — butuh server key Midtrans asli. Tanpa key, adapter menolak **semua** signature
  secara desain. Ini tercetak di output probe, bukan disembunyikan di balik PASS.
- **Tiga provider lain.** Registry tetap mengakui empat nilai enum; hanya satu yang punya adapter.
  Contract-nya mengikat itu — menambah adapter berarti mengubah klaim di atas rekaman, bukan
  memperlebarinya diam-diam.
- **Webhook Midtrans sungguhan** belum pernah talking dengan Midtrans. Yang terbukti adalah kontrak
  dan lifecycle-nya terhadap API kita sendiri.

Ada satu warning `worker failed to exit gracefully` di Jest. Saya cek: **nol** dari file Wave 8,
adapter tidak pernah di-instantiate tanpa stub. Pre-existing.

## Wave 9 — CCTV and location (all four steps)

**Step 1 — `DeviceLocation` is now a tenant-owned append-only history.**
ADR-004 declared the table as `deviceId @unique` with no `tenantId`. Two consequences, both removed:
every fix overwrote the last, so "where was this device when it went offline" could only be answered
with where it is *now*; and the row belonged to no tenant, so any read keyed on device id answered for a
tenant that does not own the device — which, with history enabled, means every place it has ever been.

The migration is three steps — add nullable, backfill from `devices`, then `SET NOT NULL` — because
Prisma's generated form adds the column as NOT NULL with no default and fails the moment the table
holds one row. It only applies to a database where nobody has ever recorded a position. This database
had none; a tenant's production database might.

`NaN` passes every naive range check (every comparison with `NaN` is false, so the negation is true),
so `Number.isFinite` guards first. `0,0` is kept as a real position, never a "no data" sentinel.

Live: 16/16 twice, residue 0. Two fixes become two rows, `latest` is one of them, lat>90 refused, a
foreign tenant can neither read nor *plant* a position.

**Step 2 — camera onboarding: a correction.**
My census reported "zero callers". That was wrong. `CameraOnboardingModule` is registered in
`app.module.ts`, and there are four routes including a separate public pair controller. The grep I used
filtered on the substring `camera-onboarding`, which is part of the *path* of both files that wire it
up, so the filter hid the evidence of the thing being measured. A filter that hides its own subject
produces a confident false gap, which is worse than no filter.

What was missing was a *probe*, not the feature. Live: 14/14. The half that matters is that pairing
works with **no session and no tenant header**, because a camera has neither — a probe that checked
only the authenticated half would pass against a pair endpoint that had accidentally inherited the
tenant guard.

**Step 3 — ONVIF discovery.** WS-Discovery with a hard timeout, a result cap, and userinfo stripping.
Discovery is a UDP broadcast, and an ONVIF `xAddr` routinely arrives as
`rtsp://admin:hunter2@10.0.0.9/stream`; passing that through would hand the camera password to every
host on the segment. Stripping is scoped to the *authority* component — an `@` in a path or query is
not userinfo. Without that bound, `rtsp://10.0.0.9/stream?user=a@b` was rewritten to `rtsp://b`, a
different host, with no error. A quieter wrong answer than a crash, which is why it is a test and not
a review comment.

Lint caught a second one: the ONVIF-ness of a reply was computed and then discarded, so every entry
was reported `onvif: true` including noise sent to port 3702 by something that is not a camera.

**Step 4 — go2rtc, and an actual RTSP→WebRTC proof.**
go2rtc over MediaMTX because Wave 9 needs exactly one thing — RTSP in, WebRTC out — in one small
container. MediaMTX stays the right answer the day recordings or a control API are needed. No volume is
mounted on purpose: go2rtc writes stream configuration into its working directory, and every stream
carries RTSP credentials, so persisting would put camera passwords somewhere nothing else in this
stack puts them.

Live: 11/11. The proof builds the whole chain rather than inspecting one link —
`ffmpeg test pattern --RTSP--> go2rtc --WebRTC--> SDP answer` — because a running container, a
registered stream and a green `/api/streams` all coexist happily with a browser showing nothing. An
SDP answer with a video m-line, an H264 payload map, an ICE ufrag, a DTLS fingerprint and
server-reflexive candidates can only exist if the RTSP H264 was repacked for WebRTC.

Unproven and reported as such: a browser rendering the frames, and real camera firmware (ONVIF profile,
vendor quirks, long-run stability).

**Guards.** Four location mutations, two of which passed first time and exposed a general weakness.
`toMatch(/-90|90/)` stayed green after the range guard was deleted because the *error message* says
"latitude harus antara -90 dan 90"; `isFinite` occurs three times in the file so a file-wide match
survived deleting one guard. The same class of error appeared on the ONVIF side: a bare
`not.toMatch(/rtsp:\/\//)` failed against correct code because the class docblock quotes the very
credential URL the code exists to strip — a negative assertion reading the documentation of the thing
it guards.

The conclusion generalises and is now the default: **a source contract cannot hold a service down.**
A regex can only be told what to look for; a mock Prisma or a stubbed `fetch` can be told what the code
asked for. `expect(where).toEqual({ id: 'dev-1', tenantId: 'tenant-a' })` has no reading of a comment,
an error message, or a second occurrence elsewhere in the file. Every guard here is now backed by a
behavioural spec, and every behavioural spec is mutation-tested.

**Gates.** Jest 256 suites / 2074 tests · lint, web/sdks typecheck, both builds, `rescue:validate`
473/473, manifest and hash sets all green · `ALL STAGES EXIT 0`.

**Known and untouched.** A worker-leak warning appears in the full Jest run. It is *not* from this
wave: the suite was re-run with the ONVIF spec excluded and the warning persists, so it predates
Wave 9 and has not been traced.
