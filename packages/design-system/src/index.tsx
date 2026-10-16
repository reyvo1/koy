import type { ReactNode } from 'react';

export type InterfaceState =
  'loading' | 'empty' | 'stale' | 'unauthorized' | 'offline' | 'error';

export interface ApplicationShellProps {
  productName: string;
  surfaceName: string;
  statusLabel?: string;
  /**
   * Optional primary navigation rendered between the header and the main landmark.
   * Additive on purpose: loading/error/not-found surfaces pass no nav and keep their
   * current chrome, while navigable surfaces (User Web) get the same frame plus a
   * real menu instead of a second, hand-rolled shell.
   */
  nav?: ReactNode;
  children: ReactNode;
}

export interface StateNoticeProps {
  state: InterfaceState;
  title: string;
  description: string;
  action?: ReactNode;
}

export interface SurfaceCardProps {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}

export function ApplicationShell({
  productName,
  surfaceName,
  statusLabel = 'Foundation',
  nav,
  children,
}: ApplicationShellProps) {
  return (
    <div className="iot-shell">
      <a className="iot-skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="iot-shell__header">
        <div>
          <p className="iot-eyebrow">{productName}</p>
          <h1>{surfaceName}</h1>
        </div>
        <span className="iot-environment-badge">{statusLabel}</span>
      </header>
      {nav ? <div className="iot-shell__nav">{nav}</div> : null}
      <main className="iot-shell__main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

export function SurfaceCard({ title, eyebrow, children }: SurfaceCardProps) {
  return (
    <section className="iot-card">
      {eyebrow ? <p className="iot-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      <div className="iot-card__content">{children}</div>
    </section>
  );
}

export function StateNotice({
  state,
  title,
  description,
  action,
}: StateNoticeProps) {
  const isAlert = state === 'error' || state === 'unauthorized';

  return (
    <section
      aria-live={isAlert ? 'assertive' : 'polite'}
      className="iot-state-notice"
      data-state={state}
      role={isAlert ? 'alert' : 'status'}
    >
      <span aria-hidden="true" className="iot-state-notice__marker" />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {action ? (
          <div className="iot-state-notice__action">{action}</div>
        ) : null}
      </div>
    </section>
  );
}

export { CameraPlayer } from './camera-player';
export { GaugeDial, type GaugeDialProps, type GaugeTone } from './gauge-dial';
export { GeoMap, type MapLocation } from './geo-map';
export {
  SeriesChart,
  type ChartBand,
  type ChartPoint,
  type ChartSeries,
  type SeriesChartProps,
  type SeriesTone,
} from './series-chart';

export { ConfirmationDialog } from './confirmation-dialog';
export { CapabilityValueInput } from './capability-value-input';
