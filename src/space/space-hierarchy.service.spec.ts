import { SpaceKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpaceHierarchyService } from './space-hierarchy.service';

const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('SpaceHierarchyService', () => {
  let spaceRows: Record<string, any>[];
  let create: jest.Mock;
  let findFirst: jest.Mock;
  let placementCreate: jest.Mock;
  let service: SpaceHierarchyService;

  beforeEach(() => {
    spaceRows = [];
    create = jest.fn().mockImplementation(({ data }) => {
      const row = { id: `sp-${spaceRows.length + 1}`, ...data };
      spaceRows.push(row);
      return Promise.resolve(row);
    });
    findFirst = jest.fn().mockImplementation(({ where }) =>
      Promise.resolve(
        spaceRows.find(
          (s) =>
            s.id === where.id &&
            (!where.kind || s.kind === where.kind),
        ) ?? null,
      ),
    );
    placementCreate = jest.fn().mockResolvedValue({});
    service = new SpaceHierarchyService({
      space: { create, findFirst },
      spaceDevicePlacement: { create: placementCreate },
    } as unknown as PrismaService);
  });

  it('creates a SITE at depth 0 with no parent', async () => {
    const result = await service.createSpace({
      tenantId,
      name: 'Home',
      kind: SpaceKind.SITE,
    });
    expect(result.id).toBe('sp-1');
    expect(spaceRows[0]).toMatchObject({ depth: 0, path: '/Home' });
  });

  it('rejects a SITE with a parent', async () => {
    await expect(
      service.createSpace({
        tenantId,
        name: 'Bad',
        kind: SpaceKind.SITE,
        parentId: 'some-id',
      }),
    ).rejects.toMatchObject({ code: 'SPACE_PARENT_KIND_INVALID' });
  });

  it('enforces Site->Building->Floor->Room ordering', async () => {
    const site = await service.createSpace({ tenantId, name: 'Home', kind: SpaceKind.SITE });

    // BUILDING under SITE is valid
    await service.createSpace({
      tenantId, name: 'Tower A', kind: SpaceKind.BUILDING, parentId: site.id,
    });

    // ROOM directly under SITE is invalid
    await expect(
      service.createSpace({ tenantId, name: 'BadRoom', kind: SpaceKind.ROOM, parentId: site.id }),
    ).rejects.toMatchObject({ code: 'SPACE_PARENT_KIND_INVALID' });

    const building = spaceRows[1];
    const floor = await service.createSpace({
      tenantId, name: 'Floor 1', kind: SpaceKind.FLOOR, parentId: building.id,
    });
    await service.createSpace({
      tenantId, name: 'Living Room', kind: SpaceKind.ROOM, parentId: floor.id,
    });

    expect(spaceRows.map((s) => s.depth)).toEqual([0, 1, 2, 3]);
    expect(spaceRows[3].path).toBe('/Home/Tower A/Floor 1/Living Room');
  });

  it('rejects missing parents for non-site kinds', async () => {
    await expect(
      service.createSpace({ tenantId, name: 'Orphan', kind: SpaceKind.BUILDING }),
    ).rejects.toMatchObject({ code: 'SPACE_PARENT_REQUIRED' });
  });

  it('rejects invalid names', async () => {
    await expect(
      service.createSpace({ tenantId, name: '', kind: SpaceKind.SITE }),
    ).rejects.toMatchObject({ code: 'SPACE_NAME_INVALID' });
  });

  it('places devices only into ROOM spaces', async () => {
    const site = await service.createSpace({ tenantId, name: 'Home', kind: SpaceKind.SITE });

    await expect(
      service.placeDevice({ tenantId, roomId: site.id, deviceId: 'dev1' }),
    ).rejects.toMatchObject({ code: 'SPACE_PARENT_KIND_INVALID' });
    expect(placementCreate).not.toHaveBeenCalled();
  });
});
