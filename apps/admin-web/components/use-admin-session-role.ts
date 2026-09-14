'use client';

import { useEffect, useState } from 'react';

/**
 * UX-only session role hint from the Admin Web HttpOnly role cookie.
 * Backend authorization guards remain the security boundary.
 */
export function useAdminSessionRole(): string | null | undefined {
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/session/me', { cache: 'no-store' })
      .then((response) => response.json())
      .then((body: { role?: string | null }) => {
        if (!cancelled) setRole(body.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return role;
}
