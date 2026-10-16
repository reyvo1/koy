'use client';

import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Shared series chart for every telemetry surface.
 *
 * Why this exists: four admin screens had copy-pasted inline SVG charts with a hardcoded
 * teal hex, no axes, no gridlines, no tooltips and no legend — and the user-facing
 * CHART widget rendered a text list instead of a graph. This component is the single
 * token-aware implementation: it resolves every colour through the design-system CSS
 * variables, so dark and light themes both work, and it degrades honestly (empty state,
 * single point, malformed timestamps) instead of drawing something confident and wrong.
 */

export type SeriesTone = 'accent' | 'info' | 'success' | 'warning' | 'danger';

export interface ChartPoint {
  /** ISO timestamp for the bucket or reading. */
  at: string;
  value: number;
}

export interface ChartSeries {
  key: string;
  label?: string;
  tone?: SeriesTone;
  points: ChartPoint[];
}

export interface ChartBand {
  upper: ChartPoint[];
  lower: ChartPoint[];
}

export interface SeriesChartProps {
  series: ChartSeries[];
  ariaLabel: string;
  band?: ChartBand;
  height?: number;
  unit?: string | null;
  precision?: number;
  showAxis?: boolean;
  smooth?: boolean;
  emptyMessage?: string;
}

const VIEW_WIDTH = 640;

const TONE_VAR: Record<SeriesTone, string> = {
  accent: 'var(--iot-color-accent)',
  info: 'var(--iot-color-info)',
  success: 'var(--iot-color-success)',
  warning: 'var(--iot-color-warning)',
  danger: 'var(--iot-color-danger)',
};

interface NormalizedPoint {
  at: string;
  value: number;
  time: number | null;
  x: number;
  y: number;
}

interface NormalizedSeries {
  key: string;
  label: string;
  tone: SeriesTone;
  points: NormalizedPoint[];
}

function toTime(at: string): number | null {
  const time = Date.parse(at);
  return Number.isFinite(time) ? time : null;
}

