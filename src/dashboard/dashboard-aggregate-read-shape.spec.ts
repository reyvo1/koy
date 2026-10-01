import { DashboardService } from './dashboard.service';
import { DashboardRepository } from './dashboard.repository';

/**
 * The aggregate read response has to be a valid input to the aggregate write DTO.
 *
 * `DashboardLayoutItemDto` and `DashboardBindingDto` both require the parent id as a
 * @IsUUID field, and the write payload carries layout items and bindings as flat top-level
 * arrays where the parent can no longer be inferred from nesting. The read response nests
 * both, so it was omitting exactly the two fields a read-modify-write needs: `layoutId` on
 * each layout item and `widgetId` on each binding.
 *
 * The symptom was nasty because it looked like a client bug. Reading a dashboard and writing
 * it straight back failed validation on a field the server had never returned, and the only
 * way to make it work was to hand-re-attach both parent ids in the client — knowledge that
 * exists nowhere in the read response. These tests assert the response carries what the
 * writer demands, and that the echoed ids are the real parents rather than plausible-looking
 * strings.
 */

const TENANT = '22222222-2222-4222-8222-222222222222';
const MEMBERSHIP = '99999999-9999-4999-8999-999999999999';
const DASHBOARD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LAYOUT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LAYOUT_ITEM = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WIDGET = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BINDING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEVICE = '33333333-3333-4333-8333-333333333334';
const CAPABILITY = '3bf8df63-ac46-4c1f-a34a-183e67e7e80d';

// An administrative role so `filterAggregateDeviceAccess` returns the record untouched.
// The test is about the response SHAPE; device-access filtering is covered elsewhere, and
// routing through it here would silently drop bindings and make the shape untestable.
const context = { tenantId: TENANT, membershipId: MEMBERSHIP, role: 'PLATFORM_ADMIN' };

const aggregateRecord = () => ({
  id: DASHBOARD,
  tenantId: TENANT,
  audience: 'TENANT_SHARED' as const,
  ownerMembershipId: null,
  name: 'Round-trip probe',
  description: null,
  revision: 3,
  schemaVersion: '1.0.0',
  createdAt: new Date('2026-09-29T00:00:00.000Z'),
  updatedAt: new Date('2026-09-29T00:00:00.000Z'),
  layouts: [
    {
      id: LAYOUT,
      breakpoint: 'lg',
      columns: 12,
      rowHeight: 8,
      gap: 4,
      items: [
        {
          id: LAYOUT_ITEM,
          layoutId: LAYOUT,
          widgetId: WIDGET,
          x: 0,
          y: 0,
          width: 4,
          height: 2,
          minWidth: 1,
          minHeight: 1,
        },
      ],
    },
  ],
  widgets: [
    {
      id: WIDGET,
      kind: 'GAUGE',
      title: 'Suhu',
      schemaVersion: 1,
      presentationConfig: null,
      bindings: [
        {
          id: BINDING,
          widgetId: WIDGET,
          alias: 'suhu',
          intent: 'TELEMETRY',
          mode: 'AUTO',
          deviceId: DEVICE,
          capabilityId: CAPABILITY,
          queryConfig: null,
        },
      ],
    },
  ],
});

describe('DashboardService aggregate read shape', () => {
  let service: DashboardService;
  let repository: jest.Mocked<DashboardRepository>;

  beforeEach(() => {
    repository = {
      createDashboard: jest.fn(),
      listAuthorizedDashboards: jest.fn(),
      findAuthorizedDashboard: jest
        .fn()
        .mockResolvedValue(aggregateRecord()),
      findAuthorizedDashboardResolution: jest.fn(),
      replaceAuthorizedDashboard: jest.fn(),
      deleteAuthorizedDashboard: jest.fn(),
    } as unknown as jest.Mocked<DashboardRepository>;
    service = new DashboardService(repository);
  });

  describe('parent ids a flat write payload cannot infer', () => {
    it('echoes layoutId on every layout item', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      expect(result.layouts[0].items[0].layoutId).toBe(LAYOUT);
    });

    it('echoes widgetId on every binding', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      expect(result.widgets[0].bindings[0].widgetId).toBe(WIDGET);
    });

    it('keeps the existing widgetId on layout items', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      expect(result.layouts[0].items[0].widgetId).toBe(WIDGET);
    });
  });

  describe('a read can be flattened straight into a write payload', () => {
    it('every layout item carries both required parent ids', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      const flatLayoutItems = result.layouts.flatMap((layout: any) =>
        layout.items.map((item: any) => ({
          id: item.id,
          layoutId: item.layoutId,
          widgetId: item.widgetId,
        })),
      );
      for (const item of flatLayoutItems) {
        expect(item.layoutId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(item.widgetId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      }
    });

    it('every binding carries the required parent widget id', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      const flatBindings = result.widgets.flatMap((widget: any) =>
        widget.bindings.map((binding: any) => ({
          id: binding.id,
          widgetId: binding.widgetId,
        })),
      );
      expect(flatBindings.length).toBeGreaterThan(0);
      for (const binding of flatBindings) {
        expect(binding.widgetId).toBe(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            binding.widgetId,
          )
            ? binding.widgetId
            : 'not-a-uuid',
        );
      }
    });

    it('the binding widgetId names the widget it is actually nested under', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      for (const widget of result.widgets) {
        for (const binding of widget.bindings) {
          expect(binding.widgetId).toBe(widget.id);
        }
      }
    });

    it('the layout item layoutId names the layout it is actually nested under', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      for (const layout of result.layouts) {
        for (const item of layout.items) {
          expect(item.layoutId).toBe(layout.id);
        }
      }
    });
  });

  describe('the added fields are additive', () => {
    it('does not drop the fields the response already carried', async () => {
      const result: any = await service.findOne(context as any, DASHBOARD);

      expect(result.widgets[0].bindings[0]).toMatchObject({
        id: BINDING,
        alias: 'suhu',
        intent: 'TELEMETRY',
        mode: 'AUTO',
        deviceId: DEVICE,
        capabilityId: CAPABILITY,
      });
      expect(result.layouts[0].items[0]).toMatchObject({
        id: LAYOUT_ITEM,
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      });
    });
  });
});
