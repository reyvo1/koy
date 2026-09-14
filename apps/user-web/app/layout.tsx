import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'IoT Platform User Web',
  description:
    'Dashboard tenant yang responsif dan capability-driven untuk monitoring perangkat.',
};

export const viewport = {
  themeColor: '#14b8a6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
