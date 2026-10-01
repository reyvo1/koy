/**
 * Command status vocabulary shared by the mobile client.
 *
 * Mirrored from the Prisma `CommandStatus` enum and pinned against it by
 * `scripts/validate-rescue-baseline.mjs`.
 *
 * The terminal set is derived rather than written out, and the direction of that derivation
 * is deliberate: a command the user just submitted is polled until it settles, so an
 * explicit terminal list would classify any status added to the enum later as still-in-flight
 * and the poll would never return. Deriving classifies a new status as terminal, so the worst
 * case is a command that reports settled immediately instead of one that spins forever.
 */

export const COMMAND_STATUSES = [
  'PENDING',
  'SENT',
  'ACKNOWLEDGED',
  'FAILED',
  'TIMED_OUT',
] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];

export const IN_FLIGHT_COMMAND_STATUSES = ['PENDING', 'SENT'] as const;

export const TERMINAL_COMMAND_STATUSES: ReadonlySet<string> = new Set(
  COMMAND_STATUSES.filter(
    (status) =>
      !(IN_FLIGHT_COMMAND_STATUSES as readonly string[]).includes(status),
  ),
);
