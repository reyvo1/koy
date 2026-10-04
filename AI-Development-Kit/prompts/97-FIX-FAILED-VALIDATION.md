# Fix Failed Validation

Mulai dari exact failure evidence dan safe checkpoint terakhir.
Pada first proven failure, STOP pada gate tersebut sebelum melakukan perubahan yang tidak terkait.

- Jangan menjalankan ulang artifact yang gagal.
- Jangan mencoba command, flag, registry, atau runner alternatif.
- Audit root cause dan seluruh konsekuensi sejenis dalam bounded scope.
- Periksa error murah seperti format, unused symbol, JSON, path, hash, dan contract
  mismatch sebelum membangun candidate baru.
- Buat artifact versi baru hanya bila bytes berubah.
- Jangan mengubah main secara manual.
- Jangan menambah fitur yang tidak terkait root-cause class.
- Sinkronkan test, CI, dokumentasi dan handoff yang menjadi bagian kontrak yang sama.
- Physical ESP32/camera tidak memblokir software certification; gunakan source-bound
  `SIMULATED_HARDWARE_LIVE_SERVICE` dan label physical/site/HIL secara terpisah.

Setelah candidate baru siap, jalankan cheap/targeted checks lalu official local pre-push.
Review diff sekali; commit/push tetap mengikuti approval owner yang sudah berlaku untuk batch tersebut.
