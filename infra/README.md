# Infrastructure — production host skeleton

A readable, reproducible *description* of the intended single-host production environment
(`docs/deployment-recovery.md`): a compute host, a firewall with only 80/443 public and MQTT
restricted to declared device ranges, a block volume for encrypted backups, and DNS labels.

## What this is

`terraform/` holds a Terraform skeleton whose only providers are `hashicorp/null` and
`hashicorp/local`. Both are offline: `terraform init` downloads them and needs no account, no
credentials file and no cloud API endpoint, so the whole directory is verifiable on an
air-gapped laptop. Every command lives in a `null_resource` whose `count` is
`var.apply_enabled ? 1 : 0`, and `apply_enabled` defaults to `false`.

That produces the asymmetry this skeleton is built around:

| Command | Result with the committed defaults |
|---|---|
| `terraform init` | downloads the two offline providers |
| `terraform validate` | PASS — the configuration is syntactically and semantically valid |
| `terraform plan` | empty plan: `0 to add, 0 to change, 0 to destroy` |
| `terraform apply` | provable no-op: no resources, no commands, no files |

With `apply_enabled = true` the commands still create nothing: they re-check the flag, refuse
to run while any `REPLACE_WITH_*` placeholder remains, and print the manual steps the operator
must perform (provision the host, install the operator SSH key, install the reviewed
environment files, capture environment evidence and obtain production approval before
installing any release). The only file any resource writes is
`terraform/rendered/deployment-plan.json`, and only under that same flag.

A skeleton that "worked" by calling a cloud API would either demand credentials a reviewer
does not have or spend money the moment someone ran it. This one is verifiable by reading it,
and it cannot create anything on its own: no provider in it talks to a control plane, and the
only commands it can run are the guarded, placeholder-checking prints shown above.

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # gitignored; replace every placeholder
terraform init
terraform validate
terraform plan                                 # expect an empty plan with the defaults
```

`terraform.tfvars` and `rendered/` are gitignored: the first holds operator-owned hostnames,
CIDRs and an SSH public key, the second is generated output that embeds those same values.
`terraform.tfvars.example` is the committed, placeholder-only copy.

## What this is not

- **Not a deployment tool.** Application releases are installed by
  `ops/scripts/install-release.sh`, which runs the production approval, environment-evidence,
  migration-compatibility and release-verification gates (`docs/deployment-recovery.md`).
  Nothing here installs a release, and `apply_enabled = true` does not deploy the platform.
- **Not a claim about any environment.** Every value is a placeholder owned by the deployment
  operator. The rendered plan says so in its own `note` field.
- **Not staging infrastructure.** `staging` is an accepted label for `environment`, but no
  staging environment is provisioned by this skeleton.

## Verification performed against this directory

The contract `test/ops-production-observability.contract.spec.ts` locks the properties that
make the skeleton safe to ship: the provider boundary (offline providers only), the
`apply_enabled` default, the placeholder refusals in every guarded command, the
`gitignore` coverage for operator-owned files, and the fact that the committed
`terraform.tfvars.example` contains nothing but placeholders. Terraform itself is not
executed in CI, which is precisely why those properties are asserted from source.
