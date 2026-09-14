import { SuperAdminShell } from '@/components/super-admin-shell';
import SuperFirmwareContent from '@/components/super-firmware-content';

export const dynamic = 'force-dynamic';

/** Firmware & OTA (blueprint §1) — live Modul 15 data. */
export default function SuperFirmwarePage() {
  return (
    <SuperAdminShell
      title="Firmware & OTA"
      subtitle="Artefak firmware, verifikasi SHA-256, rollout bertahap"
      active="/super/firmware"
    >
      <SuperFirmwareContent />
    </SuperAdminShell>
  );
}
