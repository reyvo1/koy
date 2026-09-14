# PHOENIX ROADMAP v2.0 — Productionization & Enterprise Expansion

Mengikuti urutan wajib POST-MODULE-30 (aaaa.txt). Setiap fase punya gate.

## v2.0 — Productionization (target terdekat)

| # | Fase | Gate keluar |
|---|---|---|
| 1 | Production Deployment (VPS, NODE_ENV=production, password kuat, SSL) | Aplikasi live + health ok |
| 2 | UAT — owner menguji semua layar | Sign-off Rey |
| 3 | Runtime Verification — approve AUTOMATION_RUNTIME_ENABLED | Owner approval eksplisit |
| 4 | Realtime Infrastructure (WS/SSE) | Telemetry live tanpa refresh |
| 5 | Payment Adapter (Midtrans/Xendit) | Transaksi sandbox sukses |

## v3.0 — Workforce & Vision

- Technician App: diagnostics, commissioning wizard, maintenance, logs
- CCTV Streaming runtime (ONVIF/RTSP→WebRTC), kamera domain aktif
- GPS/Location: kolom lokasi device + peta NOC

## v5.0 — Scale & Intelligence

- HA & Load Testing (multi-node PG/Redis/MQTT)
- AI/ML Expansion dari Modul 16: anomaly model, predictive maintenance,
  device health scoring
- Executive App (KPI dashboard)

## v10.0 — Enterprise Horizon

- Multi-region deployment · Edge computing gateway · Digital twin
  foundation · AI Assisted Operations penuh

## Aturan antar versi

- Setiap fitur masuk lewat ADR bila menyentuh kontrak/skema.
- Quality gate tidak bisa dilewati meski deadline.
- Fitur belum mati = fail-closed di UI (contoh: CCTV "No Signal").
