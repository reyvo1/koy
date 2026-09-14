import { RoomWorkspaceExperience } from '../../components/room-workspace-experience';
import { UserShell } from '../../components/user-shell';

export const dynamic = 'force-dynamic';

export default function UserHomePage() {
  return (
    <UserShell title="Beranda" subtitle="Ruangan dan perangkat yang dapat Anda akses">
      <RoomWorkspaceExperience mode="home" />
    </UserShell>
  );
}
