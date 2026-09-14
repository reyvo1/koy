# ADR-003: Payment Adapter — Sandbox-First (Midtrans Snap)

- Status: ACCEPTED
- Tanggal: 2026-08-23

## Konteks

ROADMAP v2.0 fase 5. Modul 27 sudah punya tabel billing, tapi tidak ada
provider adapter. Akun Midtrans produksi milik owner belum dibuat.

## Keputusan

1. Adapter pattern: `PaymentProvider` interface + implementasi
   `MidtransSandboxAdapter`. Provider lain tinggal menambah class baru.
2. **Fail-closed**: tanpa `MIDTRANS_SERVER_KEY` di environment, adapter
   berjalan mode SIMULASI — invoice dibuat lokal dengan status
   `SIMULATED`, tidak ada panggilan jaringan.
3. Kredensial hanya lewat environment variable; tidak pernah di-commit.
4. Webhook callback `/payments/webhook` memverifikasi signature key
   sebelum mengubah status invoice.

## Konsekuensi

- Billing UI bisa dikembangkan & diuji sekarang (sandbox/simulasi).
- Saat owner menyediakan akun produksi, cukup set env + ganti flag
  sandbox→production. Tidak ada perubahan kontrak.

## Alternatif ditolak

- Menunggu akun produksi (menghambat roadmap).
- Hard-code provider tunggal (melanggar vendor neutrality).
