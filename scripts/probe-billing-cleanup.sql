-- Sweep this probe's own invoices and metering rows.
--
-- Scoped by the marker in the billing reference, which is the only string this probe generates.
-- A tenant-scoped delete would take the tenant's real invoices with it, which is the reason this
-- sweep is marker-matched rather than simply "clear the tenant's billing".
--
-- The assertion raises instead of trusting its own DELETE count: a sweep that believes it worked is
-- the inverted form of the residue it exists to catch.

-- The billing cycle derives its own reference as `bill-<tenant>-<YYYY-MM-DD>`, so a probe cannot
-- inject a marker into it -- and should not: a caller-chosen reference is a caller-chosen collision.
-- The probe therefore bills a period no real billing run would ever reach (2099-01-01), which makes
-- its invoices identifiable by date without the production naming carrying a probe's fingerprint.
DELETE FROM invoices WHERE "providerOrderId" LIKE 'bill-%-2099-01-01';

DELETE FROM metering_records
 WHERE id IN (
   SELECT m.id FROM metering_records m
     JOIN devices d ON d.id = m."deviceId"
    WHERE d.name LIKE 'wave8-billing-probe%'
 );

DO $$
DECLARE leftover bigint;
BEGIN
  SELECT count(*) INTO leftover FROM invoices WHERE "providerOrderId" LIKE '%2099-01-01';
  IF leftover > 0 THEN
    RAISE EXCEPTION 'billing probe residue: % invoice(s) survived the sweep', leftover;
  END IF;
END $$;
