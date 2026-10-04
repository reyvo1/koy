# Active enterprise override — 2026-10-04

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-13; active=none -->

Waves 1–13 are **SOFTWARE SCOPE CLOSED / GREEN** for automated, source-bound software certification. GitHub Actions run `37183166252` on commit `b7b62248ec5fe38973993e981c9b753483cf8e10` completed the full automated acceptance chain. `SIMULATED_HARDWARE_LIVE_SERVICE` remains the automated hardware-equivalent evidence class; PHYSICAL/HIL and provider-owned external observations remain separate and non-blocking for software closure.

Do not invent a new active wave merely because software certification is complete. New work is defect/product hardening against the green baseline and must earn a new full acceptance run before handoff. Missing physical ESP32/camera hardware remains non-blocking; simulation cannot impersonate PHYSICAL/HIL.

Session continuity is mandatory: read `docs/SESSION-HANDOFF-PROTOCOL.md` and current authority blocks, verify `git rev-parse HEAD` / `git status --short`, and resume from the first failing gate when one exists, otherwise from the recorded next action. If the last heavy run is all green, the next action may be a named audit/hardening batch rather than a failing gate. Update handoff files and run `npm run session:handoff:self-test` before handoff.

---

# Enterprise execution override — 2026-09-15

## Enterprise wave execution policy

The active master plan is `docs/ENTERPRISE-WAVE-ROADMAP.md` Wave 1–13. Work one large wave at a time. Complete implementation, targeted/lightweight QA, documentation, repository-tree/manifest sealing and `chat-session.md` before a single GitHub push. Heavy runtime acceptance belongs to GitHub. Red CI stays in the same active wave and is repaired by failure class, never micro-RR. Production contracts/tests must not be weakened to obtain green CI. Schema-only tooling fallbacks (for example Prisma validate/generate) are STATIC/CONTRACT evidence only and must never be promoted to live database evidence.

---

# CURRENT WORK AUTHORITY — READ FIRST

Before any mutation, read `CURRENT-STATE.md`, `PROJECT-HANDOFF.md`, `docs/RESCUE-WORKFLOW.md`, and `docs/UI-ROUTE-MAP.md`. For current work these files override conflicting historical Module/Slice status text. Do not start a new numbered Module/Slice unless the owner explicitly restores that lifecycle.

# Aturan Kerja Agent — PER-PROJEK (isolasi wajib)

## ATURAN WILAYAH (PALING PENTING — melanggar = gagal)
1. Agent HANYA bekerja pada SATU projek = folder tempat terminalnya dibuka.
2. DILARANG KERAS membaca-menulis-modifikasi folder projek lain
   (IoT-Platform, TAMASYA, toko360, TeleBridge, dompet-bot adalah projek TERPISAH).
3. "Kerja otomatis semua projek" TIDAK berarti satu agent mengerjakan semuanya —
   setiap projek punya terminal/agent-nya sendiri. Fokus di wilayahmu.
4. Integrasi antar projek HANYA lewat API/HTTP yang disepakati Rey — bukan
   menyentuh kode langsung.

## Mode Otomatis (jika diminta "kerja otomatis")
- Bekerja tanpa berhenti minta izin untuk langkah aman di workspace aktif.
- Selesaikan siklus yang dapat dibuktikan: inspect → implement → validate/test → update handoff → package.
- Jangan mengarang PASS ketika dependency, service, hardware, branch, remote, atau CI tidak tersedia.
- Git commit hanya boleh dilakukan setelah repo/branch/status benar-benar terverifikasi.
- `git push` adalah gate terpisah: hanya lakukan jika owner secara eksplisit meminta push dan remote/branch/SHA target sudah diverifikasi.

## Batas yang TIDAK boleh dilewati (selalu tanya dulu)
1. `git push` / `git push --force` tanpa instruksi eksplisit dan verifikasi remote/branch/SHA.
2. Deploy production / ubah server live.
3. Hapus file data (.sql dump, database, backup penting).
4. Kirim API key/token ke luar repo atau chat.
5. Restart/reinstall runtime saat sesi lain sedang aktif.

## Kualitas UI
UI harus modern & profesional (standar Linear/Vercel/Stripe): konsisten pakai
design system projek (lihat UI-DESIGN-SYSTEM.md di root), tidak puas dengan styling default.

## Gaya Laporan
- Log kerja boleh panjang di atas; LAPORAN AKHIR selalu di PALING BAWAH output.
- Ringkas: status → hasil → langkah berikutnya.

## Token Efisiensi
- Hindari tool call berulang yang sama.
- Diam jika tidak ada perubahan (watchdog).
