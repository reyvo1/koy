-- Confirms whether the `%probe%` device count is residue or real demo data.
--
-- The residue check used `name LIKE '%probe%'`, which is wider than the prefix the probes actually
-- create (`capability-probe%`, `ui-proof-%`, `probe-%`). A substring match also catches a
-- legitimately-named device that merely contains the word, so "8 probe devices" is a question
-- about the query rather than about the database.
--
-- Output: name + tenant, one per row.

SELECT d.name || ' | ' || t.name
  FROM devices d
  JOIN tenants t ON t.id = d."tenantId"
 WHERE d.name ILIKE '%probe%'
 ORDER BY d.name;
