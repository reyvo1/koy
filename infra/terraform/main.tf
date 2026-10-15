# IoT Platform production host skeleton.
#
# What this file is
# -----------------
# A reproducible description of the intended single-host production environment
# (docs/deployment-recovery.md) in the shape Terraform can read: a compute instance, a
# firewall with only 80/443 public and 18884 restricted, a block volume for encrypted
# backups, and DNS labels.
#
# What this file is NOT
# ---------------------
# It is not a deployment tool and it does not create anything. There is no cloud provider
# in this configuration -- the only providers are hashicorp/null and hashicorp/local -- so
# no account, credential or API endpoint can be reached from here. Every command lives in a
# null_resource whose `count` is `var.apply_enabled ? 1 : 0`, and var.apply_enabled defaults
# to false. With the default, `terraform apply` is a provable no-op: zero resources, zero
# commands. With apply_enabled = true the commands still create nothing: they validate that
# no placeholder remains and print the manual steps the operator must perform.
#
# That asymmetry is the point. A skeleton that "worked" by calling a cloud API would either
# demand credentials a reviewer does not have, or spend money the moment someone ran it.
# This one is verifiable by reading it.

terraform {
  backend "local" {}
}

provider "null" {}

provider "local" {}

locals {
  # Rendered once and reused by the plan artifact and the guarded commands.
  plan = {
    schema      = "iot-platform-infra-skeleton/1"
    environment = var.environment
    host = {
      name    = var.host_name
      dns_api = var.dns_records["api"]
    }
    firewall = {
      public_http_ports = var.public_http_ports
      mqtt = {
        port           = var.mqtt_port
        allowed_cidrs  = var.mqtt_allowed_cidrs
        sources_pinned = !contains(var.mqtt_allowed_cidrs, "REPLACE_WITH_OPERATOR_CIDR")
      }
      ssh = {
        allowed_cidr = var.ssh_allowed_cidr
      }
    }
    backup = {
      volume_size_gb = var.backup_volume_size_gb
      mount_point    = var.backup_volume_mount
    }
    guarded_commands_enabled = var.apply_enabled
    note                     = "Placeholder values are operator-owned. Nothing in this plan was applied to a real environment."
  }
}

# Compute host. Guarded twice: `count` keeps the resource out of the graph entirely unless
# the operator flips the switch, and the command itself refuses to run if the flag is not
# "true" -- so a stale plan file or a hand-edited count cannot resurrect the run silently.
resource "null_resource" "compute_instance" {
  count = var.apply_enabled ? 1 : 0

  triggers = {
    apply_enabled = tostring(var.apply_enabled)
    environment   = var.environment
    host_name     = var.host_name
  }

  provisioner "local-exec" {
    environment = {
      APPLY_ENABLED = tostring(var.apply_enabled)
      HOST_NAME     = var.host_name
      ENVIRONMENT   = var.environment
      SSH_KEY       = var.ssh_public_key
    }

    command = <<-EOT
      set -euo pipefail
      if [ "$APPLY_ENABLED" != "true" ]; then
        echo "refusing to run: apply_enabled is not true" >&2
        exit 1
      fi
      case "$HOST_NAME" in
        REPLACE_WITH_*)
          echo "refusing to run: host_name is still the repository placeholder ($HOST_NAME)" >&2
          exit 1
          ;;
      esac
      case "$SSH_KEY" in
        REPLACE_WITH_*)
          echo "refusing to run: ssh_public_key is still the repository placeholder" >&2
          exit 1
          ;;
      esac
      echo "PLAN ONLY -- no infrastructure was created."
      echo "compute host for $ENVIRONMENT: $HOST_NAME"
      echo "manual steps this skeleton deliberately leaves to the operator:"
      echo "  1. provision the host per docs/deployment-recovery.md (Node.js 22, PostgreSQL client tools, Redis, Nginx, GnuPG, systemd)"
      echo "  2. install the operator SSH public key and restrict the SSH port"
      echo "  3. install the reviewed environment files with the required owners and modes"
      echo "  4. capture environment evidence and obtain production approval before installing any release"
    EOT
  }
}

