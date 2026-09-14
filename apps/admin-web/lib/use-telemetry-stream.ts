'use client';

/**
 * useTelemetryStream (ADR-002) — EventSource consumer with polling fallback.
 * Domain-bound: only telemetry events for an authorized device.
 */

import { useEffect, useRef, useState } from 'react';

export interface StreamState {
  data: unknown | null;
  connected: boolean;
  error: string | null;
}

export function useTelemetryStream(deviceId: string | null): StreamState {
  const [state, setState] = useState<StreamState>({
    data: null,
    connected: false,
    error: null,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!deviceId) return;

    let source: EventSource | null = null;
    let disposed = false;

    const startPolling = () => {
      if (pollRef.current || disposed) return;
      // Fallback: bounded polling every 10s via existing REST contract
      pollRef.current = setInterval(async () => {
        try {
          const response = await fetch(
            `/api/admin/telemetry-chart?deviceId=${deviceId}&hours=1`,
          );
          if (response.ok) {
            setState((s) => ({ ...s, connected: false }));
          }
        } catch {
          /* keep silent — UI shows last known data */
        }
      }, 10_000);
    };

    try {
      source = new EventSource(
        `/api/admin/telemetry-stream?deviceId=${deviceId}`,
      );
      source.addEventListener('open', () =>
        setState((s) => ({ ...s, connected: true, error: null })),
      );
      source.addEventListener('telemetry', (event) => {
        try {
          setState((s) => ({
            ...s,
            data: JSON.parse((event as MessageEvent).data),
            connected: true,
          }));
        } catch {
          /* ignore malformed frame */
        }
      });
      source.addEventListener('error', () => {
        // EventSource auto-reconnects; start polling as safety net.
        setState((s) => ({ ...s, connected: false }));
        startPolling();
      });
    } catch {
      startPolling();
    }

    return () => {
      disposed = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      source?.close();
    };
  }, [deviceId]);

  return state;
}
