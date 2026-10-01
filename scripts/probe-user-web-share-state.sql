-- Reports the state of the two device-share grants created for the User Web screenshots.
--
-- Read-only. This exists because `DELETE /devices/:id/shares/:grantId` answered
-- `SHARE_GRANT_NOT_ACTIVE` for grants that had been created moments earlier, and the reason was
-- not visible from the API response alone: a revoked grant and an expired grant are the same
-- error, and neither says which. So the column values are read directly.
--
-- Output: one line per grant.

SELECT id || ' | status=' || status
       || ' | expired=' || ("expiresAt" < now())::text
       || ' | revoked=' || ("revokedAt" IS NOT NULL)::text
  FROM device_share_grants
 ORDER BY "createdAt";
