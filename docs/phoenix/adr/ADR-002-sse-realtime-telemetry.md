# ADR-002: Realtime Telemetry via SSE (Server-Sent Events)

- Status: ACCEPTED
- Tanggal: 2026-08-23
- Keputusan: Rey (owner, approval pengecualian kerja otomatis)

## Konteks

ROADMAP v2.0 fase 4 membutuhkan telemetry realtime tanpa refresh.
WebSocket/SSE belum ada (0 file). VPS belum tersedia sehingga solusi
harus bisa divalidasi lokal.

## Keputusan

1. Transport: **SSE** (bukan WebSocket) — satu arah server→client cukup
   untuk telemetry push; lebih sederhana, kompatibel HTTP/1.1 & proxy
   umum, auto-reconnect bawaan browser.
2. Endpoint: `GET /telemetry/stream?deviceId=...` — event `telemetry`
   berisi payload terbaru; heartbeat komentar tiap 15s menjaga koneksi.
3. Autentikasi: JWT session sama seperti REST (cookie HttpOnly);
   tenant context dari guard — tidak ada stream lintas tenant.
4. Frontend admin-web: hook `useTelemetryStream` konsumsi EventSource,
   fallback polling bila SSE gagal.
5. Fail-closed: tanpa stream aktif UI tetap tampil data terakhir.

## Konsekuensi

- Kontrak baru bersifat additive → tidak melanggar freeze v1.0
  (ADR ini adalah persetujuannya).
- WebSocket penuh (dua arah) ditunda ke kebutuhan command live ACK;
  SSE sudah mencakup kebutuhan roadmap fase 4.
- Skema DB tidak berubah.

## Alternatif ditolak

- Polling cepat (<2s): boros resource, latensi tinggi.
- WebSocket langsung: kompleksitas upgrade + proxy config lebih besar
  untuk kebutuhan one-way.
