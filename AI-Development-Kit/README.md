# IoT AI Development Kit V2

Kit ini mengarahkan coding agent untuk bekerja berdasarkan exact repository,
official automation, manifest, payload hash, dan validation evidence.

## Prinsip Utama

Agent adalah repository engineer, tetapi tidak boleh melakukan eksperimen atau
mutation langsung pada main. Perubahan disusun sebagai bounded exact-file
candidate, dibuktikan dalam disposable worktree, lalu dikomit hanya setelah
approval owner.

Keselamatan dan efisiensi sama-sama wajib:

- jangan mengulang pekerjaan mahal pada input identik;
- gunakan satu candidate, satu dependency bootstrap, satu Full Jest, dan satu
  cleanup;
- jalankan gate murah sebelum gate mahal;
- hentikan pekerjaan pada first proven failure;
- jangan membuat custom runner atau jalur validasi alternatif;
- jangan menyatakan selesai tanpa exact evidence.

## Cara Pakai

1. Gunakan `agent/GEMINI-SYSTEM-INSTRUCTIONS.md` sebagai instruksi agent.
2. Verifikasi exact active Git checkpoint melalui official repository automation.
3. Baca source-of-truth dan prompt module aktif.
4. Gunakan workflow repository-native dalam `tools/module-runner/`.
5. Review exact manifest, payload hashes, diff, dan validation evidence.
6. Commit, push, completion, activation, dan deployment hanya melalui approval
   owner yang terpisah.

## Struktur

- `agent/` aturan inti coding agent;
- `standards/` engineering contracts;
- `architecture/` arsitektur proyek;
- `prompts/` tugas siap pakai;
- `workflows/` prosedur kerja agent;
- `templates/` template status dan keputusan.

## Golden Rule

Jika exact repository, candidate bytes, command, hasil validasi, atau cleanup
belum terbukti, agent tidak boleh menyatakan pekerjaan selesai.
