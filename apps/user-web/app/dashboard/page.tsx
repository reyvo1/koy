import { DashboardExperience } from '../../components/dashboard-experience';
import { UserShell } from '../../components/user-shell';

export const dynamic = 'force-dynamic';

/**
 * Dynamic dashboard/workspace surface.
 *
 * This page used the bare design-system `ApplicationShell` directly, which renders no
 * navigation — so it was the one User Web page from which `/beranda`, `/ruangan` and
 * `/perangkat-saya` could only be reached by typing a URL, and it looked like a different
 * product from the other three. It now uses the same `UserShell` as every other User Web
 * surface, so there is one menu and one frame across the whole app.
 */
export default function HomePage() {
  return (
    <UserShell
      title="Dashboard"
      subtitle="Widget dinamis yang dibangun dari dashboard tersimpan"
    >
      <DashboardExperience />
    </UserShell>
  );
}
