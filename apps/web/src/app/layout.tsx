/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Metadata, Viewport } from 'next';
import { ViewTransitions } from 'next-view-transitions';

import { Providers } from '@/components/providers';
import { PWA_THEME_COLOR } from '@/lib/pwa/pwa-theme';
import { SPLASH_LINKS } from '@/lib/pwa/splash-links';

import './globals.css';

function resolveMetadataBase(): URL {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!raw) return new URL('http://localhost:3000');

  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return new URL('http://localhost:3000');
  }
}

const metadataBase = resolveMetadataBase();
const socialImage = '/brand/kestrel-social.png';

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: 'Kestrel',
    template: '%s · Kestrel',
  },
  description: 'AI market intelligence for gold, forex, and crypto.',
  applicationName: 'Kestrel',
  category: 'finance',
  keywords: ['Kestrel', 'AI market intelligence', 'gold', 'forex', 'crypto', 'trading'],
  openGraph: {
    type: 'website',
    siteName: 'Kestrel',
    title: 'Kestrel — AI market intelligence',
    description: 'See the market clearly with live context for gold, forex, and crypto.',
    ...(socialImage
      ? {
          images: [
            {
              url: socialImage,
              width: 1200,
              height: 630,
              alt: 'Kestrel — AI market intelligence for gold, forex, and crypto',
            },
          ],
        }
      : {}),
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kestrel — AI market intelligence',
    description: 'Live market context for gold, forex, and crypto.',
    ...(socialImage ? { images: [socialImage] } : {}),
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  // Home-screen web app behaviour. iOS 26 opens every Home Screen entry as a
  // web app by default, but the title under the icon and the status-bar
  // treatment still come from here; 'black-translucent' lets the app paint
  // under the status bar, which the shell already handles with pt-safe/pb-safe
  // insets. Next 16 renders `capable` as the standardized
  // `mobile-web-app-capable` meta tag (Chromium + iOS both read it), so no
  // extra `metadata.other` entry is needed.
  appleWebApp: {
    capable: true,
    title: 'Kestrel',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // iPad home screens pick the closest size; without the 152/167 variants
    // iOS has to downscale the 180px iPhone asset.
    apple: [
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180' },
      { url: '/icons/apple-touch-icon-167.png', sizes: '167x167' },
      { url: '/icons/apple-touch-icon-152.png', sizes: '152x152' },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: PWA_THEME_COLOR,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-brand="kestrel" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/fonts/funnel-sans-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/funnel-display-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/geist-mono-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/redaction-35-italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/bebas-neue-latin-400-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* iOS launch images — one per device/orientation from the shared
            matrix in src/lib/pwa/splash-devices.json. A single image reused
            for every media query stretches the artwork on other devices. */}
        {SPLASH_LINKS.map((link) => (
          <link
            key={link.href + link.media}
            rel="apple-touch-startup-image"
            media={link.media}
            href={link.href}
          />
        ))}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Kestrel',
              applicationCategory: 'FinanceApplication',
              operatingSystem: 'All',
              description:
                'AI-driven trading copilot and market intelligence for gold, forex, and crypto.',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
              },
            }),
          }}
        />
      </head>
      <body className="bg-bg text-fg min-h-svh antialiased">
        <ViewTransitions>
          <Providers>{children}</Providers>
        </ViewTransitions>
      </body>
    </html>
  );
}
