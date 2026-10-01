# STAGING RUNBOOK — IoT Platform (lokal)

Diperbarui: 30 September 2026. Semua proses staging berjalan LOKAL, bukan produksi.

Cara tercepat: pakai stack Docker, bukan langkah manual di bawah.

```
docker compose -f docker-compose.rescue.yml up -d postgres redis emqx api
set -a && source .env && set +a
node scripts/seed-uat-baseline.mjs      # tenant + 3 akun UAT
node scripts/seed-demo-accounts.mjs     # akun demo + device + capability
```

## Port yang benar

| Service | Port | Cara cek |
|---|---|---|
| Backend API | **5000** | `curl http://127.0.0.1:5000/health` → `{"status":"ok"}` |
| Admin Web | **3100** | `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login` |
| PostgreSQL | 5432 | `docker exec iot-rescue-postgres pg_isready` |
| Redis | 6379 | `docker exec iot-rescue-redis redis-cli ping` |
| EMQX | 1883 / 18083 | dashboard di `http://127.0.0.1:18083` |

> Port web **3100** bukan 5001: `apps/admin-web/package.json` yang mengikat
> `next dev --port 3100`, jadi itulah default sebenarnya. Dokumentasi yang menulis 5001 itu
> salah, dan sekarang `scripts/check-uat-documentation.mjs` membacanya dari package.json.
> Versi runbook sebelumnya juga menyebut API di 3000 dan Redis di 6399 — tidak dipakai stack sekarang. `scripts/seed-uat-baseline.mjs` membaca port API dari `.env` dan
> `docker-compose.rescue.yml`, bukan dari dokumen ini, supaya nilainya tidak bisa melenceng lagi.

## Admin Web

```
cd apps/admin-web
npm run dev            # next dev --port 3100, dari package.json
```

## Akun UAT

`node scripts/seed-uat-baseline.mjs` menulis kredensial ke `.uat-credentials`
(git-ignored, mode 600). Baca dari sana.

Skrip ini **idempotent dan tidak merusak**: ia membuat akun bila belum ada dan **membiarkan
password yang sudah ada tetap utuh**. Password hanya berubah dengan `--reset`. Itu berbeda dari
`seed-demo-accounts.mjs`, yang menghapus dan membuat ulang user sehingga password-nya
berganti setiap kali dijalankan — itulah alasan UAT baseline butuh skrip terpisah.

## Backup

```
set -a && source .env && set +a
npm run db:backup          # dump + restore ke DB scratch + bandingkan jumlah baris
npm run db:backup:quick    # dump saja, tanpa verifikasi restore
```

Dump ditulis ke `backups/db/` yang **git-ignored** — isinya berisi hash password dan hash API
key, jadi tidak boleh masuk repository.

## Pitfalls yang sudah ditemui

- **Jangan export `NODE_ENV=staging`** — validasi config hanya menerima
  development/production/test.
- **Build web HARUS dijalankan tanpa env `.env` bocor** (unset `DATABASE_URL`, `JWT_SECRET`,
  dll) — kalau tidak, prerender `/_global-error` gagal dengan "Cannot read properties of null".
- **`nest build` gagal EPERM kalau backend masih jalan** (prisma dll lock): matikan backend
  dulu, build, lalu nyalakan lagi.
- **Jangan jalankan `npm run web:build` atau `baseline:hygiene:clean` saat dev server masih
  hidup** — `hygiene:clean` menghapus `.next/dev` dan Next.js restart sendiri di tengah
  pemeriksaan.
- **`npm run test:recovery` gagal kalau versi client ≠ server.** Postgres di host ini PG **18**,
  server-nya **16** — dan `pg_dump` 18 menulis `SET transaction_timeout` (GUC PG17+) yang server
  16 tidak kenal, jadi restore-nya ditolak. Drill sekarang menolak lebih awal dengan pesan yang
  menyebut kedua versi. Untuk menjalankan drill, arahkan ke server versi sama, atau set
  `PG_BIN_DIR` ke client tools yang cocok.
- **Jangan edit file repo saat gate chain berjalan.** `baseline:manifest:generate` meng-hash
  `docs/SESSION-CHECKPOINT.md`, jadi menulis checkpoint setelah generate menggagalkan
  `manifest:verify`.
- **Meseed selalu meregenerasi password** `demo.admin@iot.local` dkk. Kalau probe tiba-tiba
  401, re-seed lalu baca password barunya.
- **`DELETE /devices/:id` tidak ada.** Pembersihan device lewat `PATCH /devices/:id/revoke`.

## Mematikan semua

```
docker compose -f docker-compose.rescue.yml down
```

Untuk mencari PID yang masih memegang port: `ss -ltnp | grep -E ':3100|:5000|:5432|:6379'`.
