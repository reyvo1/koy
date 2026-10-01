-- Sweep the NOC probe's residue, before and after the run.
--
-- Scoped by the `noc-probe` marker in the name and summary, so no statement here can match a row
-- the probe did not create. `noc_acknowledgements` is swept by its findings' names rather than
-- wholesale: the table is a real duty log and wiping it would destroy the one record the feature
-- exists to keep. The cascade from `analytics_findings` removes the acknowledgements that belong
-- to these findings anyway, and the device is removed last because the findings name it.
--
-- The device deletion is scoped to the demo tenant *and* the marker, because `deviceId` on a
-- finding is a plain column rather than a foreign key, so deleting by name alone could in
-- principle catch a device a real operator created with the word in it. Nothing in the seeded
-- tenant does.

DELETE FROM analytics_findings
 WHERE summary LIKE 'noc-probe:%';

DELETE FROM devices
 WHERE name LIKE 'noc-probe-device-%'
   AND "tenantId" = '22222222-2222-4222-8222-222222222222';

-- Assert, do not assume: a sweep that reports its own DELETE count as a clean run is the inverted
-- form of the bug it exists to catch. This raises when anything survives.
DO $$
DECLARE leftover_findings bigint;
DECLARE leftover_acks bigint;
DECLARE leftover_devices bigint;
BEGIN
  SELECT count(*) INTO leftover_findings FROM analytics_findings WHERE summary LIKE 'noc-probe:%';
  SELECT count(*) INTO leftover_acks
    FROM noc_acknowledgements a
    JOIN analytics_findings f ON f.id = a."findingId"
   WHERE f.summary LIKE 'noc-probe:%';
  SELECT count(*) INTO leftover_devices
    FROM devices
   WHERE name LIKE 'noc-probe-device-%'
     AND "tenantId" = '22222222-2222-4222-8222-222222222222';

  IF leftover_findings > 0 OR leftover_acks > 0 OR leftover_devices > 0 THEN
    RAISE EXCEPTION 'noc probe residue: findings=%, acks=%, devices=%',
      leftover_findings, leftover_acks, leftover_devices;
  END IF;
END $$;