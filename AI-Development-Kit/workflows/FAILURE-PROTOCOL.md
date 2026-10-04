# Failure Protocol

## First Proven Failure

Saat command resmi pertama gagal:

1. STOP pada gate tersebut dan jangan pindah ke gate/wave yang tidak terkait;
2. simpan exact command, exit code, error, validation log, dan Git status;
3. jangan retry candidate identik;
4. jangan mencoba flag, runner, registry, atau command alternatif untuk mengejar hijau;
5. identifikasi root-cause class dan audit source/script/config/document contract yang satu kelas;
6. perbaiki seluruh konsekuensi lokal yang dapat ditemukan oleh gate murah;
7. jalankan targeted/cheap checks lalu official local pre-push sekali untuk candidate baru;
8. bila candidate tidak dapat diteruskan dengan aman, tandai INVALID dan laporkan safe checkpoint.

Jangan menghapus, skip, atau melemahkan test, lint rule, type checking,
validation, tenant boundary, atau security control untuk membuat validation
hijau.

## Recovery Candidate

Candidate baru hanya boleh dibuat setelah root cause dan pola sejenis pada exact
scope diperiksa. Perbaiki seluruh konsekuensi lokal yang dapat ditemukan oleh
gate murah sebelum menjalankan official validation lagi.

Artifact gagal tidak boleh dijalankan ulang atau diberi versi baru tanpa
perubahan bytes nyata. Evidence hanya boleh digunakan ulang bila exact base,
candidate hashes, lifecycle, profile, toolchain, lockfile, source, dan environment
requirements identik.

## Repository and Workspace Boundary

Disposable worktree adalah failure boundary. Main tidak boleh diperbaiki dengan
`reset --hard`, `git clean`, broad formatter, direct edit, amend, atau force
push. Temporary worktree, `node_modules`, generated files, dan workspace harus
dibersihkan oleh official automation. Report dan validation log tetap disimpan.

## Required Failure Report

Laporan harus menyatakan:

- `STATUS: STOPPED`;
- first proven failure;
- exact command dan exact error;
- repository impact dan Git status;
- safe checkpoint;
- artifact status;
- cleanup status;
- tindakan yang tidak dilakukan;
- exact next action pada root-cause class yang sama.
