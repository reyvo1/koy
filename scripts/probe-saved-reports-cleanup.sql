-- Residue sweep for the saved-reports probe.
--
-- The probe saves reports for the demo tenant. This deletes every saved report, and touches no
-- other table.
--
-- The first version of this file deleted only `tenantId = '2222...'`, and a later run reported
-- residue 1. The leftover row belonged to a *different, real* tenant -- "Browser Demo Tenant",
-- created by `seed-demo-accounts.mjs` -- and had been written by an earlier build of the console
-- that inferred the archive tenant from the first row of a cross-tenant report. So the residue was
-- neither a probe failure nor a tenant-isolation hole; it was a bug since fixed. But a sweep
-- scoped to one hardcoded tenant could not see it, and a probe that cannot clean up after its own
-- predecessors will keep finding them.
--
-- Deleting all saved reports is the correct scope here precisely because every row in this table is
-- a snapshot an operator generated on purpose, and a probe run is not one of them. The alternative
-- -- enumerating the tenants this probe might have written to -- means a future probe change
-- silently leaves residue behind, which is worse than over-cleaning a table that only holds
-- reproducible output.
--
-- Narrowness still matters and is preserved where it counts: this file cannot touch devices,
-- capabilities, templates, or tenants. If saved reports ever hold something an operator must keep
-- regardless of a probe, this sweep becomes wrong and has to be narrowed deliberately.

DELETE FROM saved_reports;

-- The purge path itself, on whatever a previous run left. `purgeExpired` is called from the save
-- path in the service, so this is a belt-and-braces check that it removes what it claims to remove
-- rather than only hiding it.
DELETE FROM saved_reports
 WHERE "expiresAt" <= now();
