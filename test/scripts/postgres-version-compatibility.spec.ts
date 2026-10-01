import {
  assertCompatibleVersions,
  parseClientMajor,
  parseServerMajor,
} from './postgres-version-compatibility';

/**
 * The recovery drill failed with `pg_restore failed with exit code 1` and an
 * `unrecognized configuration parameter "transaction_timeout"` underneath it. The real cause was
 * a pg_dump 18 client against a PostgreSQL 16 server, and the drill had no version precheck at
 * all, so nothing connected the exit code to the mismatch.
 *
 * These cases pin the diagnosis: the message has to name both versions, say which direction the
 * mismatch runs, and point at the fix. A check that only throws would satisfy the first version
 * of this and still leave an operator guessing.
 */
describe('PostgreSQL client/server version compatibility', () => {
  describe('parseClientMajor', () => {
    it.each([
      ['pg_dump (PostgreSQL) 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)', 18],
      ['pg_dump (PostgreSQL) 16.15 (Debian 16.15-1)', 16],
      ['psql (PostgreSQL) 14.12 (Ubuntu 14.12-0ubuntu0.22.04.1)', 14],
    ])('reads the major version out of %s', (output, expected) => {
      expect(parseClientMajor(output)).toBe(expected);
    });

    it('refuses to guess when the output has no version', () => {
      expect(() => parseClientMajor('command not found')).toThrow(
        /could not read a PostgreSQL version/,
      );
    });
  });

  describe('parseServerMajor', () => {
    it('reads the major version out of a SHOW server_version result', () => {
      expect(parseServerMajor('16.15')).toBe(16);
    });

    it('refuses to guess on an empty result', () => {
      expect(() => parseServerMajor('')).toThrow(/could not read a PostgreSQL version/);
    });
  });

  describe('assertCompatibleVersions', () => {
    it('accepts matching majors', () => {
      expect(() =>
        assertCompatibleVersions({ clientMajor: 16, serverMajor: 16 }),
      ).not.toThrow();
    });

    it('rejects a client newer than the server, and says so', () => {
      // The exact configuration this repository hit: pg_dump 18.6, server 16.15.
      expect(() =>
        assertCompatibleVersions({ clientMajor: 18, serverMajor: 16 }),
      ).toThrow(/18[\s\S]*16/);
    });

    it('explains that a newer client is the cause, not the dump', () => {
      let message = '';
      try {
        assertCompatibleVersions({ clientMajor: 18, serverMajor: 16 });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/newer than the server/);
      expect(message).toMatch(/unrecognized configuration parameter/);
      expect(message).toMatch(/PG_BIN_DIR/);
    });

    it('rejects a client older than the server in the other direction', () => {
      expect(() =>
        assertCompatibleVersions({ clientMajor: 14, serverMajor: 16 }),
      ).toThrow(/older than the server/);
    });
  });
});
