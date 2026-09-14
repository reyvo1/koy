import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function NotFound() {
  return (
    <ApplicationShell productName="IoT Platform" surfaceName="Admin Web">
      <StateNotice
        description="Route yang diminta tidak tersedia di workspace ini."
        state="empty"
        title="Halaman tidak ditemukan"
      />
    </ApplicationShell>
  );
}
