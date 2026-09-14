import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function NotFound() {
  return (
    <ApplicationShell
      productName="IoT Platform"
      statusLabel="Tenant dashboard"
      surfaceName="User Web"
    >
      <StateNotice
        description="Route yang diminta tidak tersedia di User Web."
        state="empty"
        title="Halaman tidak ditemukan"
      />
    </ApplicationShell>
  );
}
