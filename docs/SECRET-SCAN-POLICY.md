# Why these paths are excluded from the secret scan

`.secretlintrc.json` is strict JSON and cannot carry comments, so the reasoning for each ignore lives here.

## `test/fixtures/**`, `**/__fixtures__/**`

These hold deliberate `PRIVATE KEY` blocks, certificates and client keys used by the TLS suites
(`test/mqtt-production-publisher.integration-spec.ts` starts a real `node:tls` server from
`test/fixtures/mqtt-tls/`). The material is throwaway: it exists so a test can run without a live secret,
and it is committed on purpose.

A scanner that flags its own fixtures trains people to reach for `--no-ignore` or to disable the gate, which
removes the protection from every real path. Excluding fixtures is the honest trade: the guarantee is that a
credential leaking into a **non-fixture** path fails the build, not that no fixture ever looks like a key.

## `**/*.md`

Documentation quotes the *shape* of a secret so operators know what to search for when auditing. The values
are placeholders (`<your-key>`, `xxxxxxxx`), never credentials.

## Generated and vendored trees

`node_modules`, `dist`, `.next` and `build` are not source. The scan is deliberately run over
`git ls-files`, so these are excluded twice over — by `.gitignore` at the git level and here at the tool
level — because a vendored library's own test keys are not this repository's to fail on.

## What is NOT ignored

Any `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.json`, `.yml`, `.yaml`, `.env`, `.pem`, `.key` or shell file that
git tracks outside the fixture and documentation paths. `docs/ENTERPRISE-ACCEPTANCE-EVIDENCE.md` and the rest
of the documentation are prose; `ops/`, `scripts/`, `src/`, `apps/` and `.github/` are not.