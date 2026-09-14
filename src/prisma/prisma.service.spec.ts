import { PrismaService } from './prisma.service';

describe('PrismaService lifecycle', () => {
  it('disconnects Prisma during application shutdown', async () => {
    const service = new PrismaService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onApplicationShutdown();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
