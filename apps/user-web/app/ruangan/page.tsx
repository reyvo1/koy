import { RoomWorkspaceExperience } from '../../components/room-workspace-experience';
import { UserShell } from '../../components/user-shell';

export const dynamic = 'force-dynamic';

export default function RoomsPage() {
  return (
    <UserShell title="Ruangan" subtitle="Room/Space → perangkat berdasarkan akses owner/share">
      <RoomWorkspaceExperience mode="rooms" />
    </UserShell>
  );
}
