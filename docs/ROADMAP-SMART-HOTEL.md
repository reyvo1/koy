# ROADMAP: IoT-Platform × TAMASYA — Smart Hotel Integration
# Pegangan produksi (dibuat 25/08, sesi Rey "lanjut keuangan")
Status: BLUEPRINT — belum dieksekusi. Mulai hanya jika IoT stabil di produksi.

## Prinsip pengembangan
1. Satu fase = satu deliverable yang bisa didemokan ke pemilik hotel.
2. Hardware terakhir, software dulu: simulasi device sebelum beli barang.
3. Setiap fase punya argumen jual (hemat apa / aman apa) — bukan fitur demi fitur.
4. Integrasi lewat API/queue — TAMASYA dan IoT TIDAK berbagi database langsung.

## Arsitektur besar
TAMASYA (PHP) --HTTP event--> IoT Bridge API --MQTT--> Gateway ruangan --> perangkat
Perangkat: RFID reader/card encoder, energy saver switch, sensor pintu/asap/suhu.

---

## FASE 0 — Fondasi integrasi (2-3 minggu)
Tujuan: pipa antara dua sistem nyala, tanpa hardware sama sekali.
- [ ] Modul `hotel-bridge` di IoT-Platform:
  - REST endpoint: POST /bridge/hotel/events (check_in, check_out, extend, room_change)
  - Auth API-key per properti hotel + HMAC signature
  - Event disimpan ke tabel bridge_events (idempotent by event_id)
- [ ] Sisi TAMASYA: class kecil HotelBridgeClient (curl POST) dipanggil di hook check-in/out.
  - Mode sandbox: kalau URL kosong -> log saja, tidak error. Hotel non-IoT tetap aman.
- [ ] Simulator device (Node script): subscribe MQTT, log semua command.
Definisi selesai: check-in dummy di TAMASYA muncul sebagai event di IoT dashboard.
Argumen jual: tidak ada — internal.

## FASE 1 — Energy saver (pilot produk pertama) (3-4 minggu)
Tujuan: produk pertama yang DIJUAL sendiri-sendiri. Hemat listrik = cepat balik modal.
- [ ] Device profile `energy-saver`: relay WiFi/MQTT (contoh chip Sonoff/Shelly atau custom ESP32).
- [ ] Logika: kartu masuk holder -> relay ON; dicabut 30 detik -> AC+lampu OFF (delay agar tidak menyakiti tamu).
- [ ] Manual override dari TAMASYA (housekeeping butuh listrik saat kamar kosong, akses sementara 30 menit).
- [ ] Dashboard IoT: status per kamar, laporan hemat kWh/bulan (sensor daya opsional; default estimasi jam operasional).
Pilot: 5 kamar di hotel kenalan, ukur tagihan listrik 1 bulan vs bulan lalu.
Argumen jual: "hemat 15-20% listrik kamar, balik modal <1 tahun".

## FASE 2 — Door lock RFID (inti smart hotel) (6-8 minggu)
Tujuan: kunci kartu penuh, terintegrasi check-in/out.
- [ ] Pilih lock: yang pakai standar terbuka (OSDP/Wiegand reader terpisah) ATAU lock online WiFi dengan MQTT — hindari vendor closed yang kunci datanya.
- [ ] Card encoder di front desk: USB RFID writer + modul `card-credential` di IoT:
  - encode kartu = tulis UID+validity; credential disimpan hashed
  - auto-expire mengikuti checkoutDueAt dari TAMASYA
- [ ] Alur: TAMASYA check-in -> bridge event -> IoT aktifkan kredensial -> front desk tap kartu -> done (<10 detik).
- [ ] Kehilangan kartu: blokir satu kartu tanpa ganggu kamar lain.
- [ ] Housekeeping: kartu staf akses terbatas jam kerja + log semua pembukaan pintu.
Argumen jual: "kunci hilang tidak perlu ganti silinder, audit trail semua akses".

## FASE 3 — Sensor & safety layer (4 minggu, bisa paralel Fase 2)
- [ ] Sensor pintu jendela (buka saat tamu keluar), asap, bocor air kamar mandi.
- [ ] Notif ke grup Telegram hotel (pakai pola bot Dompet Owner!) + dashboard alert.
- [ ] Laporan insiden untuk manajemen.
Argumen jual: keamanan + asuransi lebih murah.

## FASE 4 — Guest experience premium (opsional, nilai tambah)
- [ ] Mobile key: tamu buka pintu via web-app (user-web apps/) — NFC/BLE via WebAPI terbatas, evaluasi dulu.
- [ ] Scene kamar: tombol "malam tidur" (lampu redup, AC set suhu), "pagi".
- [ ] Mini PMS dashboard TV (reuse pola tv.php Dompet Owner): status okupansi real-time.

## FASE 5 — Produk komersial
- [ ] Multi-property: satu deployment IoT bisa layani beberapa hotel (multi-tenant sudah ada di IoT).
- [ ] Paket harga: hardware cost-up + instalasi + langganan monitoring bulanan.
- [ ] SLA & remote support (OTA update gateway).
- [ ] Materi jual: studi kasus pilot Fase 1 (data hemat listrik nyata).

---

## Risiko & mitigaasi
| Risiko | Mitigasi |
|---|---|
| Lock vendor closed-source | Pilih reader standar OSDP/Wiegand atau lock MQTT online |
| Internet hotel mati | Relay tetap lokal (gateway), fallback kartu mekanis |
| Tamu cabut kartu bawaan pulang | Energy saver hanya merespon kartu hotel yang terdaftar |
| TAMASYA down | Front desk fallback: encoder manual mode di IoT dashboard |

## Urutan eksekusi disarankan
Fase 0 → 1 → pilot → 2 → 3 → (4/5 saat ada pelanggan bertanya).
JANGAN kerjakan Fase 4 sebelum Fase 2 stabil.
