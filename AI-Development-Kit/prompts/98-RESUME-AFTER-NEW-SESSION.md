# Resume Repository Work

Ini adalah sesi agent baru. Mulai dengan **RESUME CHECKPOINT**, bukan audit dari nol.

1. Baca `docs/SESSION-HANDOFF-PROTOCOL.md`, lalu blok current paling atas di `PASTE-KE-CHAT-BERIKUTNYA.txt`, `PROJECT-HANDOFF.md`, `CURRENT-STATE.md`, `docs/SESSION-CHECKPOINT.md`, dan `chat-session.md`.
2. Di checkout operator yang nyata, verifikasi `git rev-parse HEAD`, branch/upstream dan `git status --short`. Jangan membuang dirty candidate yang memang dicatat sebagai pekerjaan aktif.
3. Cocokkan latest GitHub evidence/log dengan handoff. Lanjutkan dari **first failing gate** terakhir; jangan mengulang audit repository penuh bila candidate/evidence masih identik.
4. Perbaiki root-cause class sampai tuntas, lalu jalankan targeted/cheap checks dan official local pre-push gate. Jangan melemahkan assertion untuk mengejar hijau.
5. Physical ESP32/camera tidak boleh menghentikan software work. Maksimalkan source-bound `SIMULATED_HARDWARE_LIVE_SERVICE`; physical/site/HIL tetap kelas field evidence terpisah dan tidak boleh dipalsukan.
6. Satu coherent batch → satu review diff → satu commit/push → GitHub heavy UAT. Red CI tetap pada batch/root-cause yang sama sampai hijau.
7. Sebelum pindah sesi atau handoff, perbarui `chat-session.md`, `PASTE-KE-CHAT-BERIKUTNYA.txt`, `PROJECT-HANDOFF.md`, `docs/SESSION-CHECKPOINT.md`, dokumentasi terkait, lalu reseal manifest. Jalankan `npm run session:handoff:self-test`.

Jangan meminta owner mengulang konteks yang sudah tersedia di repository/handoff.
