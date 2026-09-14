import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperCommandMonitorContent from '@/components/super-command-monitor-content';

export const dynamic = 'force-dynamic';

export default function SuperCommandsPage() {
  return (
    <SuperAdminShell title="Command Monitor" subtitle="Queue · ACK · terminal history lintas tenant · read-only" active="/super/commands">
      <SuperPage><SuperCommandMonitorContent /></SuperPage>
    </SuperAdminShell>
  );
}
