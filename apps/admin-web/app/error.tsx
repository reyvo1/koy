'use client';

import { ApplicationShell, StateNotice } from '@iot-platform/design-system';

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <ApplicationShell productName="IoT Platform" surfaceName="Admin Web">
      <StateNotice
        action={
          <button className="iot-button" onClick={reset} type="button">
            Coba lagi
          </button>
        }
        description="Terjadi kesalahan saat menampilkan halaman ini. Ini bukan karena perangkat. Klik 'Coba lagi', atau muat ulang total (Ctrl+Shift+R) untuk memuat aplikasi terbaru."
        state="error"
        title="Halaman tidak dapat ditampilkan"
      />
    </ApplicationShell>
  );
}
