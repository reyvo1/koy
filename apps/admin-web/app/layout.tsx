import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui-polish';
import './globals.css';
import './design-system-v2.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'IoT Platform Admin',
  description:
    'Konsol IoT enterprise untuk Super Admin dan Tenant Admin dengan data backend aktif.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={inter.variable}>
      {/*
        ToastProvider is mounted here, at the single layout that wraps every admin-web route.
        It was defined and exported but never rendered, so `useToast()` resolved to the
        context's default `{ push: () => {} }` in every consumer: six screens (scenes,
        spaces, device groups, schedules, automations and any future one) reported failures
        and successes only to the browser console. A create that returned 409 left the
        operator staring at an unchanged page with no explanation, and a successful create
        looked identical to a button that did nothing. The no-op default is still kept for
        components rendered outside a provider, but no route is one of those any more.
      */}
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
