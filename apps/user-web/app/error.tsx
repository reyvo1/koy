'use client';

import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <ApplicationShell
      productName="IoT Platform"
      statusLabel="Tenant dashboard"
      surfaceName="User Web"
    >
      <StateNotice
        action={
          <button className="iot-button" onClick={reset} type="button">
            Coba lagi
          </button>
        }
        description="Workspace tidak dapat dirender. Tidak ada command perangkat yang dikirim."
        state="error"
        title="Workspace tidak tersedia"
      />
    </ApplicationShell>
  );
}
