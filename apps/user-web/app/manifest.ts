import type { MetadataRoute } from 'next';

/** PWA manifest — user-web installable di HP (blueprint mobile UX). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IoT Platform — User Workspace',
    short_name: 'IoT Platform',
    description: 'Monitoring dan kontrol perangkat tenant Anda',
    start_url: '/beranda',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#14b8a6',
    icons: [
      { src: '/icon.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
