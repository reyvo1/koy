import { SuperAdminShell } from '@/components/super-admin-shell';
import NocContent from '@/components/noc-content';

export const dynamic = 'force-dynamic';

/** NOC / Control Room (blueprint §4) — live global tiles + stream. */
export default function NocPage() {
  return (
    <SuperAdminShell
      title="NOC / Control Room"
      subtitle="Global operations monitoring"
      active="/noc"
    >
      <NocContent />
    </SuperAdminShell>
  );
}
