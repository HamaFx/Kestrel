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

// The HTTP contract around the PWA files.
//
// `/sw.js` and `/sw-precache.json` are public and must never be served from a
// stale cache; the manifest and install artwork must be cacheable so the OS
// does not re-download them on every launch. Only the auth matcher keeps these
// paths reachable without a session, and nothing asserted that — deleting one
// lookahead term would break registration behind a /login redirect with every
// test still green.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const nextConfig = read('apps/web/next.config.mjs');
const proxy = read('apps/web/src/proxy.ts');
const authConfig = read('apps/web/src/auth.config.ts');

describe('service worker HTTP contract', () => {
  it('serves /sw.js uncached with the root scope allowed', () => {
    expect(nextConfig).toContain("source: '/sw.js'");
    expect(nextConfig).toContain("value: 'no-cache, no-store, must-revalidate'");
    expect(nextConfig).toContain("key: 'Service-Worker-Allowed', value: '/'");
    expect(nextConfig).toContain("value: 'application/javascript; charset=utf-8'");
  });

  it('never lets the precache manifest come from an HTTP cache', () => {
    expect(nextConfig).toContain("source: '/sw-precache.json'");
    expect(nextConfig).toContain("value: 'no-store'");
  });

  it('caches the manifest and install artwork', () => {
    expect(nextConfig).toContain("source: '/manifest.webmanifest'");
    expect(nextConfig).toContain('stale-while-revalidate=86400');
    for (const source of ["'/icons/:path*'", "'/screenshots/:path*'", "'/favicon.ico'"]) {
      expect(nextConfig, `${source} should be cacheable`).toContain(`source: ${source}`);
    }
    expect(nextConfig).toContain("value: 'public, max-age=604800'");
  });
});

describe('PWA paths stay reachable without a session', () => {
  // The matcher is a literal regex string, so its `.` escapes appear doubled in
  // the file. Normalize them away and assert on the plain path tokens.
  const matcher = (/matcher: \[[\s\S]*?\]/.exec(proxy)?.[0] ?? '').replace(/\\/g, '');

  it('keeps every PWA path out of the auth matcher', () => {
    for (const token of [
      'sw.js',
      'sw-precache.json',
      'manifest.webmanifest',
      'favicon.ico',
      'offline',
      'icons',
      'brand',
      'fonts',
      'screenshots',
      // The share-target receiver lives under this prefix and must not be
      // bounced to /login before it can validate the payload.
      'share',
    ]) {
      expect(matcher, `matcher should exclude ${token}`).toContain(token);
    }
  });

  it('keeps the static asset directories public', () => {
    for (const pattern of ['icons', 'brand', 'fonts', 'screenshots']) {
      expect(authConfig, `${pattern} should be a public page prefix`).toContain(`'/${pattern}'`);
    }
    // Chrome fetches the manifest, icons and service worker with no session.
    expect(authConfig).toContain("'/offline'");
  });
});

describe('the worker is registered for the whole origin', () => {
  it('registers /sw.js at scope /', () => {
    const register = read('apps/web/src/components/providers/sw-register.tsx');
    expect(register).toContain(".register('/sw.js', { scope: '/' })");
  });
});
