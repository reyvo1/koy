# Variables for the IoT Platform production skeleton.
#
# Every value in this file is a PLACEHOLDER OWNED BY THE DEPLOYMENT OPERATOR.
# Nothing here is a discovered or verified fact about any environment: the skeleton starts
# with placeholders on purpose so that a misapplied plan can be recognised by its output
# rather than believed. Copy terraform.tfvars.example to terraform.tfvars (gitignored) and
# replace every REPLACE_WITH_* marker before any guarded provisioner will accept it.

# Placeholder decision owned by the deployment operator: whether the guarded commands in
# main.tf may run at all. MUST stay false in every committed and default plan. With it
# false, `terraform apply` creates no resources and runs no commands -- verified by
# `count = 0` on every resource in main.tf. Flip it to true only as a deliberate, reviewed
# step, and only with every placeholder below replaced by a real environment value.
variable "apply_enabled" {
  type        = bool
  default     = false
  description = "Operator-owned kill switch. When false (the default) every resource is empty and no command runs."
}

# Placeholder label owned by the deployment operator: the environment this plan describes.
# Recorded on the rendered plan and in triggers so a plan can be traced to an environment.
variable "environment" {
  type        = string
  default     = "production"
  description = "Operator-owned environment label. Placeholder until the operator confirms which environment this plan targets."

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production. Note that staging is not provisioned today; see infra/README.md."
  }
}

# Placeholder hostname owned by the deployment operator. The default is deliberately not a
# resolvable name and not example.com: a plan that reaches a provisioner with this value
# still set is refused. Never put a real hostname in this repository; put it in
# terraform.tfvars, which is gitignored.
variable "host_name" {
  type        = string
  default     = "REPLACE_WITH_OPERATOR_HOSTNAME"
  description = "Operator-owned hostname of the production host. Placeholder; replace in terraform.tfvars before any guarded run."

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.host_name)) || var.host_name == "REPLACE_WITH_OPERATOR_HOSTNAME"
    error_message = "host_name must be a plausible DNS name, or the repository placeholder."
  }
}

# Placeholder SSH public key owned by the deployment operator. Must never be a real key in
# this repository; the default is the repository's own placeholder marker.
variable "ssh_public_key" {
  type        = string
  default     = "REPLACE_WITH_OPERATOR_SSH_PUBLIC_KEY"
  description = "Operator-owned SSH public key installed on the host. Placeholder; the private key never belongs in a repository."
}

# Placeholder network boundary owned by the deployment operator: the only source addresses
# allowed to reach the SSH port. Empty and unknown values are refused rather than
# defaulting to the whole internet.
variable "ssh_allowed_cidr" {
  type        = string
  default     = "REPLACE_WITH_OPERATOR_CIDR"
  description = "Operator-owned admin CIDR permitted to reach SSH (for example a VPN range). Placeholder."
}

# Placeholder port number owned by the deployment operator for the MQTT broker surface.
# 18884 is the value the repository already uses for an isolated broker listener
# (docker-compose.rescue.yml); the operator confirms the production broker port.
variable "mqtt_port" {
  type        = number
  default     = 18884
  description = "Operator-owned MQTT listener port for the production broker. Placeholder pending broker configuration."

  validation {
    condition     = var.mqtt_port >= 1 && var.mqtt_port <= 65535
    error_message = "mqtt_port must be a valid TCP port."
  }
}

# Placeholder device-network boundaries owned by the deployment operator: the source ranges
# permitted to publish telemetry to the broker. All other sources are denied by the same
# rule set; an empty list would mean "no devices", so the placeholder is explicit.
variable "mqtt_allowed_cidrs" {
  type        = list(string)
  default     = ["REPLACE_WITH_OPERATOR_CIDR"]
  description = "Operator-owned device/telemetry CIDRs permitted to reach the broker. Placeholder."
}

# Placeholder ports owned by the deployment operator for the public HTTP surfaces. Only these
# two are public in the documented single-host topology (docs/deployment-recovery.md);
# PostgreSQL, Redis, port 3000 and /metrics stay private.
variable "public_http_ports" {
  type        = list(number)
  default     = [80, 443]
  description = "Operator-owned public HTTP ports. Placeholder; the topology documents 80 and 443 only."
}

# Placeholder capacity owned by the deployment operator for the backup block volume.
# Encrypted backups are the only data that must survive the loss of the whole host.
variable "backup_volume_size_gb" {
  type        = number
  default     = 50
  description = "Operator-owned size in GB of the block volume holding encrypted backups. Placeholder pending measured dump size."
}

# Placeholder mount point owned by the deployment operator for the backup volume. Matches the
# path the backup unit writes to; changing one without the other breaks the local backup.
variable "backup_volume_mount" {
  type        = string
  default     = "/var/backups/iot-platform"
  description = "Operator-owned mount point for the backup volume on the production host. Placeholder."
}

# Placeholder DNS records owned by the deployment operator. These are labels only: this
# skeleton contains no DNS provider and creates no records, so leaving the placeholders in
# place is visible in the rendered plan rather than silently deploying a wild guess.
variable "dns_records" {
  type = map(string)
  default = {
    api    = "REPLACE_WITH_OPERATOR_API_FQDN"
    broker = "REPLACE_WITH_OPERATOR_BROKER_FQDN"
  }
  description = "Operator-owned DNS names for the API and broker surfaces. Placeholder."
}
