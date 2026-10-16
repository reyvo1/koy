/**
 * Shared mobile palette.
 *
 * The mobile app follows the same token intent as the web design system
 * (`--iot-*`), expressed as plain objects because React Native has no CSS
 * custom properties. Every surface takes its colors from here so light and
 * dark mode stay one code path instead of parallel `xDark` style objects.
 */
export interface MobilePalette {
  accent: string;
  accentContrast: string;
  accentSoft: string;
  background: string;
  border: string;
  borderStrong: string;
  danger: string;
  dangerSoft: string;
  info: string;
  muted: string;
  subtle: string;
  success: string;
  successSoft: string;
  surface: string;
  surfaceSubtle: string;
  text: string;
  textStrong: string;
  track: string;
  warning: string;
  warningSoft: string;
}

const light: MobilePalette = {
  accent: '#0f766e',
  accentContrast: '#ffffff',
  accentSoft: '#ccfbf1',
  background: '#f5f7fb',
  border: '#dbe3ef',
  borderStrong: '#94a3b8',
  danger: '#b91c1c',
  dangerSoft: 'rgba(185, 28, 28, 0.12)',
  info: '#1d4ed8',
  muted: '#64748b',
  subtle: '#94a3b8',
  success: '#15803d',
  successSoft: 'rgba(21, 128, 61, 0.12)',
  surface: '#ffffff',
  surfaceSubtle: '#f1f5f9',
  text: '#334155',
  textStrong: '#0f172a',
  track: '#e2e8f0',
  warning: '#a16207',
  warningSoft: 'rgba(161, 98, 7, 0.14)',
};

const dark: MobilePalette = {
  accent: '#2dd4bf',
  accentContrast: '#04211f',
  accentSoft: 'rgba(45, 212, 191, 0.2)',
  background: '#111827',
  border: '#334155',
  borderStrong: '#64748b',
  danger: '#f87171',
  dangerSoft: 'rgba(248, 113, 113, 0.16)',
  info: '#60a5fa',
  muted: '#cbd5e1',
  subtle: '#94a3b8',
  success: '#34d399',
  successSoft: 'rgba(52, 211, 153, 0.16)',
  surface: '#1e293b',
  surfaceSubtle: '#0f172a',
  text: '#e2e8f0',
  textStrong: '#f8fafc',
  track: '#334155',
  warning: '#fbbf24',
  warningSoft: 'rgba(251, 191, 36, 0.16)',
};

export function mobilePalette(isDark: boolean): MobilePalette {
  return isDark ? dark : light;
}

export function chartTones(palette: MobilePalette): string[] {
  return [palette.accent, palette.info, palette.warning, palette.success];
}

export function stateTone(
  palette: MobilePalette,
  state: string,
): { backgroundColor: string; color: string } {
  if (state === 'READY') {
    return { backgroundColor: palette.successSoft, color: palette.success };
  }
  if (state === 'STALE') {
    return { backgroundColor: palette.warningSoft, color: palette.warning };
  }
  if (state === 'ERROR' || state === 'INVALID') {
    return { backgroundColor: palette.dangerSoft, color: palette.danger };
  }
  return { backgroundColor: palette.track, color: palette.muted };
}
