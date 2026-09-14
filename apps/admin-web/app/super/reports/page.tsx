import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperReportsContent from '@/components/super-reports-content';

export const dynamic = 'force-dynamic';

export default function SuperReportsPage() {
  return (
    <SuperAdminShell title="Reports" subtitle="Laporan operasional lintas tenant + CSV" active="/super/reports">
      <SuperPage><SuperReportsContent /></SuperPage>
    </SuperAdminShell>
  );
}
