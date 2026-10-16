import type {
  MobileDashboardExperience,
  MobileDashboardState,
} from '../dashboard';
import {
  dashboardSnapshotKey,
  type MobileSnapshotCache,
} from './mobile-snapshot-cache';

/**
 * The offline read half of the hybrid path.
 *
 * Only the last *validated* dashboard experience is cached, and only when the network load failed
 * for a connectivity reason (`unavailable` + `offline` tone). A rejected session, a permission
 * failure, or a contract violation never falls back to cache — those are answers, not outages, and
 * serving stale data for them would hide a real state from the operator.
 *
 * The cache is keyed per server origin, so pointing the build at a second server (cloud or local)
 * cannot surface the other server's snapshot.
 */

const CACHED_MAX_DASHBOARDS = 50;
const CACHED_MAX_WIDGETS = 100;

export interface MobileOfflineDashboard {
  forget(): Promise<void>;
  read(
    tenantId: string,
    dashboardId: string | null,
  ): Promise<{ cachedAt: string; experience: MobileDashboardExperience } | null>;
  remember(tenantId: string, state: MobileDashboardState): Promise<void>;
}

export function connectMobileOfflineDashboard(deps: {
  apiOrigin: string;
  cache: MobileSnapshotCache;
}): MobileOfflineDashboard {
  return {
    async forget() {
      await deps.cache.clear();
    },
    async read(tenantId, dashboardId) {
      const key = dashboardSnapshotKey(deps.apiOrigin, tenantId, dashboardId);
      const snapshot = await deps.cache.read(key);
      if (!snapshot || !isCachedDashboardExperience(snapshot.payload)) {
        return null;
      }
      return { cachedAt: snapshot.cachedAt, experience: snapshot.payload };
    },
    async remember(tenantId, state) {
      if (state.kind !== 'ready' && state.kind !== 'empty') return;
      const key = dashboardSnapshotKey(
        deps.apiOrigin,
        tenantId,
        state.experience.selectedDashboardId,
      );
      await deps.cache.write(key, state.experience, new Date().toISOString());
    },
  };
}

/**
 * The single decision that gates every cache read: connectivity outages may serve the last
 * snapshot; everything else must render its own state.
 */
export function shouldServeCachedDashboard(state: MobileDashboardState): boolean {
  return state.kind === 'unavailable' && state.notice.tone === 'offline';
}

/**
 * Structural guard for a cached experience: the payload was written only after the full bounded
 * validation, so the read re-checks the shape and the same order-of-magnitude bounds instead of
 * trusting the file. Anything unexpected is treated as "no cache".
 */
export function isCachedDashboardExperience(
  value: unknown,
): value is MobileDashboardExperience {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.dashboards) ||
    record.dashboards.length > CACHED_MAX_DASHBOARDS
  ) {
    return false;
  }
  if (
    typeof record.selectedDashboardId !== 'string' &&
    record.selectedDashboardId !== null
  ) {
    return false;
  }
  if (typeof record.dashboard !== 'object') return false;
  if (
    !record.widgetData ||
    typeof record.widgetData !== 'object' ||
    Array.isArray(record.widgetData) ||
    Object.keys(record.widgetData as Record<string, unknown>).length >
      CACHED_MAX_WIDGETS
  ) {
    return false;
  }
  return true;
}
