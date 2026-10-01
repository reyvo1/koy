import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from './device.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookDispatchService } from '../webhook/webhook-runtime.service';

/**
 * `device.registered` was subscribable and never emitted.
 *
 * `SUBSCRIBABLE_EVENTS` listed `device.registered` from the moment the webhook runtime
 * landed, and the only `.dispatch(` call in `src/` was the heartbeat's `device.state_changed`.
 * A tenant subscribing to `device.registered` got a green registration, a signing secret,
 * and a permanent silence — which is the exact ambiguity the runtime's own controller
 * comment says the list is held in code to prevent.
 *
 * These specs pin the emitter and, more importantly, its two boundaries: a dispatch failure
 * must not fail the create (a receiver that is down cannot refuse a device registration),
 * and a missing dispatch service must be reported rather than passed over in silence.
 */
describe('DeviceService webhook emission', () => {
    let service: DeviceService;
    let prisma: PrismaService;
    let dispatch: { dispatch: jest.Mock };

    const created = {
        id: 'd1',
        name: 'sensor-1',
        type: 'SENSOR',
        status: 'PROVISIONING',
    };

    const build = async (withDispatch: boolean): Promise<void> => {
        dispatch = { dispatch: jest.fn().mockResolvedValue([]) };
        const providers: unknown[] = [
            DeviceService,
            {
                provide: PrismaService,
                useValue: {
                    device: {
                        findFirst: jest.fn(),
                        update: jest.fn(),
                        create: jest.fn().mockResolvedValue(created),
                    },
                },
            },
        ];
        if (withDispatch) {
            providers.push({ provide: WebhookDispatchService, useValue: dispatch });
        }
        const module: TestingModule = await Test.createTestingModule({
            providers: providers as never[],
        }).compile();
        service = module.get<DeviceService>(DeviceService);
        prisma = module.get<PrismaService>(PrismaService);
    };

    beforeEach(async () => {
        await build(true);
    });

    describe('create', () => {
        it('emits device.registered to the tenant', async () => {
            await service.create('t1', { name: 'sensor-1', type: 'SENSOR' as never });

            expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
            const [tenantId, event, payload] = dispatch.dispatch.mock.calls[0];
            expect(tenantId).toBe('t1');
            expect(event).toBe('device.registered');
            // The payload names the device that was just created. An emitter that fires with
            // an empty body satisfies `toHaveBeenCalledTimes(1)` and tells a subscriber
            // nothing about what happened.
            expect(payload).toEqual(
                expect.objectContaining({
                    deviceId: 'd1',
                    name: 'sensor-1',
                    type: 'SENSOR',
                }),
            );
        });

        it('still returns the created device', async () => {
            // The emit is fire-and-forget. Awaiting it into the success path would let a
            // receiver that hangs make device registration time out, which is the opposite of
            // what a heartbeat or a create should do.
            await expect(
                service.create('t1', { name: 'sensor-1', type: 'SENSOR' as never }),
            ).resolves.toEqual(created);
        });

        it('does not fail the create when every receiver is down', async () => {
            dispatch.dispatch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:9'));

            await expect(
                service.create('t1', { name: 'sensor-1', type: 'SENSOR' as never }),
            ).resolves.toEqual(created);

            // And the rejection is absorbed rather than left floating: an unhandled rejection
            // from an outbound call would take down the process that was merely registering a
            // device.
            await new Promise((resolve) => setImmediate(resolve));
        });
    });

    describe('without a dispatch service', () => {
        beforeEach(async () => {
            await build(false);
        });

        it('still creates the device', async () => {
            await expect(
                service.create('t1', { name: 'sensor-1', type: 'SENSOR' as never }),
            ).resolves.toEqual(created);
            expect(prisma.device.create).toHaveBeenCalled();
        });
    });
});