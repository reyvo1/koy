import { ProfileExperience } from '../../components/profile-experience';
import { UserShell } from '../../components/user-shell';
export const dynamic = 'force-dynamic';
export default function ProfilePage() { return <UserShell title="Profil" subtitle="Kelola identitas akun pengguna"><ProfileExperience /></UserShell>; }
