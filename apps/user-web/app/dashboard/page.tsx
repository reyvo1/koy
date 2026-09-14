import { ApplicationShell } from '@iot-platform/design-system';
import { DashboardExperience } from '../../components/dashboard-experience';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  return (
    <ApplicationShell
      productName="IoT Platform"
      statusLabel="Tenant dashboard"
      surfaceName="User Web"
    >
      <DashboardExperience />
    </ApplicationShell>
  );
}
