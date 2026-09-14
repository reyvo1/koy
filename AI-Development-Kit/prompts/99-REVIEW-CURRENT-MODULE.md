# Review Current Module

Jangan menambah fitur baru atau mengedit main secara langsung.

Review exact candidate module aktif seperti senior reviewer:

1. verifikasi manifest, payload hashes, diff, allowlist, dan forbidden paths;
2. cari bug, cross-tenant authorization flaw, secret leakage, invalid error
   handling, race/idempotency issue, schema/index problem, MQTT contract issue,
   missing validation, weak tests, dan docs drift;
3. audit konsekuensi lint/static/contract dari setiap perbaikan;
4. susun bounded candidate baru hanya bila ditemukan masalah terbukti;
5. gunakan official validation setelah approval owner;
6. laporkan bukti faktual, bukan keyakinan.

Jangan commit atau push tanpa perintah owner.
