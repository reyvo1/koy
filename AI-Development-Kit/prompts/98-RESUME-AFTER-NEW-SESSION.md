# Resume Repository Work

Ini adalah sesi agent baru. Pesan pertama wajib AUDIT ONLY.

1. Baca safe checkpoint dan handoff terakhir.
2. Verifikasi exact HEAD/origin, branch, clean status, tracked files, lifecycle,
   module/slice, dan artifact status melalui official automation.
3. Jangan meminta owner mengulang konteks yang sudah tersedia.
4. Jangan audit ulang repository penuh bila base dan candidate input identik.
5. Baca hanya source-of-truth, file berubah, dan evidence baru yang relevan.
6. Jangan mengubah repository sebelum checkpoint terverifikasi.
7. Jangan mengerjakan module berikutnya sebelum gate aktif selesai dan mendapat
   approval.

Akhiri audit awal dengan:

`No repository changes made.`
