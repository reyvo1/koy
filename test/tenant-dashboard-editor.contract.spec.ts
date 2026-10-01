import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  newLocalId,
  toWritePayload,
  type DashboardAggregate,
} from '../apps/admin-web/components/tenant-dashboard-editor';

/**
 * The editor writes the whole aggregate in one replace, so its payload builder is the single
 * place where a read shape becomes a write shape. If it drops a parent id, the backend
 * rejects the save with "layoutId must be a UUID" — a field the client was handed by the read
 * and then failed to send back. These assert the mapping, not the component.
 */

const AGGREGATE: DashboardAggregate = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Lantai 1',
  audience: 'TENANT_SHARED',
  revision: 7,
  schemaVersion: '1.0.0',
  layouts: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      breakpoint: 'DESKTOP',
      columns: 12,
      rowHeight: 8,
      gap: 12,
      items: [
        {
          id: '22222222-2222-4222-8222-222222222221',
          layoutId: '11111111-1111-4111-8111-111111111111',
          widgetId: '33333333-3333-4333-8333-333333333331',
          x: 0,
          y: 0,
          width: 4,
          height: 3,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          layoutId: '11111111-1111-4111-8111-111111111111',
          widgetId: '33333333-3333-4333-8333-333333333332',
          x: 4,
          y: 0,
          width: 4,
          height: 3,
        },
      ],
    },
    {
      id: '11111111-1111-4111-8111-111111111112',
      breakpoint: 'MOBILE',
      columns: 4,
      rowHeight: 8,
      gap: 8,
      items: [],
    },
  ],
  widgets: [
    {
      id: '33333333-3333-4333-8333-333333333331',
      kind: 'GAUGE',
      title: 'Suhu',
      schemaVersion: '1.0.0',
      presentationConfig: { min: 0, max: 100 },
      bindings: [
        {
          id: '44444444-4444-4444-8444-444444444441',
          widgetId: '33333333-3333-4333-8333-333333333331',
          alias: 'suhu',
          intent: 'READ',
          mode: 'LATEST',
          deviceId: 'device-1',
          capabilityId: 'cap-1',
        },
      ],
    },
    {
      id: '33333333-3333-4333-8333-333333333332',
      kind: 'STATUS',
      title: 'Status',
      schemaVersion: '1.0.0',
      bindings: [],
    },
  ],
};

