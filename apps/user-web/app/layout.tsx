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
    // data-theme="light" is the documented opt-in for user-facing surfaces: the design
    // system is dark-first for the admin console, and light is chosen explicitly here
    // rather than inherited, so User Web keeps its intended light appearance while
    // sharing one token set with the rest of the product.
    <html lang="id" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
