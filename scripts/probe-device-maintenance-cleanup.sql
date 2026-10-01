-- Sweep the technician-maintenance probe's own windows.
--
-- Scoped by the marker in the reason text, which is the one string this probe writes and a technician
-- never would. A device-scoped delete would be wrong: it would reach a window a real technician
-- opened on the same device.
--
-- The order is child-then-parent: the row references `users`, and the reason text is the only handle
-- that identifies it. The assertion raises rather than reporting its own DELETE count, because a
-- sweep that trusts its own count is the inverted form of the residue it exists to catch.

DELETE FROM device_maintenance
 WHERE reason LIKE 'wave7-maint-probe%';

DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover
    FROM device_maintenance
   WHERE reason LIKE 'wave7-maint-probe%';

  IF leftover > 0 THEN
    RAISE EXCEPTION 'technician maintenance probe residue: % window(s) survived the sweep', leftover;
  END IF;
END $$;