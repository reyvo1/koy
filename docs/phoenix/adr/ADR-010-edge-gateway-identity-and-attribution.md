# ADR-010 — Edge Gateway Identity and Attribution

Status: **ACCEPTED**
Date: 2026-10-02

## Context

Wave 12 calls for an edge gateway. A census of this platform found two facts that decide what that can honestly mean today:

1. **`telemetry` records which device a reading came from, but not who delivered it.** A device reporting its own measurement and a gateway forwarding on its behalf produce identical rows. So an operator investigating a suspicious number cannot tell whether the sensor or the relay produced it, and there is nothing to audit afterwards.
2. **`device_credentials` is `@unique deviceId`.** There is no identity a gateway could hold — one credential per device, and a gateway is not a device. "Edge gateway" as it stands could only be a string inside a payload, which is not a gateway.

Adding a `gatewayId` string to telemetry would fix neither. It would make the gap harder to see, because the column would look like the feature.

There is also no bridge, no relay, no buffering on this platform, and no physical gateway anywhere in the environment.

## Decision

Make the gateway an **identity**, and make attribution a **fact recorded on every reading**.

- `EdgeGateway` is tenant-owned, with a stable `gatewayCode` unique within the tenant, a display name, and a
  region reference. `gatewayStatus` defaults to `UNKNOWN`, not `ONLINE`: a gateway that has never reported has
  no evidence of being up, and `lastSeenAt` stays null until one actually does.
- `EdgeGatewayCredential` gives the gateway its own password hash, separately revocable. Revoking a gateway
  must not mean re-provisioning every device behind it, which is exactly what one-credential-per-device
  would force.
- `EdgeGatewayDevice` is an **explicit allowlist** of the devices a gateway may speak for, unique per
  (gateway, device). Not "everything in the region": an allowlist that silently widens whenever a device is
  commissioned is not an allowlist, and region membership changes for reasons that have nothing to do with
  whether a relay should be trusted to speak for a new device.
- `telemetry.deliveredByGatewayId` records who delivered the reading, as a real relation, **nullable with no
  default**. Null means the device reported for itself, which is true of every existing row. Backfilling it
  would invent a delivery path nobody observed.
- Delivering a reading for a device is refused unless that exact (gateway, device) pair is registered. The
  check is tenant-scoped, so a gateway cannot speak for another tenant's device.
- `ON DELETE SET NULL` from `telemetry` to the gateway: a reading outlives the relay that carried it.
  Decommissioning a relay must not destroy the history an investigation needs.

## Safety Boundaries

- **No bridge is claimed.** No MQTT bridge, relay buffering, store-and-forward, or offline queue ships in
  this slice. None of it has been observed in any environment, and a bridge nobody has watched move a
  message is precisely the simulated evidence this project refuses to accept. The gateway's identity,
  credential, allowlist and attribution are real and tested against PostgreSQL; the relay that would use
  them is not, and this ADR does not authorise claiming it is.
- **No gateway is invented at runtime.** There is no code path that creates a gateway because a caller asked
  for one. Registration is an explicit operator action.
- **No self-declared delivery.** A gateway cannot claim to have delivered a reading for a device that is not
  on its allowlist, and cannot claim a device in another tenant.
- **No retroactive attribution.** Existing telemetry keeps a null delivering gateway. That is the honest
  value: nobody observed how those readings arrived.
- **Not in this slice.** The digital-twin foundation and AI-assisted cross-region operations remain separate
  decisions. This ADR does not pre-authorise them, and the Wave 12 exit criteria are not met by this slice
  alone.