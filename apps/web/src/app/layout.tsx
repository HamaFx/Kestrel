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

import './globals.css';

function resolveMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL;
  if (!raw) return undefined;

  try {
    return new URL(raw);
  } catch {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[metadata] ignoring invalid NEXT_PUBLIC_APP_URL/APP_URL');
    }
    return undefined;
  }
}

const metadataBase = resolveMetadataBase();
const socialImage = metadataBase ? '/brand/kestrel-social.png' : undefined;

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
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
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon-180.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-brand="kestrel"
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="dark" />
        <link rel="preload" href="/fonts/funnel-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/funnel-display-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/geist-mono-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/redaction-35-italic.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/bebas-neue-latin-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* iPhone 14 & 15 Pro */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 14 & 15 Pro Max */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 12 & 13 Pro, iPhone 14 */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPhone 12 & 13 Pro Max, iPhone 14 Plus */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPad Pro 12.9" */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
        {/* iPad Pro 11" */}
        <link
          rel="apple-touch-startup-image"
          media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
          href="/icons/apple-splash-1179x2556.png"
        />
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
