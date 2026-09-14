import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperMqttContent from '@/components/super-mqtt-content';

export const dynamic = 'force-dynamic';

/** MQTT Center (blueprint §1) — brokers/sessions/topics/ACL. */
export default function SuperMqttPage() {
  return (
    <SuperAdminShell
      title="MQTT Center"
      subtitle="Brokers · Sessions · Topics · ACL"
      active="/super/mqtt"
    >
      <SuperPage>
        <SuperMqttContent />
      </SuperPage>
    </SuperAdminShell>
  );
}
