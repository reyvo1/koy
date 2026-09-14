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
