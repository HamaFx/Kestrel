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

// @vitest-environment node
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRECACHE_URLS } from '../scripts/generate-sw.mjs';

const webRoot = process.cwd();
const templatePath = join(webRoot, 'scripts/sw.template.js');
const template = readFileSync(templatePath, 'utf8');

/** Where each precached URL actually comes from. */
function resolvesToPrecacheSource(pathname: string): boolean {
  if (pathname.startsWith('/icons/')) {
    return existsSync(resolve(webRoot, 'public', pathname.slice(1)));
  }
  if (pathname === '/favicon.ico') {
    return existsSync(resolve(webRoot, 'public/favicon.ico'));
  }
  if (pathname === '/manifest.webmanifest') {
    return existsSync(resolve(webRoot, 'src/app/manifest.ts'));
  }
  if (pathname === '/offline') {
    return existsSync(resolve(webRoot, 'src/app/offline/page.tsx'));
  }
  const [segment] = pathname.split('/').filter(Boolean);
  return (
    segment !== undefined &&
    (existsSync(resolve(webRoot, 'src/app', segment)) ||
      existsSync(resolve(webRoot, 'src/app/(app)', segment)))
  );
}

describe('service worker generator', () => {
  it('precaches the expected shell URLs', () => {
    execFileSync('node', [join(webRoot, 'scripts/generate-sw.mjs')], {
      env: { ...process.env, NEXT_PUBLIC_BUILD_ID: 'test-build-id' },
      stdio: 'ignore',
    });

    const precache = JSON.parse(
      readFileSync(join(webRoot, 'public/sw-precache.json'), 'utf8'),
    ) as unknown[];
    expect(precache).toContain('/chat');
    expect(precache).toContain('/offline');
    expect(precache).toContain('/manifest.webmanifest');
  });

  it('only precaches URLs that actually resolve', () => {
    // `cache.addAll` used to reject on the first 404 (there was no favicon),
    // which silently left the app with no offline shell at all. Every entry now
    // has to exist, and the SW installs them one by one.
    for (const url of PRECACHE_URLS) {
      expect(resolvesToPrecacheSource(url), `${url} should resolve to a real asset`).toBe(true);
    }
  });

  it('stamps the build id and leaves no template placeholders behind', () => {
    execFileSync('node', [join(webRoot, 'scripts/generate-sw.mjs')], {
      env: {
        ...process.env,
        NEXT_PUBLIC_BUILD_ID: 'stamp-check',
        NEXT_PUBLIC_VAPID_PUBLIC_KEY: '',
      },
      stdio: 'ignore',
    });
    const sw = readFileSync(join(webRoot, 'public/sw.js'), 'utf8');
    expect(sw).toContain('stamp-check');
    expect(sw).not.toContain('__BUILD_ID__');
    expect(sw).not.toContain('__VAPID_PUBLIC_KEY__');
  });

  it('declares bypass prefixes and cache-first strategies', () => {
    expect(template).toContain('BYPASS_PREFIXES');
    expect(template).toContain("'/api/chat'");
    expect(template).toContain("'/api/push'");
    expect(template).toContain('function cacheFirst');
    expect(template).toContain('function handleNavigation');
  });

  it('precaches per URL instead of failing the whole batch', () => {
    expect(template).not.toMatch(/cache\.addAll\(/);
    expect(template).toContain('Promise.allSettled');
    // A redirect means we captured a login bounce, not the requested asset.
    expect(template).toContain('res.redirected');
  });

  it('never caches personalised API responses', () => {
    // Bypass wins over strategy selection, so no API path may be cache-first.
    const cacheFirstBlock = /CACHE_FIRST_PREFIXES = \[([\s\S]*?)\]/.exec(template)?.[1] ?? '';
    expect(cacheFirstBlock).toContain("'/_next/static/'");
    expect(cacheFirstBlock).toContain("'/fonts/'");
    expect(cacheFirstBlock).not.toContain('/api/');
  });

  it('falls back to the public offline page, not the authenticated shell', () => {
    expect(template).toContain("const OFFLINE_URL = '/offline'");
    expect(template).toContain('handleNavigation');
    expect(template).toContain('minimalOfflineHtml');
    // The offline fallback must live outside the authenticated shell.
    expect(existsSync(resolve(webRoot, 'src/app/(app)/offline'))).toBe(false);
  });

  it('uses navigation preload and only skips waiting on request', () => {
    expect(template).toContain('navigationPreload.enable()');
    expect(template).toContain('event.preloadResponse');
    // Updates wait for the app to ask (sw-register.tsx) — no implicit
    // skipWaiting() during install, which would swap chunks mid-edit.
    expect(template).not.toContain('await self.skipWaiting();');
    expect(template).toContain("type === 'SKIP_WAITING'");
  });

  it('handles push rotation and app-icon badges', () => {
    expect(template).toContain("addEventListener('pushsubscriptionchange'");
    expect(template).toContain('storePendingSubscription');
    expect(template).toContain('setAppBadge');
    expect(template).toContain('clearAppBadge');
    // Push payload URLs are normalized to same-origin paths.
    expect(template).toContain('function normalizedUrl');
  });
});
