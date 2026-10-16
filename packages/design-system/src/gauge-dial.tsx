'use client';

import type { CSSProperties } from 'react';

/**
 * Shared gauge dial for GAUGE widgets.
 *
 * Replaces the two unrelated renderings this project had grown: a bare HTML `<meter>`
 * whose `iot-gauge` class was never defined anywhere, and a div progress bar in the
 * mobile app. A semicircular SVG arc reads as a real instrument, resolves its colours
 * through the design-system tokens, and labels min/max so a value has meaning.
 */

export type GaugeTone = 'accent' | 'success' | 'warning' | 'danger';

export interface GaugeDialProps {
  value: number;
  min?: number;
  max?: number;
  unit?: string | null;
  precision?: number;
  label?: string;
  tone?: GaugeTone;
  ariaLabel?: string;
}

const TONE_VAR: Record<GaugeTone, string> = {
  accent: 'var(--iot-color-accent)',
  success: 'var(--iot-color-success)',
  warning: 'var(--iot-color-warning)',
  danger: 'var(--iot-color-danger)',
};

const CENTER = { x: 100, y: 96 };
const RADIUS = 74;

export function GaugeDial({
  value,
  min = 0,
  max = 100,
  unit = null,
  precision,
  label,
  tone = 'accent',
  ariaLabel,
}: GaugeDialProps) {
  const span = max - min || 1;
  const ratio = Math.min(Math.max((value - min) / span, 0), 1);
  const start = polar(180);
  const end = polar(180 + ratio * 180);
  const track = `M${polar(180).x},${polar(180).y} A${RADIUS},${RADIUS} 0 0 1 ${polar(360).x},${polar(360).y}`;
  const arc =
    ratio > 0
      ? `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${RADIUS},${RADIUS} 0 ${ratio > 0.5 ? 1 : 0} 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`
      : '';

  const readout = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: precision ?? 1,
  }).format(value);
  const edge = (edgeValue: number) =>
    new Intl.NumberFormat('id-ID', { maximumFractionDigits: precision ?? 1 }).format(edgeValue);

  const strokeStyle: CSSProperties = { fill: 'none', strokeLinecap: 'round' };

  return (
    <div className="iot-gauge-dial">
      <svg
        aria-label={ariaLabel ?? `${label ?? 'Gauge'}: ${readout}${unit ? ` ${unit}` : ''} (${edge(min)}–${edge(max)})`}
        role="img"
        style={{ width: '100%', maxWidth: '15rem', display: 'block' }}
        viewBox="0 0 200 118"
      >
        <path d={track} stroke="var(--iot-color-border)" strokeWidth={9} style={strokeStyle} />
        {arc ? <path d={arc} stroke={TONE_VAR[tone]} strokeWidth={9} style={strokeStyle} /> : null}
        <text
          fill="var(--iot-color-text-strong)"
          fontSize={26}
          fontWeight={800}
          textAnchor="middle"
          x={CENTER.x}
          y={CENTER.y - 6}
        >
          {readout}
        </text>
        {unit ? (
          <text fill="var(--iot-color-muted)" fontSize={11.5} textAnchor="middle" x={CENTER.x} y={CENTER.y + 12}>
            {unit}
          </text>
        ) : null}
        <text fill="var(--iot-color-subtle)" fontSize={10.5} textAnchor="start" x={8} y={114}>
          {edge(min)}
        </text>
        <text fill="var(--iot-color-subtle)" fontSize={10.5} textAnchor="end" x={192} y={114}>
          {edge(max)}
        </text>
      </svg>
      {label ? <p className="iot-gauge-dial__label">{label}</p> : null}
    </div>
  );
}

function polar(degrees: number): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTER.x + RADIUS * Math.cos(radians),
    y: CENTER.y + RADIUS * Math.sin(radians),
  };
}
