# Fix Failed Validation

Mulai dari exact failure evidence dan safe checkpoint terakhir.
Pada first proven failure, STOP sebelum melakukan perubahan tambahan.

- Jangan menjalankan ulang artifact yang gagal.
- Jangan mencoba command, flag, registry, atau runner alternatif.
- Audit root cause dan seluruh konsekuensi sejenis dalam bounded scope.
- Periksa error murah seperti format, unused symbol, JSON, path, hash, dan contract
  mismatch sebelum membangun candidate baru.
- Buat artifact versi baru hanya bila bytes berubah.
- Jangan mengubah main secara manual.
- Jangan menambah fitur.

Setelah candidate baru siap, tunggu approval owner. Official validation+local
commit dijalankan satu kali setelah perintah `commit`.