export function SeriesChart({
  series,
  ariaLabel,
  band,
  height = 240,
  unit = null,
  precision,
  showAxis = true,
  smooth = true,
  emptyMessage = 'Belum ada data untuk grafik ini.',
}: SeriesChartProps) {
  const gradientId = `iot-chart-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [hover, setHover] = useState<number | null>(null);

  const normalized = useMemo<NormalizedSeries[]>(
    () =>
      series.map((entry) => ({
        key: entry.key,
        label: entry.label ?? entry.key,
        tone: entry.tone ?? 'accent',
        points: entry.points
          .filter((point) => Number.isFinite(point.value))
          .map((point) => ({
            at: point.at,
            value: point.value,
            time: toTime(point.at),
            x: 0,
            y: 0,
          })),
      })),
    [series],
  );

  const normalizedBand = useMemo(() => {
    if (!band) return null;
    const upper = band.upper
      .filter((point) => Number.isFinite(point.value))
      .map((point) => ({ at: point.at, value: point.value, time: toTime(point.at), x: 0, y: 0 }));
    const lower = band.lower
      .filter((point) => Number.isFinite(point.value))
      .map((point) => ({ at: point.at, value: point.value, time: toTime(point.at), x: 0, y: 0 }));
    return upper.length > 1 && lower.length > 1 ? { upper, lower } : null;
  }, [band]);

  const geometry = useMemo(() => {
    const pad = showAxis
      ? { t: 14, r: 18, b: 28, l: 56 }
      : { t: 10, r: 6, b: 8, l: 6 };
    const plotWidth = VIEW_WIDTH - pad.l - pad.r;
    const plotHeight = height - pad.t - pad.b;

    const allPoints = normalized.flatMap((entry) => entry.points);
    const bandPoints = normalizedBand
      ? [...normalizedBand.upper, ...normalizedBand.lower]
      : [];
    const values = [...allPoints, ...bandPoints].map((point) => point.value);
    if (values.length === 0) return null;

    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (hi - lo < 1e-9) {
      const spread = Math.abs(hi) > 0 ? Math.abs(hi) * 0.2 : 1;
      lo -= spread;
      hi += spread;
    }
    const ticks = niceTicks(lo, hi, 4);
    const domainLo = Math.min(lo, ticks[0] ?? lo);
    const domainHi = Math.max(hi, ticks[ticks.length - 1] ?? hi);

    const spans = allPoints.map((point) => point.time).filter((time): time is number => time !== null);
    const timeBased = spans.length === allPoints.length && allPoints.length > 0;
    const timeLo = timeBased ? Math.min(...spans) : 0;
    const timeHi = timeBased ? Math.max(...spans) : 0;
    const timeRange = timeHi - timeLo;

    const placeX = (point: { time: number | null }, index: number, length: number) =>
      timeBased && point.time !== null && timeRange > 0
        ? pad.l + ((point.time - timeLo) / timeRange) * plotWidth
        : length > 1
          ? pad.l + (index / (length - 1)) * plotWidth
          : pad.l + plotWidth / 2;
    const yFor = (value: number) =>
      pad.t + (1 - (value - domainLo) / (domainHi - domainLo || 1)) * plotHeight;
    const assign = (points: NormalizedPoint[]) => {
      points.forEach((point, index) => {
        point.x = placeX(point, index, points.length);
        point.y = yFor(point.value);
      });
    };

    for (const entry of normalized) assign(entry.points);
    if (normalizedBand) {
      assign(normalizedBand.upper);
      assign(normalizedBand.lower);
    }

    return {
      pad,
      plotWidth,
      plotHeight,
      ticks,
      domainLo,
      domainHi,
      yFor,
      timeBased,
      timeLo,
      timeSpan: timeRange,
    };
  }, [height, normalized, normalizedBand, showAxis]);

  const hasData = normalized.some((entry) => entry.points.length > 0);

  const hoverInfo = useMemo(() => {
    if (hover === null || !geometry) return null;
    const target = hover;
    const entries = normalized
      .map((entry) => {
        if (entry.points.length === 0) return null;
        let nearest = entry.points[0];
        let best = Number.POSITIVE_INFINITY;
        entry.points.forEach((point, index) => {
          const distance = geometry.timeBased
            ? Math.abs((point.time ?? 0) - target)
            : Math.abs(index - target);
          if (distance < best) {
            best = distance;
            nearest = point;
          }
        });
        return { key: entry.key, label: entry.label, tone: entry.tone, point: nearest };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (entries.length === 0) return null;
    return { entries, x: entries[0].point.x, at: entries[0].point.at };
  }, [geometry, hover, normalized]);

  if (!hasData || !geometry) {
    return (
      <div className="iot-empty iot-chart__empty" role="status">
        <p className="iot-empty__body">{emptyMessage}</p>
      </div>
    );
  }

  const { pad, plotHeight, ticks, yFor, timeBased, timeLo, timeSpan } = geometry;
  const baseY = pad.t + plotHeight;
  const formatValue = (value: number) => formatAxisValue(value, precision);

  const xTickLabels = (() => {
    const primary = normalized.find((entry) => entry.points.length > 1) ?? normalized.find((entry) => entry.points.length > 0);
    if (!primary || !showAxis) return [] as Array<{ x: number; text: string }>;
    const points = primary.points;
    if (points.length === 1) return [{ x: points[0].x, text: formatTimeTick(points[0].at, timeSpan) }];
    const count = Math.min(5, points.length);
    const indices = new Set<number>();
    for (let step = 0; step < count; step += 1) {
      indices.add(Math.round((step / (count - 1)) * (points.length - 1)));
    }
    return [...indices]
      .sort((a, b) => a - b)
      .map((index) => ({ x: points[index].x, text: formatTimeTick(points[index].at, timeSpan) }));
  })();

  const handlePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!showAxis) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    if (timeBased && timeSpan > 0) {
      setHover(timeLo + ((x - pad.l) / geometry.plotWidth) * timeSpan);
    } else {
      const step = geometry.plotWidth / Math.max((normalized.find((entry) => entry.points.length > 1)?.points.length ?? 1) - 1, 1);
      setHover(Math.round((x - pad.l) / step));
    }
  };

  return (
    <div className="iot-chart">
      <svg
        aria-label={ariaLabel}
        height={showAxis ? undefined : height}
        onPointerLeave={showAxis ? () => setHover(null) : undefined}
        onPointerMove={showAxis ? handlePointer : undefined}
        preserveAspectRatio={showAxis ? 'xMidYMid meet' : 'none'}
        role="img"
        style={showAxis ? { width: '100%', height: 'auto', display: 'block' } : { width: '100%', height: `${height}px`, display: 'block' }}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      >
        <defs>
          {normalized.map((entry, index) => (
            <linearGradient
              id={`${gradientId}-${index}`}
              key={entry.key}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" style={{ stopColor: TONE_VAR[entry.tone], stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: TONE_VAR[entry.tone], stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>

        {showAxis &&
          ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={`grid-${tick}`}>
                <line
                  stroke="var(--iot-color-border)"
                  strokeOpacity={0.65}
                  x1={pad.l}
                  x2={VIEW_WIDTH - pad.r}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="var(--iot-color-subtle)"
                  fontSize={10.5}
                  textAnchor="end"
                  x={pad.l - 8}
                  y={y + 3.5}
                >
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

        {showAxis &&
          xTickLabels.map((tick) => (
            <text
              fill="var(--iot-color-subtle)"
              fontSize={10.5}
              key={`xtick-${tick.x}-${tick.text}`}
              textAnchor={tick.x <= pad.l + 1 ? 'start' : tick.x >= VIEW_WIDTH - pad.r - 1 ? 'end' : 'middle'}
              x={tick.x}
              y={height - 8}
            >
              {tick.text}
            </text>
          ))}

        {normalizedBand && (
          <path
            d={bandPath(normalizedBand.upper, normalizedBand.lower, baseY)}
            style={{ fill: 'var(--iot-color-accent-soft)' }}
            stroke="none"
          />
        )}

        {normalized.map((entry, index) => {
          if (entry.points.length === 0) return null;
          const line = linePath(entry.points, smooth);
          const first = entry.points[0];
          const last = entry.points[entry.points.length - 1];
          return (
            <g key={entry.key}>
              {entry.points.length > 1 && (
                <path
                  d={`${line} L${last.x.toFixed(1)},${baseY} L${first.x.toFixed(1)},${baseY} Z`}
                  fill={`url(#${gradientId}-${index})`}
                  stroke="none"
                />
              )}
              <path
                d={line}
                fill="none"
                stroke={TONE_VAR[entry.tone]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.25}
                vectorEffect={showAxis ? undefined : 'non-scaling-stroke'}
              />
              <circle
                cx={last.x}
                cy={last.y}
                fill="var(--iot-color-surface)"
                r={3.5}
                stroke={TONE_VAR[entry.tone]}
                strokeWidth={2}
              />
            </g>
          );
        })}

        {hoverInfo && showAxis && (
          <g pointerEvents="none">
            <line
              stroke="var(--iot-color-border-strong)"
              strokeDasharray="3 3"
              x1={hoverInfo.x}
              x2={hoverInfo.x}
              y1={pad.t}
              y2={baseY}
            />
            {hoverInfo.entries.map((entry) => (
              <circle
                cx={entry.point.x}
                cy={entry.point.y}
                fill={TONE_VAR[entry.tone]}
                key={entry.key}
                r={3.5}
                stroke="var(--iot-color-bg-elevated)"
                strokeWidth={1.5}
              />
            ))}
          </g>
        )}
      </svg>

      {hoverInfo && showAxis && (
        <div
          className="iot-chart__tooltip"
          style={{
            left: `${(hoverInfo.x / VIEW_WIDTH) * 100}%`,
            transform:
              hoverInfo.x / VIEW_WIDTH > 0.68
                ? 'translateX(calc(-100% - 8px))'
                : hoverInfo.x / VIEW_WIDTH < 0.32
                  ? 'translateX(8px)'
                  : 'translateX(-50%)',
          }}
        >
          <p className="iot-chart__tooltip-time">{formatTimeFull(hoverInfo.at)}</p>
          {hoverInfo.entries.map((entry) => (
            <p className="iot-chart__tooltip-row" key={entry.key}>
              <span aria-hidden="true" className="iot-chart__swatch" style={{ background: TONE_VAR[entry.tone] }} />
              <span className="iot-chart__tooltip-label">{entry.label}</span>
              <strong>
                {formatAxisValue(entry.point.value, precision)}
                {unit ? ` ${unit}` : ''}
              </strong>
            </p>
          ))}
        </div>
      )}

      {normalized.length > 1 && (
        <p className="iot-chart__legend">
          {normalized.map((entry) => (
            <span className="iot-chart__legend-item" key={entry.key}>
              <span aria-hidden="true" className="iot-chart__swatch" style={{ background: TONE_VAR[entry.tone] }} />
              {entry.label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function linePath(points: Array<{ x: number; y: number }>, smooth: boolean): string {
  if (points.length === 0) return '';
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 1) return path;
  if (!smooth) {
    for (const point of points.slice(1)) {
      path += `L${point.x.toFixed(1)},${point.y.toFixed(1)}`;
    }
    return path;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    path += ` C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)},${(p1.y + (p2.y - p0.y) / 6).toFixed(1)} ${(
      p2.x -
      (p3.x - p1.x) / 6
    ).toFixed(1)},${(p2.y - (p3.y - p1.y) / 6).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

function bandPath(
  upper: Array<{ x: number; y: number }>,
  lower: Array<{ x: number; y: number }>,
  _baseY: number,
): string {
  const forward = upper.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const backward = [...lower]
    .reverse()
    .map((point) => `L${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  return `${forward} ${backward} Z`;
}

export function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const rawStep = span / count;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / power;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * power;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= hi + step * 1e-6 && ticks.length < 8; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
}

export function formatAxisValue(value: number, precision?: number): string {
  const abs = Math.abs(value);
  if (abs >= 10000) {
    return new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: precision ?? (abs >= 100 ? 0 : 1),
  }).format(value);
}

export function formatTimeTick(at: string, spanMs: number): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const options: Intl.DateTimeFormatOptions =
    spanMs > 48 * 60 * 60 * 1000
      ? { day: '2-digit', month: 'short' }
      : { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat('id-ID', options).format(date);
}

export function formatTimeFull(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
