import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DashboardAudience, DashboardWidgetKind } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';
import { DashboardWidgetResolver } from './dashboard-widget.resolver';
import { DashboardWidgetQueryService } from './dashboard-widget-query.service';
import { DeviceAccessService } from '../device/device-access.service';
import {
  DASHBOARD_PERSISTENCE_ERROR_CODES,
  DashboardPersistenceError,
} from './dashboard.persistence.error';

const tenantId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const dashboardId = '33333333-3333-4333-8333-333333333333';

function aggregate(audience: DashboardAudience = DashboardAudience.PERSONAL) {
  return {
    id: dashboardId,
    tenantId,
    ownerMembershipId: membershipId,
    name: 'Main dashboard',
    description: null,
    audience,
    schemaVersion: '1.0.0',
    revision: 1,
    createdAt: new Date('2026-07-19T00:00:00.000Z'),
    updatedAt: new Date('2026-07-19T00:00:00.000Z'),
    layouts: [],
    widgets: [],
  } as any;
}

function dto(audience: DashboardAudience = DashboardAudience.PERSONAL) {
  return {
    audience,
    name: 'Main dashboard',
    schemaVersion: '1.0.0',
    layouts: [],
    widgets: [],
    layoutItems: [],
    bindings: [],
  } as any;
}

