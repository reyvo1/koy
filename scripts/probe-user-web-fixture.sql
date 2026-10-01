-- Locates the identifiers a device-share grant needs for the User Web screenshot fixture.
--
-- Read-only; the grant itself is created through `POST /devices/:id/shares` so it lands in
-- `share_audit_log` the way a real operator action does. A row inserted straight into the table
-- would look identical in the console and be undiagnosable later.
--
-- Scoped to the tenant the demo *user* belongs to, which is why an earlier version of this query
-- joined on `m.tenantId = d.tenantId` from the wrong side: `Lobby Sensor` exists in more than one
-- tenant, and the demo user is not in the one that owns `33333333-...`. The 404 from the API
-- (`SHARE_DEVICE_NOT_FOUND`) is what caught it -- the query had returned a row that looked fine.
--
-- Output: one line, `membershipId|deviceId|deviceName`.

SELECT m.id || '|' || d.id || '|' || d.name
  FROM users u
  JOIN memberships m ON m."userId" = u.id
  JOIN devices d ON d."tenantId" = m."tenantId"
 WHERE u.email = 'demo.user@iot.local'
   AND d."tenantId" = '22222222-2222-4222-8222-222222222222'
   AND d.name IN ('Lobby Sensor', 'Lobby Light Panel')
 ORDER BY d.name
 LIMIT 1;
