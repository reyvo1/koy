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
