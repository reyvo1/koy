# Active enterprise override — 2026-10-04

<!-- ENTERPRISE-WAVE-SYNC: authority=docs/ENTERPRISE-WAVE-ROADMAP.md; software-closed=1-12; active=13 -->

Waves 1–12 have **software scope CLOSED / GREEN** under the evidence boundaries in `docs/ENTERPRISE-WAVE-ROADMAP.md`. Wave 13 is **IN PROGRESS**. Missing physical ESP32/camera hardware must **not** stop software completion: GitHub must exercise the strongest production-shaped `SIMULATED_HARDWARE_LIVE_SERVICE` path and bind it to the sealed source plus exact firmware artifact. Simulation is never relabeled PHYSICAL/HIL; later site/HIL observations are a separate, non-blocking field-validation class. Provider-owned behavior that cannot be simulated remains explicitly external.

Do not reopen closed Wave 1–12 software root causes without new failing evidence. Continue Wave 13 certification, regression hardening and automated simulated-hardware UAT until every software-controlled behavior is green. Production approval remains fail-closed on the automated/source-bound approval receipt and any genuinely provider-owned gate, not on possession of optional physical lab equipment.

Session continuity is mandatory: read `docs/SESSION-HANDOFF-PROTOCOL.md` and the current top blocks before modifying code; verify real `git rev-parse HEAD` / `git status --short`, preserve a recorded dirty candidate, and resume from the first failing gate instead of auditing from zero. Before changing sessions, update the handoff/checkpoint files and run `npm run session:handoff:self-test`.

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
