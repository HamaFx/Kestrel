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

// Source-level contract for the service worker.
//
// Behaviour lives in test/service-worker-runtime.test.ts (the template is
// executed in a worker sandbox there). This file keeps the invariants that are
// cheaper to state against the shipped source — the generator's output, the
// privacy boundary, and the presence of each required handler — and it writes
// its generator output to a temp directory so it can never race the served
// public/sw.js (the bug that used to leave a test build id in the repo).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { PRECACHE_URLS, resolveAssetRev } from '../scripts/generate-sw.mjs';

const webRoot = process.cwd();
const templatePath = join(webRoot, 'scripts/sw.template.js');
const template = readFileSync(templatePath, 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'kestrel-sw-out-'));

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true });
});

/** Run the generator into the isolated temp directory. */
function generateSw(env: Record<string, string> = {}): {
  sw: string;
  precache: string[];
} {
  execFileSync('node', [join(webRoot, 'scripts/generate-sw.mjs')], {
    env: { ...process.env, KESTREL_SW_OUT_DIR: outDir, ...env },
    stdio: 'ignore',
  });
  return {
    sw: readFileSync(join(outDir, 'sw.js'), 'utf8'),
    precache: JSON.parse(readFileSync(join(outDir, 'sw-precache.json'), 'utf8')) as string[],
  };
}

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
  return false;
}

describe('service worker generator', () => {
  it('precaches the public shell and nothing personal', () => {
    const { precache } = generateSw({ NEXT_PUBLIC_BUILD_ID: 'test-build-id' });

    expect(precache).toContain('/offline');
    expect(precache).toContain('/manifest.webmanifest');
    expect(precache).toContain('/favicon.ico');
    // `/chat` is auth-gated: caching the document would leave one session's
    // research surface readable on a shared device.
    expect(precache).not.toContain('/chat');
  });

  it('only precaches URLs that actually resolve', () => {
    // `cache.addAll` used to reject on the first 404 (there was no favicon),
    // which silently left the app with no offline shell at all. Every entry now
    // has to exist, and the SW installs them one by one.
    for (const url of PRECACHE_URLS) {
      expect(resolvesToPrecacheSource(url), `${url} should resolve to a real asset`).toBe(true);
    }
  });

  it('stamps the build id, asset revision and VAPID key', () => {
    const { sw } = generateSw({
      NEXT_PUBLIC_BUILD_ID: 'stamp-check',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'BEl62iUYgU',
    });

    expect(sw).toContain('kestrel-shell-vstamp-check');
    expect(sw).toContain(resolveAssetRev());
    expect(sw).not.toContain('__BUILD_ID__');
    expect(sw).not.toContain('__ASSET_REV__');
    expect(sw).not.toContain('__VAPID_PUBLIC_KEY__');
    expect(sw).toContain('BEl62iUYgU');
  });

  it('rotates the cache when the precache list changes', () => {
    // Two deploys of the same commit produce the same build id; the asset
    // digest is what still rotates the cache when the precached set moves.
    expect(resolveAssetRev()).toMatch(/^[0-9a-f]{8}$/);
    expect(template).toContain('__ASSET_REV__');
  });

  it('declares bypass prefixes and both static strategies', () => {
    expect(template).toContain('BYPASS_PREFIXES');
    expect(template).toContain("'/api/chat'");
    expect(template).toContain("'/api/push'");
    expect(template).toContain('function cacheFirst');
    expect(template).toContain('function staleWhileRevalidate');
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
    const immutableBlock = /IMMUTABLE_PREFIXES = \[([\s\S]*?)\]/.exec(template)?.[1] ?? '';
    const revalidateBlock = /REVALIDATE_PREFIXES = \[([\s\S]*?)\]/.exec(template)?.[1] ?? '';
    expect(immutableBlock).toContain("'/_next/static/'");
    expect(revalidateBlock).toContain("'/icons/'");
    expect(revalidateBlock).toContain("'/fonts/'");
    expect(`${immutableBlock}${revalidateBlock}`).not.toContain('/api/');
  });

  it('revalidates unhashed assets instead of pinning the first copy', () => {
    // Cache-first on a stable URL is the "stale icon after deploy" bug.
    expect(template).toContain('staleWhileRevalidate');
    expect(template).toContain('REVALIDATE_EXACT');
  });

  it('only replays public documents while offline', () => {
    expect(template).toContain('PUBLIC_NAV_ALLOWLIST');
    expect(template).toContain("const OFFLINE_URL = '/offline'");
    expect(template).toContain('handleNavigation');
    expect(template).toContain('minimalOfflineHtml');
    // No "serve whatever HTML we happen to have for this URL" step.
    expect(template).not.toContain('cache.match(req.url)');
    // The offline fallback must live outside the authenticated shell.
    expect(existsSync(resolve(webRoot, 'src/app/(app)/offline'))).toBe(false);
  });

  it('repairs a missing offline document on activate', () => {
    expect(template).toContain('ensureOfflineShell');
  });

  it('uses navigation preload and only skips waiting on request', () => {
    expect(template).toContain('navigationPreload.enable()');
    expect(template).toContain('event.preloadResponse');
    // Updates wait for the app to ask (sw-register.tsx) — no implicit
    // skipWaiting() during install, which would swap chunks mid-edit.
    expect(template).not.toContain('await self.skipWaiting();');
    expect(template).toContain("type === 'SKIP_WAITING'");
  });

  it('handles push rotation, payload actions and app-icon badges', () => {
    expect(template).toContain("addEventListener('pushsubscriptionchange'");
    expect(template).toContain('storePendingSubscription');
    expect(template).toContain('setAppBadge');
    expect(template).toContain('clearAppBadge');
    expect(template).toContain('notificationActions');
    // Push payload URLs are normalized to same-origin paths.
    expect(template).toContain('function normalizedUrl');
  });

  it('refreshes the shell from a periodic background sync', () => {
    expect(template).toContain("addEventListener('periodicsync'");
    expect(template).toContain('SHELL_REFRESH_TAG');
    // The whole point: a rarely-opened install learns about a deploy.
    expect(template).toContain('registration.update()');
    expect(template).toContain('refreshDocuments');
    // …and it is rate-limited rather than re-fetching on every wake-up.
    expect(template).toContain('SHELL_REFRESH_INTERVAL_MS');
    expect(template).toContain('last-shell-refresh');
  });
});

