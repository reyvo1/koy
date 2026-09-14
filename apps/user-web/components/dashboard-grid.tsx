import { useEffect, useMemo, useState } from 'react';
import type {
  DashboardAggregate,
  DashboardBreakpoint,
  DashboardLayout,
  DashboardResolution,
  WidgetData,
} from '../lib/contracts';
import { WidgetCard } from './widget-card';

interface DashboardGridProps {
  dashboard: DashboardAggregate;
  resolution: DashboardResolution;
  widgetData: Record<string, WidgetData>;
  onCommandSettled?: () => void;
}

export function DashboardGrid({
  dashboard,
  resolution,
  widgetData,
  onCommandSettled,
}: DashboardGridProps) {
  const breakpoint = useViewportBreakpoint();
  const layout = selectLayout(dashboard.layouts, breakpoint);
  const widgets = useMemo(
    () => new Map(resolution.widgets.map((widget) => [widget.id, widget])),
    [resolution.widgets],
  );

  if (!layout || layout.items.length === 0) {
    return (
      <p className="iot-widget__message">Dashboard belum memiliki layout.</p>
    );
  }

  const orderedItems = [...layout.items].sort((left, right) =>
    left.y === right.y ? left.x - right.x : left.y - right.y,
  );

  return (
    <section
      aria-label="Widget dashboard"
      className="iot-dashboard-grid"
      style={
        {
          '--iot-dashboard-columns': layout.columns,
          '--iot-dashboard-gap': `${layout.gap}px`,
          '--iot-dashboard-row-height': `${layout.rowHeight}px`,
        } as React.CSSProperties
      }
    >
      {orderedItems.map((item) => {
        const widget = widgets.get(item.widgetId);
        const data = widgetData[item.widgetId];
        if (!widget || !data) return null;

        const width = Math.min(Math.max(item.width, 1), layout.columns);
        const start = Math.min(Math.max(item.x + 1, 1), layout.columns);

        return (
          <div
            className="iot-dashboard-grid__item"
            key={item.id}
            style={{
              gridColumn: `${start} / span ${Math.min(width, layout.columns - start + 1)}`,
              gridRow: `span ${Math.max(item.height, 1)}`,
            }}
          >
            <WidgetCard
              data={data}
              onCommandSettled={onCommandSettled}
              resolution={widget}
            />
          </div>
        );
      })}
    </section>
  );
}

function useViewportBreakpoint(): DashboardBreakpoint {
  const [breakpoint, setBreakpoint] = useState<DashboardBreakpoint>('MOBILE');

  useEffect(() => {
    const update = () => {
      setBreakpoint(
        window.innerWidth >= 1024
          ? 'DESKTOP'
          : window.innerWidth >= 640
            ? 'TABLET'
            : 'MOBILE',
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return breakpoint;
}

function selectLayout(
  layouts: DashboardLayout[],
  breakpoint: DashboardBreakpoint,
): DashboardLayout | null {
  return (
    layouts.find((layout) => layout.breakpoint === breakpoint) ??
    layouts.find((layout) => layout.breakpoint === 'DESKTOP') ??
    layouts[0] ??
    null
  );
}
