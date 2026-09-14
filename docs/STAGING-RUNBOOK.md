# STAGING RUNBOOK — IoT Platform (lokal)

Terakhir: 25 Agustus 2026. Semua proses staging berjalan LOKAL, bukan produksi.

## Layanan yang harus hidup (urutan)
1. **Redis (in-memory)** — untuk rate-limit login & cache
   ```
   cd tools/redis-local && node start-redis.js
   ```
   Siap kalau log menulis: `REDIS_READY host=127.0.0.1 port=6399`

2. **Backend API** (port 3000)
   ```
   set -a && source .env && set +a
   export NODE_ENV=development PORT=3000 REDIS_URL=redis://127.0.0.1:6399
   node dist/main.js > staging-backend.log 2>&1
   ```
   Cek: `curl http://127.0.0.1:3000/health` → `{"status":"ok"}`

3. **Web Admin** (port 3100) — build dulu tanpa env .env bocor:
   ```
   cd apps/admin-web && npm run build
   export IOT_API_BASE_URL=http://127.0.0.1:3000
   npx next start -p 3100
   ```

## Akun UAT
- admin@demo.id / Demo12345! (tenant Demo Home)
- Password direset sesuai runbook ini; ganti setelah UAT.

## Pitfalls yang sudah ditemui
- Jangan export NODE_ENV=staging — validasi config hanya menerima
  development/production/test.
- Build web HARUS dijalankan tanpa env .env ter-leak (unset DATABASE_URL,
  JWT_SECRET dll) — kalau tidak, prerender /_global-error gagal dengan
  "Cannot read properties of null".
- `nest build` gagal EPERM kalau backend masih jalan (prisma dll lock):
  matikan backend dulu, build, lalu nyalakan lagi.
- MQTT broker belum ada di lokal → health/ready melaporkan mqtt down;
  itu NORMAL dan UI menampilkan fail-closed dengan benar.

## Mematikan semua
Proses berjalan sebagai background task Hermes (session ids tercatat di
log sesi). Atau cari PID: `netstat -ano | grep -E ":3000|:3100|:6399"`.