// The worker duplicates a handful of literals with the foreground modules
// (a worker cannot import app code). These two contracts are the ones where a
// silent drift breaks a feature with no error anywhere: alerts that stop
// arriving after a subscription rotation, and a background refresh that never
// fires because the tag stopped matching.
describe('worker ↔ app contracts', () => {
  const read = (file: string) => readFileSync(resolve(webRoot, file), 'utf8');

  it('shares the push handoff store with push-store.ts', () => {
    const client = read('src/lib/pwa/push-store.ts');
    for (const literal of ["'kestrel-pwa'", "'push-state'", "'pending-subscription'"]) {
      expect(template, `worker should use ${literal}`).toContain(literal);
      expect(client, `push-store should use ${literal}`).toContain(literal);
    }
  });

  it('shares the periodic-sync tag, interval and state store with background-sync.ts', () => {
    const client = read('src/lib/pwa/background-sync.ts');
    expect(client).toContain("'kestrel-shell-refresh'");
    expect(template).toContain("'kestrel-shell-refresh'");
    expect(client).toContain('6 * 60 * 60 * 1000');
    expect(template).toContain('6 * 60 * 60 * 1000');
    expect(template).toContain("'kestrel-shell-state'");
  });

  it('shares the share-target action with the manifest', () => {
    const shareTarget = read('src/lib/pwa/share-target.ts');
    const manifest = read('src/app/manifest.ts');
    expect(shareTarget).toContain("'/share/receive'");
    expect(manifest).toContain('SHARE_TARGET_ACTION');
    expect(existsSync(resolve(webRoot, 'src/app/share/receive/page.tsx'))).toBe(true);
  });

  it('keeps the alert push payload inside the documented contract', () => {
    // The worker documents `{ title, body, url, tag?, badge?, icon?, actions? }`
    // and the alert sender lives in another package, so nothing else would
    // notice a new key being pushed at a worker that ignores it.
    const senderPath = resolve(webRoot, '../../packages/ai/src/alerts/delivery/adapters.ts');
    expect(existsSync(senderPath), 'alert delivery adapters moved').toBe(true);

    const sender = readFileSync(senderPath, 'utf8');
    const payloadBlock = /const payload\s*=\s*JSON\.stringify\(\{([\s\S]*?)\}\)/.exec(sender)?.[1];
    expect(payloadBlock, 'no web-push payload in the delivery adapter').toBeTruthy();

    const keys = [...(payloadBlock as string).matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(expect.arrayContaining(['title', 'body', 'url']));
    for (const key of keys) {
      expect(
        ['title', 'body', 'url', 'tag', 'badge', 'icon', 'actions'],
        `the worker does not handle a "${key}" push field`,
      ).toContain(key);
    }
  });
});
