-- Sweep everything this probe can leave behind.
--
-- Two kinds of residue, and both need handling:
--
--  1. Position rows, matched on the probe's own label text. A device-scoped delete would be wrong:
--     it would take the real history of whatever device the probe happened to select.
--
--  2. The device itself, when the probe had to register one because the tenant had none. A fresh CI
--     database always takes that path, so the device is created on every clean run and would
--     otherwise accumulate. Matched on the probe's own name marker.
--
-- Order matters. `capabilities` and `device_credentials` reference the device, and a FK violation
-- part-way through leaves the device behind -- which then changes which branch the *next* run takes,
-- so the probe would silently stop exercising the path it was written to cover.

DELETE FROM device_locations
 WHERE label IN ('probe-a', 'probe-b')
    OR "deviceId" IN (SELECT id FROM devices WHERE name LIKE 'wave9-loc-probe%');

DELETE FROM capabilities
 WHERE "deviceId" IN (SELECT id FROM devices WHERE name LIKE 'wave9-loc-probe%');

DELETE FROM device_credentials
 WHERE "deviceId" IN (SELECT id FROM devices WHERE name LIKE 'wave9-loc-probe%');

DELETE FROM devices WHERE name LIKE 'wave9-loc-probe%';

DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover
    FROM device_locations
   WHERE label IN ('probe-a', 'probe-b');
  IF leftover > 0 THEN
    RAISE EXCEPTION 'location probe residue: % position row(s) survived the sweep', leftover;
  END IF;

  SELECT count(*) INTO leftover
    FROM devices
   WHERE name LIKE 'wave9-loc-probe%';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'location probe residue: % device(s) survived the sweep', leftover;
  END IF;
END $$;
