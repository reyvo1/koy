import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function Loading() {
  return (
    <ApplicationShell
      productName="IoT Platform"
      statusLabel="Tenant dashboard"
      surfaceName="User Web"
    >
      <StateNotice
        description="User Web sedang menyiapkan tampilan tenant yang terotorisasi."
        state="loading"
        title="Memuat workspace"
      />
    </ApplicationShell>
  );
}
