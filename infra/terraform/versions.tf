# Terraform version constraints and provider boundaries for the IoT Platform skeleton.
#
# Why this file is separate
# ------------------------
# Keeping the terraform block out of main.tf makes the provider boundary auditable in one
# screen: a reader can confirm that nothing here can reach a cloud control plane.
#
# The only providers allowed are hashicorp/null and hashicorp/local. Both are offline
# providers: `terraform init` downloads them and needs no account, no credentials file and
# no cloud API endpoint, so `terraform validate` works on an air-gapped operator laptop.
# That is the whole point -- a skeleton that silently required credentials would either
# fail for the operator or, worse, succeed with a real account.
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}
