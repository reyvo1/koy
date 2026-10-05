# DevOps Contract

Gunakan repository package manager dan exact lockfile. Docker production harus
multi-stage dan non-root bila kompatibel. Local dependencies menggunakan Docker
Compose. Environment local, test, staging, dan production harus terpisah.

CI minimum mencakup frozen dependency install, lint/static checks, build atau
typecheck, tests, security checks, container build, graceful shutdown,
liveness/readiness, backup/restore drill, serta logs/metrics/tracing readiness.

Module execution menggunakan satu exact candidate, satu dependency bootstrap,
satu broad Full Jest, dan satu cleanup. Default disposable workspace adalah
`%TEMP%\iw`; `node_modules`, generated Prisma client, worktree, dan temporary
candidate wajib dihapus pada sukses maupun gagal. Npm cache resmi boleh digunakan
untuk efisiensi. Stale workspace hanya dibersihkan oleh official automation.

Commit, push, completion, activation, dan deployment adalah gate terpisah. Tidak
boleh ada force push, amend, `reset --hard`, `git clean`, atau automatic rollback
terhadap main.

## Production approval and rollback compatibility — current contract (2026-10-05)

- Repository/UAT green is necessary but never sufficient for deployment approval. `production-approval.json` requires separately captured `PRODUCTION_ENVIRONMENT` evidence bound to the exact `release-manifest.json`.
- Production preflight requires Node.js 22, protected env files, `vm.overcommit_memory=1`, non-placeholder secrets, and Scheduler/Automation/Notification runtimes explicitly enabled. Installer must re-check environment hashes/permissions/sysctl before dependency install or migration so stale approval fails closed. Environment evidence older than 24 hours must be recaptured.
- Application rollback does not reverse Prisma migrations. New destructive/backward-incompatible migration SQL after the historical cutoff is forbidden by automated gate; use expand-contract so the immediately previous application remains compatible.
- Core GitHub Actions must use the reviewed Node 24 runtime generation; deprecated Node 20 pins are a gate failure.
