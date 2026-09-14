import { redirect } from 'next/navigation';

/** Compatibility route. The current backend-backed surface is analytics findings, not notification delivery. */
export default function LegacyNotificationsPage() {
  redirect('/tenant/temuan');
}
