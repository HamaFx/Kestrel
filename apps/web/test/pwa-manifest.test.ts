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

// Web app manifest + home-screen asset contract.
//
// The manifest is an external contract: browsers decide whether Kestrel is
// installable, what the install dialog shows, and which icons/screenshots the
// OS copies, purely from these fields and files. Asserting them here means a
// refactor cannot silently break installation.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import manifest from '@/app/manifest';
import { PWA_BACKGROUND, PWA_THEME_COLOR } from '@/lib/pwa/pwa-theme';
import { requiredSplashFiles, SPLASH_DEVICES, SPLASH_LINKS } from '@/lib/pwa/splash-links';

const webRoot = process.cwd();
const doc = manifest() as Record<string, unknown>;

/** Resolve a `/public` URL back to the file that serves it. */
function publicFile(pathname: string): string {
  return resolve(webRoot, 'public', pathname.replace(/^\//, ''));
}

/** `/chart/XAUUSD` → `src/app/(app)/chart` (the route segment that must exist). */
function routeSegmentExists(pathname: string): boolean {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return false;
  return (
    existsSync(resolve(webRoot, 'src/app', segment)) ||
    existsSync(resolve(webRoot, 'src/app/(app)', segment))
  );
}

describe('web app manifest', () => {
  it('pins the installed app identity', () => {
    expect(doc.id).toBe('/');
    expect(doc.scope).toBe('/');
    expect(doc.start_url).toBe('/chat');
    // start_url must live inside scope or the browser refuses to install.
    expect(String(doc.start_url).startsWith(String(doc.scope))).toBe(true);
    expect(doc.lang).toBe('en');
    expect(doc.dir).toBe('ltr');
    expect(doc.prefer_related_applications).toBe(false);
  });

  it('describes the app for the richer install dialog', () => {
    expect(typeof doc.name).toBe('string');
    expect(String(doc.name).length).toBeGreaterThan(3);
    expect(typeof doc.short_name).toBe('string');
    expect(String(doc.short_name).length).toBeLessThanOrEqual(12);
    expect(typeof doc.description).toBe('string');
    expect(doc.categories).toContain('finance');
  });

  it('uses the standalone display contract and a desktop override', () => {
    expect(doc.display).toBe('standalone');
    expect(doc.display_override).toEqual(['window-controls-overlay', 'standalone']);
    // Kestrel is used in landscape (charts, journal tables) and on desktop.
    expect(doc.orientation).toBe('any');
    expect(doc.launch_handler).toEqual({ client_mode: ['navigate-existing', 'auto'] });
  });

  it('paints the OS chrome with the design-system background', () => {
    expect(doc.theme_color).toBe(PWA_THEME_COLOR);
    expect(doc.background_color).toBe(PWA_BACKGROUND);
    expect(doc.theme_color).toBe(PWA_BACKGROUND);
  });

  it('ships every icon the install surfaces ask for', () => {
    const icons = doc.icons as Array<{ src: string; sizes?: string; purpose?: string }>;
    const byPurpose = (purpose: string) => icons.filter((icon) => icon.purpose === purpose);
    const sizes = (entries: Array<{ sizes?: string }>) => entries.map((icon) => icon.sizes);

    expect(sizes(byPurpose('any'))).toEqual(expect.arrayContaining(['192x192', '512x512']));
    // Android maskable icon (adaptive launcher) + the 1024 iOS home-screen icon.
    expect(sizes(byPurpose('maskable'))).toContain('512x512');
    expect(sizes(byPurpose('any'))).toContain('1024x1024');

    for (const icon of icons) {
      expect(existsSync(publicFile(icon.src)), `${icon.src} should exist`).toBe(true);
    }
  });

  it('ships narrow and wide screenshots for the install carousel', () => {
    const shots = doc.screenshots as Array<{
      src: string;
      sizes?: string;
      form_factor?: string;
      label?: string;
    }>;
    const narrow = shots.filter((shot) => shot.form_factor === 'narrow');
    const wide = shots.filter((shot) => shot.form_factor === 'wide');

    // Chrome only unlocks the richer desktop install UI with a `wide` entry.
    expect(narrow.length).toBeGreaterThan(0);
    expect(wide.length).toBeGreaterThan(0);

    for (const shot of shots) {
      expect(existsSync(publicFile(shot.src)), `${shot.src} should exist`).toBe(true);
      expect(shot.label, `${shot.src} needs a label for assistive tech`).toBeTruthy();
      const [width, height] = String(shot.sizes)
        .split('x')
        .map((value) => Number(value));
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
      if (shot.form_factor === 'wide') {
        // Chrome's rich-install guidance asks for at least 1280x720.
        expect(width).toBeGreaterThanOrEqual(1280);
        expect(height).toBeGreaterThanOrEqual(720);
      }
    }
  });

  it('keeps shortcuts route-valid and self-describing', () => {
    const shortcuts = doc.shortcuts as Array<{
      name: string;
      short_name?: string;
      description?: string;
      url: string;
    }>;
    // Android/Chrome show at most four shortcuts.
    expect(shortcuts.length).toBeGreaterThan(1);
    expect(shortcuts.length).toBeLessThanOrEqual(4);

    for (const shortcut of shortcuts) {
      expect(shortcut.url.startsWith('/')).toBe(true);
      expect(shortcut.description, `${shortcut.name} needs a description`).toBeTruthy();
      expect(routeSegmentExists(shortcut.url), `${shortcut.url} should resolve to a route`).toBe(
        true,
      );
    }
  });
});

describe('public asset allowlists', () => {
  // Regression: `/screenshots/*` was served behind the auth gate, so Chrome's
  // install dialog received a login redirect instead of the artwork.
  it('keeps every manifest asset reachable without a session', () => {
    const proxy = readFileSync(resolve(webRoot, 'src/proxy.ts'), 'utf8');
    const authConfig = readFileSync(resolve(webRoot, 'src/auth.config.ts'), 'utf8');
    const icons = doc.icons as Array<{ src: string }>;
    const screenshots = doc.screenshots as Array<{ src: string }>;

    const roots = new Set(
      [...icons, ...screenshots]
        .map((asset) => asset.src.split('/').filter(Boolean)[0])
        .filter((root): root is string => Boolean(root)),
    );
    expect([...roots].sort()).toEqual(['icons', 'screenshots']);

    for (const root of roots) {
      expect(proxy, `the proxy matcher must skip /${root}`).toContain(root);
      expect(authConfig, `auth.config must treat /${root} as public`).toContain(`'/${root}'`);
    }

    // The offline fallback has to be public too — offline there is no session.
    expect(proxy).toContain('offline');
    expect(authConfig).toContain("startsWith('/offline')");
  });
});

describe('iOS launch images', () => {
  it('covers every device in both orientations', () => {
    expect(SPLASH_LINKS).toHaveLength(SPLASH_DEVICES.length * 2);
    expect(new Set(SPLASH_LINKS.map((link) => link.media)).size).toBe(SPLASH_LINKS.length);

    for (const link of SPLASH_LINKS) {
      expect(link.href.startsWith('/icons/apple-splash-')).toBe(true);
      expect(link.media).toContain(`(orientation: ${link.orientation})`);
      expect(link.media).toContain(`(-webkit-device-pixel-ratio: ${link.scale})`);
      expect(existsSync(publicFile(link.href)), `${link.href} should exist`).toBe(true);
    }
  });

  it('generates exactly the files the matrix needs (no stale duplicates)', () => {
    const required = requiredSplashFiles();
    expect(new Set(required).size).toBe(required.length);
    for (const file of required) {
      expect(existsSync(resolve(webRoot, 'public/icons', file)), `${file} should exist`).toBe(true);
    }
  });
});
