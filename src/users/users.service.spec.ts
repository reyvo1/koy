import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
    let service: UsersService;
    let prisma: PrismaService;

    beforeEach(() => {
        prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as any;
        service = new UsersService(prisma);
    });

    it('getProfile should select safe fields', async () => {
        (prisma.user.findUnique as jest.Mock).mockResolvedValue({
            id: 'u1',
            email: 'test@test.com',
            name: 'Test User',
            tenantId: 't1',
            isVerified: true,
            memberships: [{ tenantId: 't1', role: 'MEMBER', status: 'ACTIVE' }]
        });
        const result = await service.getProfile('u1');
        expect(result).toEqual({
            id: 'u1',
            email: 'test@test.com',
            name: 'Test User',
            tenantId: 't1',
            isVerified: true,
            memberships: [{ tenantId: 't1', role: 'MEMBER', status: 'ACTIVE' }]
        });
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 'u1' },
            select: {
                id: true,
                email: true,
                name: true,
                tenantId: true,
                isVerified: true,
                memberships: {
                    select: {
                        tenantId: true,
                        role: true,
                        status: true
                    }
                }
            }
        });
    });

    it('updateProfile should update only name', async () => {
        (prisma.user.update as jest.Mock).mockResolvedValue({
            id: 'u1',
            email: 'test@test.com',
            name: 'Updated Name'
        });
        const result = await service.updateProfile('u1', { name: 'Updated Name' });
        expect(result).toEqual({
            id: 'u1',
            email: 'test@test.com',
            name: 'Updated Name'
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'u1' },
            data: { name: 'Updated Name' },
            select: {
                id: true,
                email: true,
                name: true
            }
        });
    });
});
