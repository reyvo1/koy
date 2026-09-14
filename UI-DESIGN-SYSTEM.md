# UI DESIGN SYSTEM — Standar Wajib Semua Projek Rey

> Referensi riset internet (Agustus 2026): tren dashboard SaaS terbaik — Linear, Vercel, Stripe, Supabase, Raycast, Mercury.
> Berlaku untuk SEMUA pekerjaan UI baru. Jika projek punya design system sendiri yang sudah matang → itu menang; ini standar minimum.

## Prinsip Inti (2026 trends)
1. **Progressive disclosure** — tampilkan 1 metrik utama dulu ("apakah semua aman?"), detail menyusul via drill-down. Jangan dinding data di first paint (gaya Stripe/Linear).
2. **Dark-mode-first** — desain dark theme DULU sebagai tema utama (token-based, bukan invert asal), light mode menyusul. Satu warna aksen saja, kontras ketat (gaya Raycast/Supabase).
3. **Warna = status, bukan dekorasi** — merah berarti rusak, kuning perhatian, hijau sehat. Maksimal 1 aksen + netral.
4. **Cap KPI** — maksimal 1 metrik primer + beberapa sekunder per view.
5. **AI-native surface** — ringkasan/saran AI sebagai elemen kelas satu, bukan chat widget nempel di pojok.

## Token Visual
- Font: Inter / Geist / system-ui. Ukuran: 13-14px body, 24px+ heading.
- Radius: 8-12px kartu, 6px input/button. Shadow halus ATAU border 1px (pilih satu gaya, konsisten).
- Spacing kelipatan 4px (4/8/12/16/24/32). Padding kartu 16-24px.
- Grid: max-width konten 1200-1440px, sidebar 240px collapsible.
- Dark palette dasar: bg #0B0E14, surface #131722, border rgba(255,255,255,.08), text #E6E9F0 / muted #8B93A7.
- Aksen: pilih 1 (indigo #6366F1 atau biru #3B82F6), success #22C55E, warning #F59E0B, danger #EF4444.

## Komponen Wajib Rapi
- Tabel: header sticky, zebra halus, row hover, empty state berilustrasi teks jelas.
- Form: label di atas, validasi inline, disabled state jelas.
- Loading: skeleton screen (bukan spinner polos).
- Toast untuk feedback aksi; konfirmasi modal untuk aksi destruktif.
- Chart: gunakan library konsisten (Recharts/Tremor), tooltip interaktif.

## Anti-Pattern (DILARANG)
- ❌ Gradient ungu-biru norak, glow berlebihan, emoji sebagai ikon UI
- ❌ Bootstrap default look, font Times/Arial, tabel polos tanpa style
- ❌ Alert browser native (alert()/confirm())
- ❌ Warna acak tiap halaman, spacing tidak konsisten
- ❌ Menampilkan semua data sekaligus tanpa hierarki

## Proses
Sebelum bikin UI baru: cek dulu apakah projek punya design system sendiri → ikuti itu.
Kalau tidak ada → terapkan standar file ini. Ragu referensi? cari contoh dashboard
SaaS terkini di internet sebelum coding.
