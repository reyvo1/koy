# Agent Execution Loop

AUDIT → BOUND SCOPE → BUILD CANDIDATE → CHEAP CHECKS → OWNER APPROVAL →
OFFICIAL VALIDATION+COMMIT → VERIFY → CLEANUP → HANDOFF

## Audit

Verifikasi exact active Git commit, branch, clean status, tracked-file count,
lifecycle, module/slice, manifest, lockfile, profile, dan relevant source. Pada
input identik, baca hanya file yang berubah dan evidence baru.

## Bound Scope

Tetapkan exact allowed paths, forbidden paths, expected tracked files, commit
subject, validation profile, dan dampak architecture/contracts/docs. Jangan
melompat module atau memperluas scope tanpa approval.

## Build Candidate

Susun exact-file payload di luar main. Sinkronkan source, tests, Kit, docs,
profiles, contracts, dan lifecycle metadata yang memang berada dalam scope.
Hitung SHA-256 setiap payload file dan artifact.

## Cheap Checks

Sebelum gate mahal, periksa syntax, JSON/schema, hashes, allowlist, forbidden
paths, tracked-file projection, formatting, lint/static consequences, dan
focused state-sensitive contracts sejauh environment mendukung.

Jika environment agent tidak dapat menjalankan gate authoritative, jangan membuat
runner pengganti. Serahkan gate tersebut ke official Windows repository command.

Pada first proven failure, STOP dan gunakan exact failure evidence sebagai batas perbaikan.

## Official Validation and Commit

Hanya setelah owner mengatakan `commit`, jalankan satu official validation+local
commit untuk exact candidate. `module:package` melakukan satu Doctor authoritative;
jangan mendahuluinya dengan Doctor standalone. Gunakan satu dependency bootstrap,
satu Full Jest, dan matrix hanya bila profile mewajibkan.

## Verify and Cleanup

Verifikasi exact HEAD, commit parent/subject, changed paths, hashes, clean status,
workspace removal, remaining owned workspace count, dan disk state. Simpan report,
log, snapshot, dan local-unpushed handoff. STOP tanpa push.

## Push and Lifecycle

Push hanya setelah approval `push` dan hanya exact validated SHA. Verifikasi
exact-SHA CI sebelum remote-green handoff. Completion, activation, dan deployment
memerlukan approval terpisah.
