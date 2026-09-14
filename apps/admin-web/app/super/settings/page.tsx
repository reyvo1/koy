import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperSettingsContent from '@/components/super-settings-content';

export const dynamic = 'force-dynamic';

/** Settings — profil nyata (GET/POST /users/profile) + keamanan sesi. */
export default function SuperSettingsPage() {
  return (
    <SuperAdminShell
      title="Settings"
      subtitle="Profil administrator dan keamanan sesi"
      active="/super/settings"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <SuperPage>
          <SuperSettingsContent />
        </SuperPage>

        <SuperPage>
          <h3 className="m-0 mb-4 text-[15px] font-bold text-white">
            Keamanan Sesi
          </h3>
          <ul className="space-y-2.5 text-[13px] text-slate-300">
            <li>Token disimpan sebagai cookie HttpOnly — tidak bisa dibaca JavaScript.</li>
            <li>Sesi kedaluwarsa otomatis; refresh via endpoint resmi.</li>
            <li>Semua aksi tulis tercatat di audit log immutable.</li>
            <li>Tidak ada kredensial perangkat/broker di browser.</li>
          </ul>
        </SuperPage>
      </div>
    </SuperAdminShell>
  );
}
