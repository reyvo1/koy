import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from './device.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

describe('DeviceService', () => {
    let service: DeviceService;
    let prisma: PrismaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DeviceService,
                { provide: PrismaService, useValue: {
                    device: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
                    deviceCredential: { create: jest.fn(), update: jest.fn(), upsert: jest.fn() },
                    user: { findFirst: jest.fn() },
                    $queryRaw: jest.fn(),
                    $transaction: jest.fn(async (cb) => {
                        if (typeof cb !== 'function') return Promise.all(cb);
                        const tx = {
                            deviceCredential: { upsert: jest.fn().mockResolvedValue({}) },
                            device: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
                        };
                        return cb(tx);
                    })
                } },
            ],
        }).compile();

        service = module.get<DeviceService>(DeviceService);
        prisma = module.get<PrismaService>(PrismaService);
        process.env.MQTT_BROKER_URL = 'mqtt://broker.test:1883';
    });

    it('findAll scopes by tenantId', async () => {
        await service.findAll('t1');
        expect(prisma.device.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    });


    it('findAll filters MEMBER devices to owner or active share scope', async () => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ databaseNow: new Date('2026-09-11T00:00:00.000Z') }]);
        (prisma.device.findMany as jest.Mock).mockResolvedValue([]);

        await service.findAll('t1', { userId: 'u1', membershipId: 'm1', role: 'MEMBER' });

        expect(prisma.device.findMany).toHaveBeenCalledWith({
            where: {
                tenantId: 't1',
                OR: [
                    { ownerId: 'u1' },
                    {
                        shareGrants: {
                            some: {
                                tenantId: 't1',
                                grantedToMembershipId: 'm1',
                                status: 'ACTIVE',
                                expiresAt: { gt: new Date('2026-09-11T00:00:00.000Z') },
                            },
                        },
                    },
                ],
            },
        });
    });

    it('findAll keeps ADMIN directory tenant-scoped without share filtering', async () => {
        await service.findAll('t1', { userId: 'u1', membershipId: 'm1', role: 'ADMIN' });
        expect(prisma.device.findMany).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('findOne scopes by id + tenantId', async () => {
        (prisma.device.findFirst as jest.Mock).mockResolvedValue({ id: 'd1', tenantId: 't1' });
        await service.findOne('t1', 'd1');
        expect(prisma.device.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', tenantId: 't1' } });
    });

    it('cross-tenant findOne rejects', async () => {
        (prisma.device.findFirst as jest.Mock).mockResolvedValue(null);
        await expect(service.findOne('t1', 'd2')).rejects.toThrow(NotFoundException);
    });

    it('create binds tenantId', async () => {
        await service.create('t1', { name: 'd1', type: 'SENSOR' as any });
        expect(prisma.device.create).toHaveBeenCalledWith({ data: { name: 'd1', type: 'SENSOR', tenantId: 't1' } });
    });

    it('provision stores hash, not plaintext token', async () => {
        (prisma.device.findFirst as jest.Mock).mockResolvedValue({ id: 'd1' });
        const spy = jest.spyOn(argon2, 'hash').mockResolvedValue('hash');
        const result = await service.provision('t1', 'd1');
        expect(spy).toHaveBeenCalledWith(result.provisioningToken);
        expect(prisma.device.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ provisioningTokenHash: 'hash' }) }));
    });

    it('consumes a pairing token atomically before rotating credentials', async () => {
        const expires = new Date(Date.now() + 60_000);
        (prisma.device.findUnique as jest.Mock).mockResolvedValue({
            id: 'd1',
            tenantId: 't1',
            status: 'PROVISIONING',
            provisioningTokenHash: 'token-hash',
            provisioningTokenExpires: expires,
            credential: null,
        });
        jest.spyOn(argon2, 'verify').mockResolvedValue(true);
        jest.spyOn(argon2, 'hash').mockResolvedValue('password-hash');

        let capturedTx: any;
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
            capturedTx = {
                device: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
                deviceCredential: { upsert: jest.fn().mockResolvedValue({}) },
            };
            return cb(capturedTx);
        });

        await service.pair('d1', 'one-time-token', 'new-secret');

        expect(capturedTx.device.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: 'd1',
                    provisioningTokenHash: 'token-hash',
                }),
                data: expect.objectContaining({ provisioningTokenHash: null }),
            }),
        );
        expect(capturedTx.deviceCredential.upsert).toHaveBeenCalledWith({
            where: { deviceId: 'd1' },
            create: { deviceId: 'd1', passwordHash: 'password-hash' },
            update: { passwordHash: 'password-hash' },
        });
    });

    it('rejects a pairing request that loses the one-time token claim race', async () => {
        const expires = new Date(Date.now() + 60_000);
        (prisma.device.findUnique as jest.Mock).mockResolvedValue({
            id: 'd1',
            tenantId: 't1',
            status: 'PROVISIONING',
            provisioningTokenHash: 'token-hash',
            provisioningTokenExpires: expires,
            credential: null,
        });
        jest.spyOn(argon2, 'verify').mockResolvedValue(true);
        jest.spyOn(argon2, 'hash').mockResolvedValue('password-hash');

        const upsert = jest.fn();
        (prisma.$transaction as jest.Mock).mockImplementation(async (cb) =>
            cb({
                device: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
                deviceCredential: { upsert },
            }),
        );

        await expect(
            service.pair('d1', 'one-time-token', 'new-secret'),
        ).rejects.toThrow('Invalid or expired provisioning token');
        expect(upsert).not.toHaveBeenCalled();
    });

});
