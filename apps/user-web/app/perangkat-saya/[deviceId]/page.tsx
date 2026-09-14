import { DeviceDetailExperience } from '../../../components/device-detail-experience';
import { UserShell } from '../../../components/user-shell';

export const dynamic = 'force-dynamic';

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  return (
    <UserShell title="Detail Perangkat" subtitle="Capability, telemetry, kontrol, dan riwayat terotorisasi">
      <DeviceDetailExperience deviceId={deviceId} />
    </UserShell>
  );
}