describe('DashboardService', () => {
  let repository: jest.Mocked<DashboardRepository>;
  let service: DashboardService;

  beforeEach(() => {
    repository = {
      createDashboard: jest.fn(),
      listAuthorizedDashboards: jest.fn(),
      findAuthorizedDashboard: jest.fn(),
      findAuthorizedDashboardResolution: jest.fn(),
      replaceAuthorizedDashboard: jest.fn(),
      deleteAuthorizedDashboard: jest.fn(),
    } as unknown as jest.Mocked<DashboardRepository>;
    service = new DashboardService(repository);
  });

  it('derives tenant ownership from trusted context and strips internal fields', async () => {
    repository.createDashboard.mockResolvedValue(aggregate());

    const result = await service.create(
      { tenantId, membershipId, role: 'MEMBER' },
      dto(),
    );

    expect(repository.createDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        ownerMembershipId: membershipId,
      }),
      DashboardAudience.PERSONAL,
      false,
    );
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('ownerMembershipId');
  });

  it('allows admin shared creation and keeps audience immutable on replace', async () => {
    repository.createDashboard.mockResolvedValue(
      aggregate(DashboardAudience.TENANT_SHARED),
    );
    repository.replaceAuthorizedDashboard.mockResolvedValue(
      aggregate(DashboardAudience.TENANT_SHARED),
    );

    await service.create(
      { tenantId, membershipId, role: 'ADMIN' },
      dto(DashboardAudience.TENANT_SHARED),
    );
    await service.replace(
      { tenantId, membershipId, role: 'ADMIN' },
      dashboardId,
      { ...dto(), expectedRevision: 1 },
    );

    expect(repository.createDashboard).toHaveBeenCalledWith(
      expect.any(Object),
      DashboardAudience.TENANT_SHARED,
      true,
    );
    expect(repository.replaceAuthorizedDashboard).toHaveBeenCalledWith(
      expect.not.objectContaining({ audience: expect.anything() }),
      true,
    );
  });

  it('treats PLATFORM_ADMIN as shared-dashboard administrator', async () => {
    repository.createDashboard.mockResolvedValue(
      aggregate(DashboardAudience.TENANT_SHARED),
    );

    await service.create(
      { tenantId, membershipId, role: 'PLATFORM_ADMIN' },
      dto(DashboardAudience.TENANT_SHARED),
    );

    expect(repository.createDashboard).toHaveBeenCalledWith(
      expect.any(Object),
      DashboardAudience.TENANT_SHARED,
      true,
    );
  });

  it('rejects MEMBER dashboard WRITE bindings without device CONTROL', async () => {
    const access = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          ['66666666-6666-4666-8666-666666666666', { canView: true, canControl: false, source: 'VIEW_SHARE' }],
        ]),
      ),
    };
    service = new DashboardService(
      repository,
      undefined as unknown as DashboardWidgetResolver,
      undefined,
      access as unknown as DeviceAccessService,
    );
    const input = dto();
    input.bindings = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        widgetId: '44444444-4444-4444-8444-444444444444',
        alias: 'power',
        intent: 'WRITE',
        mode: 'COMMAND',
        deviceId: '66666666-6666-4666-8666-666666666666',
        capabilityId: '77777777-7777-4777-8777-777777777777',
        queryConfig: {},
      },
    ];

    await expect(
      service.create(
        { tenantId, membershipId, role: 'MEMBER', userId: 'user-1' },
        input,
      ),
    ).rejects.toMatchObject({
      response: { code: 'RBAC_PERMISSION_DENIED' },
    });
    expect(repository.createDashboard).not.toHaveBeenCalled();
  });

  it('allows MEMBER dashboard READ bindings with device VIEW', async () => {
    repository.createDashboard.mockResolvedValue(aggregate());
    const access = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          ['66666666-6666-4666-8666-666666666666', { canView: true, canControl: false, source: 'VIEW_SHARE' }],
        ]),
      ),
    };
    service = new DashboardService(
      repository,
      undefined as unknown as DashboardWidgetResolver,
      undefined,
      access as unknown as DeviceAccessService,
    );
    const input = dto();
    input.bindings = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        widgetId: '44444444-4444-4444-8444-444444444444',
        alias: 'status',
        intent: 'READ',
        mode: 'DEVICE_STATUS',
        deviceId: '66666666-6666-4666-8666-666666666666',
        capabilityId: null,
        queryConfig: {},
      },
    ];

    await service.create(
      { tenantId, membershipId, role: 'MEMBER', userId: 'user-1' },
      input,
    );

    expect(repository.createDashboard).toHaveBeenCalledTimes(1);
  });

  it('maps shared-admin rejection to a stable forbidden error', async () => {
    repository.createDashboard.mockRejectedValue(
      new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.SharedAdminRequired,
        'admin required',
      ),
    );

    await expect(
      service.create(
        { tenantId, membershipId, role: 'MEMBER' },
        dto(DashboardAudience.TENANT_SHARED),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a bounded widget-resolution summary without internal ownership', async () => {
    repository.findAuthorizedDashboardResolution.mockResolvedValue({
      id: dashboardId,
      revision: 3,
      schemaVersion: '1.0.0',
      widgets: [],
    });

    const result = await service.resolve(
      { tenantId, membershipId, role: 'MEMBER' },
      dashboardId,
    );

    expect(repository.findAuthorizedDashboardResolution).toHaveBeenCalledWith(
      tenantId,
      membershipId,
      dashboardId,
    );
    expect(result).toEqual({
      dashboardId,
      schemaVersion: '1.0.0',
      revision: 3,
      summary: { total: 0, ready: 0, invalid: 0, unsupported: 0 },
      widgets: [],
    });
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('ownerMembershipId');
  });

  it('queries one authorized widget without exposing ownership fields', async () => {
    repository.findAuthorizedDashboardResolution.mockResolvedValue({
      id: dashboardId,
      revision: 4,
      schemaVersion: '1.0.0',
      widgets: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: DashboardWidgetKind.CARD,
          title: 'Status',
          schemaVersion: '1.0.0',
          presentationConfig: {},
          bindings: [],
        },
      ],
    });
    const resolver = {
      resolveWidgets: jest.fn().mockReturnValue([
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: DashboardWidgetKind.CARD,
          title: 'Status',
          state: 'READY',
          reasonCode: null,
          message: null,
          presentation: {},
          supportedStates: [
            'LOADING',
            'EMPTY',
            'STALE',
            'UNAUTHORIZED',
            'OFFLINE',
            'ERROR',
          ],
          bindings: [],
        },
      ]),
    };
    const queryService = {
      queryWidget: jest.fn().mockResolvedValue({
        widgetId: '44444444-4444-4444-8444-444444444444',
        kind: DashboardWidgetKind.CARD,
        title: 'Status',
        state: 'READY',
        reasonCode: null,
        message: null,
        generatedAt: '2026-07-19T01:00:00.000Z',
        summary: {
          total: 0,
          ready: 0,
          empty: 0,
          stale: 0,
          invalid: 0,
          unsupported: 0,
          error: 0,
        },
        bindings: [],
      }),
    };
    service = new DashboardService(
      repository,
      resolver as unknown as DashboardWidgetResolver,
      queryService as unknown as DashboardWidgetQueryService,
    );

    const result = await service.queryWidgetData(
      { tenantId, membershipId, role: 'MEMBER' },
      dashboardId,
      '44444444-4444-4444-8444-444444444444',
    );

    expect(queryService.queryWidget).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ kind: DashboardWidgetKind.CARD }),
    );
    expect(result).toMatchObject({
      dashboardId,
      revision: 4,
      state: 'READY',
    });
    expect(result).not.toHaveProperty('tenantId');
    expect(result).not.toHaveProperty('ownerMembershipId');
  });

  it('maps an unknown widget to the stable dashboard widget not-found code', async () => {
    repository.findAuthorizedDashboardResolution.mockResolvedValue({
      id: dashboardId,
      revision: 4,
      schemaVersion: '1.0.0',
      widgets: [],
    });
    const resolver = {
      resolveWidgets: jest.fn().mockReturnValue([]),
    };
    const queryService = {
      queryWidget: jest.fn(),
    };
    service = new DashboardService(
      repository,
      resolver as unknown as DashboardWidgetResolver,
      queryService as unknown as DashboardWidgetQueryService,
    );

    await expect(
      service.queryWidgetData(
        { tenantId, membershipId, role: 'MEMBER' },
        dashboardId,
        '55555555-5555-4555-8555-555555555555',
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'DASHBOARD_WIDGET_NOT_FOUND',
      },
    });
    expect(queryService.queryWidget).not.toHaveBeenCalled();
  });


  it('filters inaccessible shared-dashboard bindings and removes CONTROL from view-only grants', async () => {
    repository.findAuthorizedDashboardResolution.mockResolvedValue({
      id: dashboardId,
      revision: 5,
      schemaVersion: '1.0.0',
      widgets: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          kind: DashboardWidgetKind.SWITCH,
          title: 'Power',
          schemaVersion: '1.0.0',
          presentationConfig: {},
          bindings: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              alias: 'allowed',
              intent: 'WRITE',
              mode: 'COMMAND',
              deviceId: '66666666-6666-4666-8666-666666666666',
              capabilityId: '77777777-7777-4777-8777-777777777777',
              queryConfig: {},
              device: { id: '66666666-6666-4666-8666-666666666666', status: 'ACTIVE' },
              capability: {
                id: '77777777-7777-4777-8777-777777777777',
                deviceId: '66666666-6666-4666-8666-666666666666',
                key: 'switch.power',
                semanticType: 'switch.power',
                dataType: 'boolean',
                unit: null,
                constraints: {},
                isReadable: true,
                isWritable: true,
                isReportable: true,
                schemaVersion: '1.0.0',
              },
            },
            {
              id: '88888888-8888-4888-8888-888888888888',
              alias: 'blocked',
              intent: 'READ',
              mode: 'DEVICE_STATUS',
              deviceId: '99999999-9999-4999-8999-999999999999',
              capabilityId: null,
              queryConfig: {},
              device: { id: '99999999-9999-4999-8999-999999999999', status: 'ACTIVE' },
              capability: null,
            },
          ],
        },
      ],
    } as any);

    const resolver = {
      resolveWidgets: jest.fn().mockReturnValue([]),
    };
    const access = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          [
            '66666666-6666-4666-8666-666666666666',
            { canView: true, canControl: false, source: 'VIEW_SHARE' },
          ],
          [
            '99999999-9999-4999-8999-999999999999',
            { canView: false, canControl: false, source: 'NONE' },
          ],
        ]),
      ),
    };
    service = new DashboardService(
      repository,
      resolver as unknown as DashboardWidgetResolver,
      undefined,
      access as unknown as DeviceAccessService,
    );

    await service.resolve(
      { tenantId, membershipId, role: 'MEMBER', userId: 'user-1' },
      dashboardId,
    );

    const input = (resolver.resolveWidgets as jest.Mock).mock.calls[0][0];
    expect(input[0].bindings).toHaveLength(1);
    expect(input[0].bindings[0].alias).toBe('allowed');
    expect(input[0].bindings[0].capability.isWritable).toBe(false);
    expect(access.resolveMany).toHaveBeenCalledWith(
      { tenantId, membershipId, userId: 'user-1', role: 'MEMBER' },
      expect.arrayContaining([
        '66666666-6666-4666-8666-666666666666',
        '99999999-9999-4999-8999-999999999999',
      ]),
    );
  });

  it('filters inaccessible binding identifiers from dashboard aggregate reads', async () => {
    repository.findAuthorizedDashboard.mockResolvedValue({
      ...aggregate(DashboardAudience.TENANT_SHARED),
      widgets: [
        {
          id: 'w1',
          kind: DashboardWidgetKind.CARD,
          title: 'Mixed',
          schemaVersion: '1.0.0',
          presentationConfig: {},
          bindings: [
            { id: 'b1', alias: 'visible', intent: 'READ', mode: 'DEVICE_STATUS', deviceId: 'd1', capabilityId: null, queryConfig: {} },
            { id: 'b2', alias: 'hidden', intent: 'READ', mode: 'DEVICE_STATUS', deviceId: 'd2', capabilityId: null, queryConfig: {} },
          ],
        },
      ],
    } as any);
    const access = {
      resolveMany: jest.fn().mockResolvedValue(
        new Map([
          ['d1', { canView: true, canControl: false, source: 'VIEW_SHARE' }],
          ['d2', { canView: false, canControl: false, source: 'NONE' }],
        ]),
      ),
    };
    service = new DashboardService(
      repository,
      undefined as unknown as DashboardWidgetResolver,
      undefined,
      access as unknown as DeviceAccessService,
    );

    const result = await service.findOne(
      { tenantId, membershipId, role: 'MEMBER', userId: 'user-1' },
      dashboardId,
    );

    expect(result.widgets[0].bindings).toEqual([
      expect.objectContaining({ id: 'b1', deviceId: 'd1' }),
    ]);
  });

  it('maps inaccessible dashboards to safe not-found', async () => {
    repository.findAuthorizedDashboard.mockRejectedValue(
      new DashboardPersistenceError(
        DASHBOARD_PERSISTENCE_ERROR_CODES.DashboardNotFound,
        'not found',
      ),
    );

    await expect(
      service.findOne({ tenantId, membershipId, role: 'MEMBER' }, dashboardId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
