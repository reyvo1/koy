import { TenantShell } from '@/components/tenant-shell';
import TenantCommandsContent from '@/components/tenant-commands-content';

export const dynamic = 'force-dynamic';

/** Command Center (blueprint §2) — kirim perintah & monitor ACK. ui(v2). */
export default function Page() {
  return (
    <TenantShell
      title="Perintah"
      subtitle="Kirim perintah ke perangkat & pantau ACK"
      active="/tenant/perintah"
    >
      <TenantCommandsContent />
    </TenantShell>
  );
}
