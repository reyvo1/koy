# Phoenix Engineering Handbook — Implementasi Konkret IoT Platform

Melengkapi `02_Engineering_Handbook.md` dengan aturan spesifik project ini.

## Development Lifecycle (per slice/fitur)

1. **Planning** — pilih item dari ROADMAP-v2.0.md, tulis tujuan 1 kalimat.
2. **Architecture** — bila menyentuh kontrak/skema → buat ADR dulu.
3. **ADR** — `docs/phoenix/adr/ADR-XXX-*.md` (Konteks/Keputusan/Konsekuensi).
4. **Implementation** — ikuti pola existing (module pattern NestJS,
   capability-driven widget, tenant guard).
5. **Testing** — unit spec per service; contract spec untuk kontrak baru;
   DB integration untuk migrasi.
6. **Documentation** — update PANDUAN-UI.md bila UI berubah.
7. **Release** — gate: lint + typecheck + jest + build (+integration) →
   commit → push → CI harus hijau.
8. **Closure** — update roadmap/checkpoint.

## Review Process

- Self-review diff sebelum push (wajib agen).
- CI adalah reviewer kedua; merah = wajib fix sebelum lanjut.
- Perubahan security-sensitive (auth/kredensial) wajib disebut di ADR.

## Release Process

- Semua push ke `main` harus lolos gate penuh.
- Tidak ada force-push. History dilindungi.
- Tag versi (`v2.0.0`, dst) dipakai saat milestone roadmap tercapai.

## Documentation Standard

- Dokumen hidup di `docs/`; governance & ADR khusus di `docs/phoenix/`.
- Setiap modul punya closure doc + bukti spec.
- Bahasa dokumentasi user-facing: Indonesia; kode & komentar: Inggris/Indonesia.

## AI Engineering Standard (Phoenix AI Reviewer)

- AI assists, engineer decides — keputusan arsitektur selalu owner.
- AI wajib menyertakan bukti (hasil test/build), tidak boleh klaim tanpa eksekusi.
- AI tidak boleh force-push, mengubah history, atau melewati quality gate.
- Kredensial tidak pernah ditulis ke kode/dokumen/commit.
