import { SuperAdminShell, SuperPage } from '@/components/super-admin-shell';
import SuperCapabilitiesContent from '@/components/super-capabilities-content';
import SuperCapabilityVersionsPanel from '@/components/super-capability-versions-panel';

export const dynamic = 'force-dynamic';

/** Capability Registry — definisi, flag akses, dan drift versi (blueprint §1). */
export default function SuperCapabilitiesPage() {
  return (
    <SuperAdminShell
      title="Capability Registry"
      subtitle="Definisi, flag akses & versi schema per perangkat"
      active="/super/capabilities"
    >
      <SuperPage>
        <SuperCapabilitiesContent />
        <div className="mt-10 border-t border-slate-800 pt-8">
          <h2 className="m-0 text-[18px] font-bold text-white">Versioning</h2>
          <p className="mb-5 mt-1 text-[12.5px] text-slate-400">
            Versi schema yang benar-benar terpasang pada setiap perangkat, dan key yang
            berbeda versi antar perangkat.
          </p>
          <SuperCapabilityVersionsPanel />
        </div>
      </SuperPage>
    </SuperAdminShell>
  );
}
