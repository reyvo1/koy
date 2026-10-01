-- Residue sweep for the capability template lifecycle probe.
--
-- Run before the probe, by `scripts/run-capability-template-probe.sh`. It exists because a probe
-- that cannot restore what it changed cannot be run twice in a row, and an earlier version of
-- this one could not restore: publishing refused to move the fleet to a lower version, and
-- re-creating a version that already existed raised a Prisma unique violation. A real device was
-- left on the probe's 9.9.9 until both were fixed.
--
-- Every statement is matched by a name this probe chose. Nothing here can touch a row the probe
-- did not create. `key = 'temperature'` is the one exception worth stating plainly: the probe
-- publishes a template against that key in order to exercise the bound-capability refusal, and
-- the template rows it creates are removed -- but the *capability* rows themselves, and any
-- dashboard or automation referencing them, are left alone.

-- Probe device's own references, innermost first.
delete from dashboard_widget_bindings where "deviceId" in (select id from devices where name = 'capability-probe-device');
delete from automation_actions where "deviceId" in (select id from devices where name = 'capability-probe-device');
delete from automations where "triggerDeviceId" in (select id from devices where name = 'capability-probe-device');
delete from dashboard_widget_bindings where "widgetId" in (
  select id from dashboard_widgets where "tenantId" = '22222222-2222-4222-8222-222222222222' and title = 'probe card'
);
delete from dashboard_widgets where "tenantId" = '22222222-2222-4222-8222-222222222222' and title = 'probe card';
delete from dashboards where "tenantId" = '22222222-2222-4222-8222-222222222222' and name like 'capability-probe-%';
delete from capabilities where "deviceId" in (select id from devices where name = 'capability-probe-device');
delete from devices where name = 'capability-probe-device';

-- Templates the probe created: its own synthetic keys, plus the one it created against
-- `temperature` in order to exercise the refusal path.
delete from capability_template_versions where "templateId" in (
  select id from capability_templates
   where key like 'probe.capability.%' or key = 'temperature'
);
delete from capability_templates where key like 'probe.capability.%' or key = 'temperature';

-- Leftovers from the partial-unique-index check (`idx.test`), which seeded its own template.
delete from capability_template_versions where "templateId" in (
  select id from capability_templates where key = 'idx.test'
);
delete from capability_templates where key = 'idx.test';
