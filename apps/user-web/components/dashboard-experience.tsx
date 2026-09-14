'use client';

import { useCallback, useEffect, useState } from 'react';
import { StateNotice } from '@iot-platform/design-system';
import type {
  ClientErrorPayload,
  DashboardExperiencePayload,
} from '../lib/contracts';
import { DashboardGrid } from './dashboard-grid';
import { LoginForm } from './login-form';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'unauthorized' }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string; requestId: string | null }
  | { kind: 'ready'; payload: DashboardExperiencePayload };

export function DashboardExperience() {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });

  const load = useCallback(async (dashboardId?: string) => {
    setState({ kind: 'loading' });
    const query = dashboardId
      ? `?dashboardId=${encodeURIComponent(dashboardId)}`
      : '';

    try {
      const response = await fetch(`/api/dashboard${query}`, {
        cache: 'no-store',
      });
      const payload = (await response.json()) as
        DashboardExperiencePayload | ClientErrorPayload;

      if (response.status === 401) {
        setState({ kind: 'unauthorized' });
        return;
      }

      if (!response.ok) {
        const error = payload as ClientErrorPayload;
        setState(
          error.state === 'offline'
            ? { kind: 'offline', message: error.message }
            : {
                kind: 'error',
                message: error.message,
                requestId: error.requestId,
              },
        );
        return;
      }

      setState({
        kind: 'ready',
        payload: payload as DashboardExperiencePayload,
      });
    } catch {
      setState({
        kind: 'offline',
        message: 'Tidak dapat menghubungi User Web saat ini.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch('/api/session/logout', { method: 'POST' }).catch(() => null);
    setState({ kind: 'unauthorized' });
  }

  if (state.kind === 'loading') {
    return (
      <StateNotice
        description="Dashboard dan data widget sedang dimuat melalui backend yang terotorisasi."
        state="loading"
        title="Memuat dashboard"
      />
    );
  }

  if (state.kind === 'unauthorized') {
    return <LoginForm onAuthenticated={() => load()} />;
  }

  if (state.kind === 'offline') {
    return (
      <StateNotice
        action={
          <button
            className="iot-button"
            onClick={() => void load()}
            type="button"
          >
            Coba lagi
          </button>
        }
        description={state.message}
        state="offline"
        title="Layanan tidak terhubung"
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <StateNotice
        action={
          <button
            className="iot-button"
            onClick={() => void load()}
            type="button"
          >
            Coba lagi
          </button>
        }
        description={`${state.message}${state.requestId ? ` Referensi: ${state.requestId}` : ''}`}
        state="error"
        title="Dashboard gagal dimuat"
      />
    );
  }

  const { payload } = state;

  return (
    <>
      <section className="iot-dashboard-toolbar" aria-label="Kontrol dashboard">
        <div>
          <p className="iot-eyebrow">Tenant-authorized</p>
          <h2>{payload.profile.name ?? payload.profile.email}</h2>
          <p>{payload.profile.email}</p>
        </div>
        <label>
          Dashboard
          <select
            disabled={payload.dashboards.length === 0}
            onChange={(event) => void load(event.target.value)}
            value={payload.selectedDashboardId ?? ''}
          >
            {payload.dashboards.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>
                {dashboard.name}
              </option>
            ))}
          </select>
        </label>
        <div className="iot-toolbar-actions">
          <button
            className="iot-button iot-button--secondary"
            onClick={() => void load(payload.selectedDashboardId ?? undefined)}
            type="button"
          >
            Perbarui
          </button>
          <button
            className="iot-button iot-button--secondary"
            onClick={() => void logout()}
            type="button"
          >
            Keluar
          </button>
        </div>
      </section>

      {!payload.dashboard || !payload.resolution ? (
        <StateNotice
          description="Belum ada dashboard personal atau tenant-shared yang dapat dibaca."
          state="empty"
          title="Dashboard masih kosong"
        />
      ) : (
        <>
          <section className="iot-dashboard-heading">
            <div>
              <p className="iot-eyebrow">{payload.dashboard.audience}</p>
              <h2>{payload.dashboard.name}</h2>
              {payload.dashboard.description ? (
                <p>{payload.dashboard.description}</p>
              ) : null}
            </div>
            <dl>
              <div>
                <dt>Revision</dt>
                <dd>{payload.dashboard.revision}</dd>
              </div>
              <div>
                <dt>Widget siap</dt>
                <dd>
                  {payload.resolution.summary.ready}/
                  {payload.resolution.summary.total}
                </dd>
              </div>
            </dl>
          </section>
          <DashboardGrid
            dashboard={payload.dashboard}
            resolution={payload.resolution}
            widgetData={payload.widgetData}
            onCommandSettled={() =>
              void load(payload.selectedDashboardId ?? undefined)
            }
          />
        </>
      )}
    </>
  );
}
