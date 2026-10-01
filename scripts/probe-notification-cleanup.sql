-- Sweep the Wave 7 mobile-notification probe's residue.
--
-- Scoped by the `wave7-notif-` marker on the registered address, so no statement here can match a
-- row a real operator's account produced. The order follows the foreign keys: notifications
-- reference their tenant only, but the probe also created *users* through `POST /auth/register`,
-- and a user carries a verification token, so the users go last.
--
-- The address lives in the `users` table and in `notifications.destination`, so the users are
-- matched first by their own email and their notifications are removed by destination. Matching
-- notifications by the template key instead would catch a real operator's reset, so it is not done.

DELETE FROM notifications
 WHERE "destination" LIKE 'wave7-notif-%@example.invalid';

-- `pg_constraint` names the three tables that reference `users`, and each reference is named by a
-- column read from `information_schema` rather than assumed: `devices` references `users` through
-- `ownerId`, not through any column containing the word "user", so a guessed name fails to compile
-- and an absent statement silently leaves the child behind.
DELETE FROM user_credentials
 WHERE "userId" IN (SELECT id FROM users WHERE email LIKE 'wave7-notif-%@example.invalid');

DELETE FROM memberships
 WHERE "userId" IN (SELECT id FROM users WHERE email LIKE 'wave7-notif-%@example.invalid');

DELETE FROM devices
 WHERE "ownerId" IN (SELECT id FROM users WHERE email LIKE 'wave7-notif-%@example.invalid');

DELETE FROM users
 WHERE email LIKE 'wave7-notif-%@example.invalid';

-- Assert, do not assume: a sweep that reports its own DELETE count as clean is the inverted form
-- of the bug it exists to catch. This raises when anything survives.
DO $$
DECLARE leftover_notifications bigint;
DECLARE leftover_users bigint;
DECLARE leftover_credentials bigint;
BEGIN
  SELECT count(*) INTO leftover_notifications
    FROM notifications
   WHERE "destination" LIKE 'wave7-notif-%@example.invalid';

  SELECT count(*) INTO leftover_users
    FROM users
   WHERE email LIKE 'wave7-notif-%@example.invalid';

  SELECT count(*) INTO leftover_credentials
    FROM user_credentials c
    JOIN users u ON u.id = c."userId"
   WHERE u.email LIKE 'wave7-notif-%@example.invalid';

  IF leftover_notifications > 0 OR leftover_users > 0 OR leftover_credentials > 0 THEN
    RAISE EXCEPTION
      'wave7 notification probe residue: notifications=%, users=%, credentials=%',
      leftover_notifications, leftover_users, leftover_credentials;
  END IF;
END $$;