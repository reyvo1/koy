'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Client-side forward used by the legacy root page (UAT fix). */
export function AutoForward({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [href, router]);
  return null;
}
