import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

/**
 * The chart system contract.
 *
 * Before this contract, four admin screens carried copy-pasted inline SVG charts with a
 * hardcoded `#2dd4bf` stroke (which breaks under the light theme token set), a page named
 * "Grafik" rendered no graph at all, and the User Web CHART widget rendered a text list
 * while its GAUGE widget used a `<meter>` whose stylesheet class was never defined.
 *
 * These assertions pin the shared implementation, not cosmetics: one chart component and
 * one gauge dial exported by the design system, colour resolved through `--iot-*` tokens,
 * and every telemetry surface rendering through them.
 */
describe('shared chart and gauge system', () => {
  it('exports the shared SeriesChart and GaugeDial from the design system', () => {
    const index = read('packages/design-system/src/index.tsx');
    expect(index).toContain('SeriesChart');
    expect(index).toContain('GaugeDial');
    expect(index).toContain('ChartSeries');
    expect(index).toContain('SeriesTone');
  });

  it('resolves chart colour through design tokens instead of a hardcoded hex', () => {
    const chart = read('packages/design-system/src/series-chart.tsx');
    expect(chart).toContain('var(--iot-color-accent)');
    expect(chart).not.toContain('#2dd4bf');
    const gauge = read('packages/design-system/src/gauge-dial.tsx');
    expect(gauge).toContain('var(--iot-color-accent)');
    expect(gauge).not.toContain('#2dd4bf');
  });

  it('routes every admin telemetry surface through the shared chart', () => {
    const surfaces = [
      'apps/admin-web/app/super/telemetry/telemetry-center-content.tsx',
      'apps/admin-web/components/tenant-realtime-content.tsx',
      'apps/admin-web/components/device-detail-content.tsx',
      'apps/admin-web/app/tenant/dashboard/page.tsx',
      'apps/admin-web/components/tenant-historical-content.tsx',
    ];
    for (const file of surfaces) {
      const content = read(file);
      expect(content).toMatch(/import \{[^}]*SeriesChart[^}]*\} from '@iot-platform\/design-system';/s);
      expect(content).toContain('<SeriesChart');
      // The old inline charts hardcoded this colour; a regression reintroduces it.
      expect(content).not.toContain('#2dd4bf');
    }
  });

  it('renders workspace and user-web GAUGE and CHART widgets as real visuals', () => {
    const workspace = read('apps/admin-web/components/tenant-workspace-content.tsx');
    expect(workspace).toContain('<GaugeDial');
    expect(workspace).toContain('<SeriesChart');
    expect(workspace).toMatch(/widget\.kind === 'CHART'/);
    expect(workspace).toMatch(/widget\.kind === 'GAUGE'/);

    const widget = read('apps/user-web/components/widget-card.tsx');
    expect(widget).toContain('<GaugeDial');
    expect(widget).toContain('<SeriesChart');
    // The unstyled native <meter> is what the gauge replaced; it must not come back.
    expect(widget).not.toContain('<meter');
  });

  it('ships widget and chart styles that previously did not exist', () => {
    const styles = read('packages/design-system/src/styles.css');
    for (const selector of [
      '.iot-chart__tooltip',
      '.iot-chart__legend',
      '.iot-gauge-dial',
      '.iot-widget__header',
      '.iot-widget__state',
      '.iot-values',
      '.iot-series li',
      '.iot-table-wrap table',
      '.iot-form-error',
    ]) {
      expect(styles).toContain(selector);
    }
    // The dead donut styles were removed rather than left claiming an unused surface.
    const adapter = read('apps/admin-web/app/design-system-v2.css');
    expect(adapter).not.toContain('.iot2-donut-wrap');
  });
});