describe('toWritePayload', () => {
  const payload = toWritePayload(AGGREGATE);

  it('flattens layout items to the top level, as the write DTO requires', () => {
    expect(Array.isArray(payload.layoutItems)).toBe(true);
    expect(payload.layoutItems).toHaveLength(2);
  });

  it('carries the parent layoutId on every item', () => {
    // `DashboardLayoutItemDto.layoutId` is @IsUUID, not optional. Losing it here is the
    // "layoutId must be a UUID" failure on a document the server itself produced.
    for (const item of payload.layoutItems) {
      expect(item.layoutId).toBeTruthy();
      expect(item.layoutId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
    // Every item's parent must be a layout that actually exists in the document. A layout
    // with no items (MOBILE here) legitimately contributes no ids, so the comparison is
    // "subset of the real layouts", not "equal to them".
    const layoutIds = new Set(AGGREGATE.layouts.map((l) => l.id));
    for (const item of payload.layoutItems) {
      expect(layoutIds.has(item.layoutId)).toBe(true);
    }
  });

  it('carries the parent widgetId on every binding', () => {
    expect(payload.bindings).toHaveLength(1);
    expect(payload.bindings[0].widgetId).toBe('33333333-3333-4333-8333-333333333331');
  });

  it('sends the revision the operator was looking at', () => {
    expect(payload.expectedRevision).toBe(7);
  });

  it('does not nest items or bindings back under their parents', () => {
    // Nesting them as well as flattening would send `items` to a DTO that does not declare
    // it, and the whitelist would reject the request rather than ignore the field.
    for (const layout of payload.layouts) {
      expect(Object.keys(layout).sort()).toEqual([
        'breakpoint',
        'columns',
        'gap',
        'id',
        'rowHeight',
      ]);
    }
    for (const widget of payload.widgets) {
      expect(Object.keys(widget)).not.toContain('bindings');
    }
  });

  it('defaults schemaVersion so the @IsIn(["1.0.0"]) check cannot be missed', () => {
    const bare: DashboardAggregate = {
      ...AGGREGATE,
      schemaVersion: undefined,
      widgets: AGGREGATE.widgets.map((w) => ({ ...w, schemaVersion: undefined })),
    };
    const out = toWritePayload(bare);
    expect(out.schemaVersion).toBe('1.0.0');
    for (const w of out.widgets) expect(w.schemaVersion).toBe('1.0.0');
  });

  it('round-trips: a read aggregate re-serialised keeps every child', () => {
    // The property that makes read-modify-write possible at all: nothing is dropped between
    // the shape the backend reads and the shape it accepts back.
    expect(payload.layoutItems).toHaveLength(
      AGGREGATE.layouts.reduce((n, l) => n + l.items.length, 0),
    );
    expect(payload.bindings).toHaveLength(
      AGGREGATE.widgets.reduce((n, w) => n + w.bindings.length, 0),
    );
  });
});

describe('newLocalId', () => {
  it('produces a UUID-shaped id the DTO will accept', () => {
    // A locally minted id is sent straight to an @IsUUID field. A non-conforming value makes
    // "add widget" fail with a validation error the operator cannot act on.
    expect(newLocalId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newLocalId()));
    expect(ids.size).toBe(50);
  });
});

describe('the editor is reachable from the workspace', () => {
  const workspace = readFileSync(
    join(__dirname, '..', 'apps', 'admin-web', 'components', 'tenant-workspace-content.tsx'),
    'utf8',
  );

  it('mounts the editor', () => {
    expect(workspace).toContain('TenantDashboardEditor');
  });

  it('offers an edit affordance, not only the empty-state text', () => {
    // The page used to tell an operator that widgets were added "lewat editor Modul 10" — a
    // screen that was not in the console. The text alone was a dead end.
    expect(workspace).toContain('setEditingId');
    expect(workspace).toContain('Edit layout');
  });

  it('no longer points at an editor that did not exist', () => {
    expect(workspace).not.toContain('ditambahkan lewat editor Modul 10');
  });

  it('re-reads the resolution, not just the dashboard list, after the editor closes', () => {
    // Found in the browser, not by reading code: after adding a widget and saving, the grid
    // still said "0 widget". `load()` refreshes `rows` only, so the open workspace kept
    // rendering the resolution fetched before the edit. A save that succeeds and then shows
    // nothing is indistinguishable from a save that silently failed, and it only corrected
    // itself on a full page reload.
    //
    // Both halves matter. The list reload is what was there before and is not sufficient;
    // `open(id)` is what re-fetches the resolution. Checking only the first would keep
    // passing with the bug reintroduced, and checking only the second would not notice a
    // handler that re-fetched nothing.
    expect(workspace).toMatch(/const wasOpen = openId;/);
    expect(workspace).toMatch(/if \(wasOpen\) void open\(wasOpen\);/);
    expect(workspace).toMatch(/void load\(\);/);
  });
});

describe('the editor calls routes that exist', () => {
  const panel = readFileSync(
    join(
      __dirname,
      '..',
      'apps',
      'admin-web',
      'components',
      'tenant-dashboard-editor-panel.tsx',
    ),
    'utf8',
  );

  it('uses the device and capability routes the console already has', () => {
    // These were written from a guess and did not exist; the picker failed closed on every
    // load, which reads as "this tenant has no devices" — a different, wrong statement.
    expect(panel).toContain('/api/admin/tenant-devices');
    expect(panel).toContain('/api/admin/device-capabilities');
    expect(panel).not.toContain('/api/tenant/devices');
  });

  it('sends the revision rather than defaulting it', () => {
    expect(panel).not.toMatch(/expectedRevision:\s*0\b/);
    expect(panel).not.toContain('expectedRevision: 1');
  });
});
