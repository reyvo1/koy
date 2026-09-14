# Failure Protocol

## First Proven Failure

Saat command resmi pertama gagal:

1. STOP pada gate tersebut;
2. simpan exact command, exit code, error, dan validation log;
3. jangan retry candidate identik;
4. jangan mencoba flag, runner, registry, atau command alternatif;
5. jangan lanjut ke gate berikutnya;
6. tandai artifact INVALID;
7. verifikasi repository impact, Git status, workspace, dan cleanup secara
   read-only;
8. tunggu keputusan owner.

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
- keputusan owner berikutnya.
