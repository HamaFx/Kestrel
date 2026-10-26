import path from 'node:path';
import { fileURLToPath } from 'node:url';

import bundleAnalyzer from '@next/bundle-analyzer';

const workspaceRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',

  reactStrictMode: true,

  // This monorepo's lockfile and workspace packages live two levels above
  // apps/web. Explicitly setting the root avoids Turbopack guessing a
  // parent directory outside the repository.
  turbopack: {
    root: workspaceRoot,
  },
  webpack(config, { dev }) {
    if (!dev) {
      config.resolve ??= {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },

  transpilePackages: [
    '@kestrel/shared',
    '@kestrel/db',
    '@kestrel/data',
    '@kestrel/indicators',
    '@kestrel/ai',
    '@kestrel/plugin-backtesting',
    '@kestrel/plugin-custom-agents',
    '@kestrel/plugin-paper-trading',
    '@kestrel/plugin-sdk',
    '@kestrel/plugin-telegram-bot',
    '@kestrel/plugins',
    '@kestrel/config',
  ],

  // Mastra resolves plugin SKILL.md directories at runtime via absolute
  // filesystem paths. Next's static tracer cannot see those reads, so include
  // every bundled plugin's skills folder in the standalone output.
  outputFileTracingIncludes: {
    '/*': [
      '../../plugins/*/skills/**/*',
      '../../node_modules/.pnpm/@jitl+quickjs-wasmfile-release-sync@*/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/*.wasm',
    ],
  },

  // QuickJS ships a separate .wasm file that Next's static tracer cannot see.
  // Keep the package external so Node resolves it from node_modules at runtime,
  // and include the wasm in the standalone output.
  serverExternalPackages: [
    'quickjs-emscripten',
    '@jitl/quickjs-wasmfile-release-sync',
    'pg-boss',
    'pg',
  ],

  typescript: { ignoreBuildErrors: process.env.NEXT_BUILD_SKIP_TYPECHECK === '1' },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.in',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // M-7: Additional security headers
          // M-7: HSTS — 1 year, no preload/subdomains initially.
          // Self-hosters can harden further once HTTPS is confirmed stable.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            // C-3: Baseline CSP (static fallback). The production CSP with
            // per-request nonces is set dynamically in proxy.ts and
            // overrides this header. This static CSP serves as a fallback
            // for requests that bypass middleware.
            // - 'unsafe-eval' REMOVED — blocks arbitrary code execution.
            // - 'strict-dynamic' ADDED — trust propagation from nonce'd scripts.
            // - 'unsafe-inline' retained: Next.js App Router injects inline
            //   <script> tags for hydration that cannot pick up per-request
            //   nonces without framework-level support. The proxy CSP
            //   adds 'nonce-{value}' alongside 'unsafe-inline' for full coverage.
            // L-4: Tightened img-src and connect-src from wildcards to known
            // domains: Supabase Storage, TradingView CDN, and Vercel analytics.
            // The proxy CSP (with nonce) also uses these directives.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://s3.tradingview.com https://d3js.org; style-src 'self' 'unsafe-inline' https://s3.tradingview.com; img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://s3.tradingview.com https://api.dicebear.com; font-src 'self' data:; connect-src 'self' wss: https://*.supabase.co https://*.biquote.io https://*.binance.com https://api.resend.com https://*.tradingview.com https://api.dicebear.com; frame-src 'self' https://*.tradingview.com https://*.s3.tradingview.com https://s.tradingview.com;",
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        // The SW fetches this at install time; it must never come from a stale
        // HTTP cache or the shell would be precached against an old build.
        source: '/sw-precache.json',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        // Home-screen / install-dialog artwork: cheap to revalidate weekly, and
        // it keeps the OS from re-downloading icons on every launch.
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
      {
        source: '/screenshots/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
      {
        source: '/favicon.ico',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ];
  },

  experimental: {
    optimizePackageImports: [
      '@tabler/icons-react',
      'motion',
      'react-markdown',
      'dompurify',
      'shiki',
      'clsx',
      'tailwind-merge',
      'sonner',
      'nuqs',
      'zod',
    ],
    serverActions: { bodySizeLimit: '2mb' },
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error'] } : undefined,
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withBundleAnalyzer(nextConfig);
