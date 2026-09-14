import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function Loading() {
  return (
    <ApplicationShell productName="IoT Platform" surfaceName="Admin Web">
      <StateNotice
        description="Admin Web sedang menyiapkan tampilan yang terotorisasi."
        state="loading"
        title="Memuat workspace"
      />
    </ApplicationShell>
  );
}
