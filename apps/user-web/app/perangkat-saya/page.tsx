import { RoomWorkspaceExperience } from '../../components/room-workspace-experience';
import { UserShell } from '../../components/user-shell';

export const dynamic = 'force-dynamic';

export default function MyDevicesPage() {
  return (
    <UserShell title="Perangkat Saya" subtitle="Perangkat dengan izin VIEW atau CONTROL aktif">
      <RoomWorkspaceExperience mode="devices" />
    </UserShell>
  );
}
