/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@iot-platform/design-system'],
  // Local development is reached through the loopback IP (scripts and docs print
  // http://127.0.0.1:5001). Next 16 blocks its own dev resources for any origin it does
  // not recognise, and a blocked client bundle means the page never hydrates: the login
  // form then falls back to a native GET submit and leaks the password into the URL.
  // Both spellings of loopback must therefore be declared explicitly.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '[::1]'],
  // Security headers. The API server sets none of these and the nginx template did not
  // either, so without this block the console ships with no clickjacking, sniffing,
  // referrer or CSP protection. HSTS is intentionally omitted here because this header
  // is also served over plain http on the dev origin, where it would pin the browser to
  // a scheme that does not exist; TLS termination owns HSTS for the real host.
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
              // Next injects inline bootstrap scripts for hydration; the app ships no
              // third-party script. React's *development* build additionally calls eval()
              // to reconstruct component stacks across the server/browser boundary, so the
              // dev origin needs 'unsafe-eval' or every page load logs "eval() is not
              // supported in this environment". Production React never uses eval(), so the
              // production origin keeps the strict policy — the escape hatch is scoped to
              // the environment that actually requires it and never widens past 'self'.
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
