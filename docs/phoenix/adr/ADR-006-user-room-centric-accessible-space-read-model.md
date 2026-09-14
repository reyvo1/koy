# ADR-006: User Room-Centric Accessible Space Read Model

- Status: ACCEPTED (Foundation Alignment owner direction)
- Tanggal: 2026-09-13

## Konteks

Product Vision menetapkan pengalaman end-user yang room-centric, sedangkan
User Web R8 hanya mengarahkan `/beranda`, `/ruangan`, dan `/perangkat-saya`
kembali ke dashboard root. Backend sudah memiliki Space hierarchy (Modul 17)
dan owner/share authorization VIEW/CONTROL (Modul 18), tetapi endpoint
administratif `/spaces` dilindungi `AdminRoleGuard` dan tidak boleh dibuka
langsung ke MEMBER.

Membuat User Web menggabungkan seluruh daftar space tenant dengan daftar
perangkat di client akan berisiko menjadikan placement sebagai sumber otorisasi
atau mengekspos metadata space/perangkat yang tidak seharusnya terlihat.

## Keputusan

1. Tambahkan **read-only additive endpoint** `GET /spaces/accessible`.
2. Endpoint tetap memakai `JwtAuthGuard` + `TenantContextGuard`, tetapi tidak
   memakai `AdminRoleGuard` karena ditujukan untuk user aktif tenant.
3. Device visibility ditentukan **lebih dulu** oleh policy owner/share yang
   sudah ada. Space/ROOM placement hanya mengelompokkan perangkat yang sudah
   memiliki VIEW; placement tidak pernah memberikan izin.
4. `canControl` ditentukan terpisah melalui `DeviceAccessService`. VIEW share
   tidak boleh berubah menjadi CONTROL karena berada pada room yang sama.
5. Read model hanya mengembalikan metadata perangkat yang diperlukan User Web
   (id, name, type, status, lastHeartbeatAt, room metadata, canControl). Secret,
   credential, provisioning token/hash, dan detail transport tidak diteruskan.
6. Surface dibatasi 500 perangkat per response dan mengembalikan `truncated`
   secara eksplisit bila jumlah authorized device lebih besar. Tidak ada data
   tambahan yang diimajinasikan.
7. Tidak ada perubahan Prisma schema dan tidak ada perubahan breaking pada
   kontrak `/spaces` administratif yang sudah dibekukan.

## Konsekuensi

- `/beranda`, `/ruangan`, dan `/perangkat-saya` dapat menjadi backend-backed
  tanpa menghidupkan kembali demo/static data.
- User Web Device Detail dapat menampilkan `VIEW` vs `VIEW + CONTROL` secara
  jujur dengan sumber policy yang sama seperti command/telemetry guards.
- Empty room yang tidak memiliki authorized device tidak ditampilkan pada read
  model user; ini disengaja untuk mencegah space hierarchy menjadi side-channel
  lintas akses.
- Runtime acceptance PostgreSQL/Redis/EMQX/API tetap gate terpisah; ADR ini
  tidak mengklaim integrasi live atau production readiness.

## Alternatif ditolak

- Membuka `GET /spaces` administratif untuk semua MEMBER: terlalu luas dan
  mengubah boundary admin.
- Menganggap semua device dalam room yang dapat dilihat sebagai authorized:
  melanggar owner/share VIEW/CONTROL.
- Mengembalikan seluruh object `Device` dari Prisma: berisiko mengekspos field
  provisioning/credential metadata yang tidak dibutuhkan end-user.
