-- Remove only the camera this probe registered.
--
-- Matched on the name marker. Deleting by tenant would be wrong: it would take cameras a real
-- operator registered in the same tenant.
--
-- Order matters. `device_credentials`, `capabilities` and any provisioning token all hang off the
-- device, and a FK error part-way through would leave the device behind and make the next run's
-- precondition silently false.
--
-- Table names read from information_schema rather than recalled. An earlier version of this file
-- guessed `device_credential` and Postgres rejected it before the first DELETE ran -- the same class
-- of mistake as assuming uuid column types.

DELETE FROM device_credentials WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM capabilities WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM device_commands WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM telemetry WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM device_locations WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM metering_records WHERE "deviceId" IN (
  SELECT id FROM devices WHERE name LIKE 'wave9-camera-probe%'
);
DELETE FROM devices WHERE name LIKE 'wave9-camera-probe%';

DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover FROM devices WHERE name LIKE 'wave9-camera-probe%';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'camera probe residue: % device(s) survived the sweep', leftover;
  END IF;
END $$;
