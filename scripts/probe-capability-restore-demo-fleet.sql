-- Return the demo tenant's `temperature` capabilities to the seeded version after the manual
-- browser walkthrough.
--
-- The browser proof deliberately moved a real device from 1.0.0 to 2.0.0. That is the point of
-- the exercise, but the walkthrough is not a migration, so the fleet goes back.
--
-- `rollback: true` and a supersede: publishing refuses to move the fleet to a lower version
-- unless the rollback is asked for by name. Without it, restoring this data would be impossible
-- through the product's own API -- which is exactly the gap that made an earlier probe run leave
-- a device stranded on 9.9.9.
\set ON_ERROR_STOP on

SELECT id AS template_id
  FROM capability_templates
 WHERE key = 'temperature'
 LIMIT 1 \gset tmpl_

\if :{?tmpl_template_id}
UPDATE capability_template_versions
   SET status = 'DEPRECATED', "deprecatedAt" = now()
 WHERE "templateId" = :'tmpl_template_id' AND status = 'PUBLISHED';

INSERT INTO capability_template_versions
       (id, "templateId", version, status, "publishedAt", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), :'tmpl_template_id', '1.0.0', 'PUBLISHED', now(), now(), now())
ON CONFLICT ("templateId", version) DO UPDATE
   SET status = 'PUBLISHED', "deprecatedAt" = NULL, "publishedAt" = now();
\endif

-- The demo tenant's Lobby Sensor has no dashboard binding or automation on this capability, so
-- the apply is not expected to refuse it. The count is printed either way.
SELECT count(*) AS still_behind
  FROM capabilities c
  JOIN devices d ON d.id = c."deviceId"
 WHERE c.key = 'temperature'
   AND d."tenantId" = '22222222-2222-4222-8222-222222222222'
   AND c."schemaVersion" <> '1.0.0';

SELECT d.name AS device, c."schemaVersion"
  FROM capabilities c
  JOIN devices d ON d.id = c."deviceId"
 WHERE c.key = 'temperature'
   AND d."tenantId" = '22222222-2222-4222-8222-222222222222';