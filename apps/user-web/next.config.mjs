/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@iot-platform/design-system'],
  // See apps/admin-web/next.config.mjs: the loopback IP must be an allowed dev origin,
  // otherwise Next 16 blocks the client bundle and the page never hydrates.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '[::1]'],
  // Same header set as the admin console; see apps/admin-web/next.config.mjs for why
  // HSTS is left to TLS termination.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // See apps/admin-web/next.config.mjs: React's development build calls eval()
              // to reconstruct component stacks, so only the dev origin gets 'unsafe-eval'.
              // Production keeps the strict policy and stays pinned to 'self'.
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
              }`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
