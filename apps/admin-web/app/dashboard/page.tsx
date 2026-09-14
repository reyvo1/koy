import { redirect } from 'next/navigation';

/** Legacy route kept for bookmarks; canonical dashboard lives under /tenant. */
export default function LegacyDashboardPage() {
  redirect('/tenant/dashboard');
}
