import { take } from 'rxjs';
import { TelemetryStreamController } from './telemetry-stream.controller';
import { TelemetryService } from './telemetry.service';

describe('TelemetryStreamController (ADR-002)', () => {
  const build = () => {
    const service = {
      getLatest: jest.fn().mockResolvedValue({ temperature: 27.5 }),
    };
    return {
      controller: new TelemetryStreamController(
        service as unknown as TelemetryService,
      ),
      service,
    };
  };

  it('is defined and accepts bounded interval', () => {
    const { controller } = build();
    expect(controller).toBeDefined();
    const stream = controller.stream(
      { user: { tenantContext: { tenantId: 'tenant-1' } } },
      'device-1',
      999, // out of bounds -> clamped to 60
    );
    expect(stream).toBeDefined();
  });

  it('emits a valid stream frame', async () => {
    const { controller } = build();
    const stream$ = controller.stream(
      { user: { tenantContext: { tenantId: 'tenant-1' } } },
      'device-1',
      2,
    );
    // 'connected' emits synchronously during subscribe(), so capture the
    // Subscription through the subscriber object itself (no TDZ race).
    const result = await new Promise<{ type: string }>((resolve) => {
      // take(1) auto-unsubscribes -> no open handles, Jest exits cleanly.
      stream$.pipe(take(1)).subscribe({
        next: (ev) => resolve(ev as { type: string }),
        complete: () => resolve({ type: 'completed' }),
      });
    });
    expect(['connected', 'telemetry', 'heartbeat']).toContain(result.type);
  }, 10_000);
});
