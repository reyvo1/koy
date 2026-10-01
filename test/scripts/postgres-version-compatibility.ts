/**
 * PostgreSQL client/server major-version compatibility, as a pure function.
 *
 * The recovery drill failed here with `pg_restore failed with exit code 1` and one line below
 * it, `unrecognized configuration parameter "transaction_timeout"`. That GUC was added in
 * PostgreSQL 17, so the message is really "your pg_dump is newer than your server", and
 * nothing in the drill said so. An operator restoring onto a provisioned VPS would read the
 * output, see an exit code, and have no way to guess that the fix is the client version rather
 * than the dump, the restore flags, or the database.
 *
 * The rule is PostgreSQL's own: `pg_dump` may be newer than the server (dumps are
 * forward-compatible), but a dump taken by a newer client can contain settings the older server
 * has never heard of, so the client and server majors must match for a restore to succeed.
 * Checking it up front turns an opaque exit code into a sentence that names both versions and
 * the fix.
 */

export interface PostgresVersions {
  clientMajor: number;
  serverMajor: number;
}

/** Parse the major version out of `pg_dump (PostgreSQL) 18.6 (Ubuntu ...)`. */
export function parseClientMajor(versionOutput: string): number {
  const match = /(\d+)(?:\.\d+)?/.exec(versionOutput);
  if (!match) {
    throw new Error(
      `could not read a PostgreSQL version from ${JSON.stringify(versionOutput.slice(0, 80))}`,
    );
  }
  return Number(match[1]);
}

/** Parse the major version out of a `SHOW server_version` result, e.g. `16.15`. */
export function parseServerMajor(serverVersion: string): number {
  return parseClientMajor(serverVersion);
}

export function assertCompatibleVersions({
  clientMajor,
  serverMajor,
}: PostgresVersions): void {
  if (clientMajor === serverMajor) return;

  const direction = clientMajor > serverMajor ? 'newer than' : 'older than';
  throw new Error(
    `PostgreSQL client/server major version mismatch: the pg_dump on this machine is ` +
      `${clientMajor}, which is ${direction} the server at ${serverMajor}. A dump written by ` +
      `a ${clientMajor} client can contain settings the ${serverMajor} server does not ` +
      `recognise, so pg_restore fails with "unrecognized configuration parameter" instead of ` +
      `restoring anything. Install the ${serverMajor} client tools and point PG_BIN_DIR at ` +
      `them, or run the drill against a ${clientMajor} server. ` +
      `(PostgreSQL supports a newer pg_dump against an older server for backup, but not for ` +
      `restore.)`,
  );
}
