# UI BLUEPRINT — IoT Platform Enterprise (SUMBER: C:\Users\IVO\Documents\iot.txt)

Status: MENGIKAT. Semua layar wajib mengikuti domain & arsitektur inti.
Target kelas: ThingsBoard Enterprise / EMQX / Azure IoT Central.
ATURAN REY: kerjakan SEMUA dulu, simulasi belakangan, revisi belakangan.

## 1. Super Admin Platform
- Dashboard
- Tenant Management: Tenants, Subscriptions, Quotas, Billing
- User Management: Users, Roles, Permissions, API Keys
- Device Management: Devices, Device Groups, Provisioning, Credentials, Firmware, OTA Updates
- Capability Registry: Templates, Definitions, Versioning
- Telemetry Center: Live Data, Historical Data, Explorer, Export
- Command Center: Send Command, Queue, ACK Monitor, History
- MQTT Center: Brokers, Sessions, Topics, ACL
- Monitoring: PostgreSQL, Redis, MQTT, Workers, API Health
- Security Center, Audit Logs, Alerts, Reports, Settings

## 2. Tenant Admin Dashboard
Dashboard | Devices | Device Groups | Rooms | Buildings | Locations
Realtime Monitoring | Telemetry Charts | Historical Data
Commands | Automation | Schedules | Scenes
Notifications | Alerts
Reports | Export Data
User Management

## 3. Device Detail Screen
Info (ID/Firmware/Protocol/Last Seen) + Capabilities (Temperature/Humidity/
Voltage/Current/Power/Relay/Camera/GPS) + Realtime Charts + Commands
(Turn On/Off/Restart/Update Firmware) + Command History + Alert History

## 4. NOC / Control Room
Global dashboard (online/offline/telemetry per sec/MQTT conn/Redis/PG/Workers/
alerts) + World Map + Live Telemetry Stream + Command Queue + System Logs

## 5. Mobile App
Bottom nav: Home, Devices, Realtime, Alerts, Profile
Home = devices online/offline, recent alerts, quick commands, recent telemetry,
system health. Device detail = status, realtime data, charts, commands,
history, settings.

## 6. Future AI Dashboard
AI Center: Anomaly Detection, Failure Prediction, Device Health Score,
Predictive Maintenance, Energy Optimization, AI Assistant

## Mapping ke fondasi backend yang SUDAH ADA
- Tenant/Billing -> Modul 19 (org) + Modul 27 (billing tables)
- Users/Roles/API Keys -> Modul 20 RBAC + Modul 21 API keys
- Devices/Capabilities/Provisioning -> core device module
- Firmware/OTA -> Modul 15
- Telemetry Center -> Module 09 (latest/history/aggregate)
- Commands -> command service + Modul 11 dispatcher
- MQTT Center -> mqtt module + metrics
- Monitoring -> health/metrics modules
- Security/Audit -> Modul 20 rbac_audit_log + share_audit_log
- Rooms -> Modul 17 space hierarchy
- Scenes/Schedules -> Modul 12/13
- Notifications/Alerts -> Modul 14/16
- AI Center -> Modul 16 analytics findings
