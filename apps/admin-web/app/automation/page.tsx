import { redirect } from 'next/navigation';

/** Legacy route kept for compatibility. */
export default function LegacyAutomationPage() {
  redirect('/tenant/otomatisasi');
}