# Firewall policy for the host: 80/443 public, MQTT restricted to the operator-declared
# device ranges, SSH restricted to the operator-declared admin range, and everything else
# -- PostgreSQL, Redis, the application port, /metrics -- denied.
resource "null_resource" "firewall_rules" {
  count = var.apply_enabled ? 1 : 0

  triggers = {
    apply_enabled    = tostring(var.apply_enabled)
    mqtt_port        = tostring(var.mqtt_port)
    mqtt_cidr_count  = length(var.mqtt_allowed_cidrs)
    ssh_allowed_cidr = var.ssh_allowed_cidr
  }

  provisioner "local-exec" {
    environment = {
      APPLY_ENABLED      = tostring(var.apply_enabled)
      SSH_ALLOWED_CIDR   = var.ssh_allowed_cidr
      MQTT_PORT          = tostring(var.mqtt_port)
      SSH_PLACEHOLDER_OK = "false"
    }

    command = <<-EOT
      set -euo pipefail
      if [ "$APPLY_ENABLED" != "true" ]; then
        echo "refusing to run: apply_enabled is not true" >&2
        exit 1
      fi
      case "$SSH_ALLOWED_CIDR" in
        REPLACE_WITH_*|"")
          echo "refusing to run: ssh_allowed_cidr must be the operator's admin range, not a placeholder or the whole internet" >&2
          exit 1
          ;;
      esac
      echo "PLAN ONLY -- no firewall rule was created."
      echo "intended ruleset:"
      echo "  allow tcp 80,443 from 0.0.0.0/0 (public HTTP)"
      echo "  allow tcp $MQTT_PORT from the operator-declared device ranges only"
      echo "  allow tcp 22 from $SSH_ALLOWED_CIDR only"
      echo "  deny everything else, including PostgreSQL, Redis, port 3000 and /metrics"
    EOT
  }
}

# Backups block volume. The size and mount point belong to the operator; the reason the
# resource exists is that an on-host backup set with this volume is the recovery plan.
resource "null_resource" "backup_block_volume" {
  count = var.apply_enabled ? 1 : 0

  triggers = {
    apply_enabled     = tostring(var.apply_enabled)
    volume_size_gb    = tostring(var.backup_volume_size_gb)
    volume_mount      = var.backup_volume_mount
    offhost_required  = "true"
  }

  provisioner "local-exec" {
    environment = {
      APPLY_ENABLED  = tostring(var.apply_enabled)
      VOLUME_SIZE_GB = tostring(var.backup_volume_size_gb)
      VOLUME_MOUNT   = var.backup_volume_mount
      HOST_NAME      = var.host_name
    }

    command = <<-EOT
      set -euo pipefail
      if [ "$APPLY_ENABLED" != "true" ]; then
        echo "refusing to run: apply_enabled is not true" >&2
        exit 1
      fi
      case "$HOST_NAME" in
        REPLACE_WITH_*)
          echo "refusing to run: host_name is still the repository placeholder" >&2
          exit 1
          ;;
      esac
      echo "PLAN ONLY -- no volume was created."
      echo "backup volume for $HOST_NAME: $$${VOLUME_SIZE_GB} GiB mounted at $VOLUME_MOUNT"
      echo "reminder: a second copy must leave this host; that is ops/scripts/backup-offhost.sh,"
      echo "and its remote lives in operator-owned rclone configuration outside this repository."
    EOT
  }
}

# DNS labels. Placeholders stay visible in the rendered plan: there is no DNS provider in
# this configuration, so the operator owns both the names and the records.
resource "null_resource" "dns_records" {
  count = var.apply_enabled ? 1 : 0

  triggers = {
    apply_enabled = tostring(var.apply_enabled)
    record_count  = length(var.dns_records)
  }

  provisioner "local-exec" {
    environment = {
      APPLY_ENABLED = tostring(var.apply_enabled)
      DNS_API       = var.dns_records["api"]
      DNS_BROKER    = var.dns_records["broker"]
    }

    command = <<-EOT
      set -euo pipefail
      if [ "$APPLY_ENABLED" != "true" ]; then
        echo "refusing to run: apply_enabled is not true" >&2
        exit 1
      fi
      for record in "$DNS_API" "$DNS_BROKER"; do
        case "$record" in
          REPLACE_WITH_*)
            echo "refusing to run: a DNS record is still the repository placeholder ($record)" >&2
            exit 1
            ;;
        esac
      done
      echo "PLAN ONLY -- no DNS record was created."
      echo "operator-created records: api -> $DNS_API, broker -> $DNS_BROKER"
    EOT
  }
}

# The only file this configuration writes, and only when the operator has enabled the
# guarded commands: a machine-readable summary of the intended environment with every
# operator-specific value intact but nothing that must not be committed. `count` is on the
# same flag as everything else, so a default apply writes no file either.
resource "local_file" "deployment_plan" {
  count = var.apply_enabled ? 1 : 0

  filename       = "${path.module}/rendered/deployment-plan.json"
  file_permission = "0644"
  content        = jsonencode(local.plan)
}
