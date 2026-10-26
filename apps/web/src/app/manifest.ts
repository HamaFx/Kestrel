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

// SPDX-License-Identifier: Apache-2.0

// Web app manifest served at /manifest.webmanifest (Next metadata route).
//
// Contract notes (see docs/pwa.md):
//   - `id` pins the installed app identity. Without it the browser derives the
//     id from `start_url`, so a future start_url change would register as a
//     *different* app (duplicate home-screen entries, orphaned push subs).
//   - `display_override` adds the desktop window-controls-overlay experience;
//     `display: standalone` stays as the fallback every browser understands.
//   - Screenshots need at least one `wide` entry or Chrome refuses the richer
//     install dialog on desktop; `description` + screenshots unlock it on
//     Android.
//   - Colours come from src/lib/pwa/pwa-theme.json, which mirrors globals.css.
//     test/pwa-brand-contract.test.ts fails if they drift.
//   - test/pwa-manifest.test.ts asserts every referenced asset exists and the
//     shortcut URLs stay route-valid.

import type { MetadataRoute } from 'next';

import { PWA_BACKGROUND, PWA_THEME_COLOR } from '@/lib/pwa/pwa-theme';

const SHORTCUT_ICON = { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' } as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Kestrel · AI market intelligence',
    short_name: 'Kestrel',
    description: 'AI market intelligence for gold, forex, and crypto',
    lang: 'en',
    dir: 'ltr',
    scope: '/',
    start_url: '/chat',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    // `portrait` locked tablets and desktop windows into portrait; the chart
    // and journal surfaces are used in landscape too.
    orientation: 'any',
    background_color: PWA_BACKGROUND,
    theme_color: PWA_THEME_COLOR,
    categories: ['finance', 'productivity'],
    prefer_related_applications: false,
    launch_handler: { client_mode: ['navigate-existing', 'auto'] },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // iOS 17.2+ prefers a high-resolution full-bleed icon over the
      // legacy apple-touch-icon when picking the home-screen artwork.
      { src: '/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/screenshots/chat.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'AI trading chat',
      },
      {
        src: '/screenshots/dashboard.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Trading dashboard',
      },
      {
        src: '/screenshots/chat-wide.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'AI trading desk on desktop',
      },
      {
        src: '/screenshots/dashboard-wide.png',
        sizes: '1920x1080',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Market overview on desktop',
      },
    ],
    shortcuts: [
      {
        name: 'Ask the desk',
        short_name: 'Research',
        description: 'Start a new AI research thread',
        url: '/chat',
        icons: [SHORTCUT_ICON],
      },
      {
        name: 'Open chart',
        short_name: 'Chart',
        description: 'Gold chart with levels and structure',
        url: '/chart/XAUUSD',
        icons: [SHORTCUT_ICON],
      },
      {
        name: 'Alerts',
        short_name: 'Alerts',
        description: 'Price and indicator triggers',
        url: '/alerts',
        icons: [SHORTCUT_ICON],
      },
      {
        name: 'Trade journal',
        short_name: 'Journal',
        description: 'Log a trade and review R-multiples',
        url: '/journal',
        icons: [SHORTCUT_ICON],
      },
    ],
  };
}
