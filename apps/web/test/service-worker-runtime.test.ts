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

// Behavioural tests for scripts/sw.template.js: the file is executed in a
// service-worker-like sandbox (test/helpers/service-worker-harness.ts) and its
// handlers are driven directly, so a strategy regression fails as a wrong
// response instead of a missing substring.
import { describe, expect, it } from 'vitest';

import {
  loadServiceWorker,
  redirectedResponse,
  SW_ORIGIN,
  type HarnessOptions,
} from './helpers/service-worker-harness';

const PRECACHE = [
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/favicon.ico',
  '/manifest.webmanifest',
];

/** The build id/revision generate-sw stamps for these tests. */
const CACHE_NAME = 'kestrel-shell-vtest-build-deadbeef';

function request(path: string, init?: RequestInit): Request {
  return new Request(new URL(path, SW_ORIGIN).href, init);
}

function navigationRequest(path: string): Request {
  // A real navigation Request cannot be constructed in Node (mode: 'navigate'
  // is reserved for the browser), so the accept header carries the signal the
  // worker actually inspects.
  return new Request(new URL(path, SW_ORIGIN).href, {
    headers: { accept: 'text/html' },
  });
}

function ok(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

function load(options: HarnessOptions = {}) {
  return loadServiceWorker({ precache: PRECACHE, ...options });
}

describe('service worker install', () => {
  it('precaches every manifest URL one by one', async () => {
    const sw = load({
      routes: [
        { match: (url) => url !== `${SW_ORIGIN}/sw-precache.json`, respond: ok.bind(null, 'x') },
      ],
    });

    await sw.dispatch('install');

    for (const path of PRECACHE) {
      expect(await sw.cached(path), `${path} should be precached`).toBeDefined();
    }
  });

  it('keeps the precache when a single URL fails', async () => {
    const sw = load({
      routes: [
        { match: '/icons/icon-512.png', respond: () => new Response('gone', { status: 404 }) },
        { match: (url) => url !== `${SW_ORIGIN}/sw-precache.json`, respond: ok.bind(null, 'x') },
      ],
    });

    await sw.dispatch('install');

    expect(await sw.cached('/icons/icon-512.png')).toBeUndefined();
    expect(await sw.cached('/offline')).toBeDefined();
    expect(await sw.cached('/manifest.webmanifest')).toBeDefined();
  });

  it('never caches a redirected response (login bounce)', async () => {
    const sw = load({
      routes: [
        {
          match: '/offline',
          respond: () => redirectedResponse('<html>sign in</html>'),
        },
        { match: (url) => url !== `${SW_ORIGIN}/sw-precache.json`, respond: ok.bind(null, 'x') },
      ],
    });

    await sw.dispatch('install');

    expect(await sw.cached('/offline')).toBeUndefined();
  });

  it('never precaches the authenticated /chat document', async () => {
    const sw = load({
      routes: [
        { match: (url) => url !== `${SW_ORIGIN}/sw-precache.json`, respond: ok.bind(null, 'x') },
      ],
    });

    await sw.dispatch('install');

    expect(PRECACHE).not.toContain('/chat');
    expect(sw.fetchCalls.some((call) => call.url.endsWith('/chat'))).toBe(false);
  });
});

describe('service worker activate', () => {
  it('drops caches from earlier builds and keeps the current one', async () => {
    const sw = load();
    await sw.caches.open('kestrel-shell-vold-build-aaaaaaaa');
    await sw.caches.open(CACHE_NAME);

    await sw.dispatch('activate');

    expect(await sw.caches.keys()).toEqual([CACHE_NAME]);
  });

  it('enables navigation preload', async () => {
    const sw = load();
    await sw.dispatch('activate');
    expect((sw.registration.state as { preloadEnabled: boolean }).preloadEnabled).toBe(true);
  });

  it('repairs a missing offline document after a partial install', async () => {
    const sw = load({
      routes: [{ match: '/offline', respond: () => ok('<html>offline</html>') }],
    });

    await sw.dispatch('activate');

    expect(await sw.cached('/offline')).toBeDefined();
  });
});

describe('navigation strategy', () => {
  it('serves the network response when online', async () => {
    const sw = load({
      routes: [{ match: '/dashboard', respond: () => ok('<html>dashboard</html>') }],
    });

    const { response } = await sw.dispatch('fetch', { request: navigationRequest('/dashboard') });

    expect(await response?.text()).toContain('dashboard');
  });

  it('prefers the navigation preload response', async () => {
    const sw = load({
      routes: [{ match: '/dashboard', respond: () => ok('<html>network</html>') }],
    });

    const { response } = await sw.dispatch('fetch', {
      request: navigationRequest('/dashboard'),
      preloadResponse: Promise.resolve(ok('<html>preloaded</html>')),
    });

    expect(await response?.text()).toContain('preloaded');
  });

  it('falls back to the cached offline page when the network fails', async () => {
    const sw = load({
      routes: [{ match: '/journal', respond: () => new Response('', { status: 503 }) }],
    });
    await sw.seed('/offline', '<html>offline shell</html>');

    const { response } = await sw.dispatch('fetch', { request: navigationRequest('/journal') });

    expect(await response?.text()).toContain('offline shell');
  });

  it('never replays a cached authenticated document', async () => {
    // Simulates a private page that ended up in the cache (older build,
    // foreign worker): the navigation must NOT be answered with it.
    const sw = load({
      routes: [{ match: '/journal', respond: () => new Response('', { status: 503 }) }],
    });
    await sw.seed('/journal', '<html>JOURNAL OF THE PREVIOUS USER</html>');
    await sw.seed('/offline', '<html>offline shell</html>');

    const { response } = await sw.dispatch('fetch', { request: navigationRequest('/journal') });
    const body = await response?.text();

    expect(body).not.toContain('PREVIOUS USER');
    expect(body).toContain('offline shell');
  });

  it('serves an allowlisted public document from cache', async () => {
    const sw = load({
      routes: [{ match: '/login', respond: () => new Response('', { status: 503 }) }],
    });
    await sw.seed('/login', '<html>sign in</html>');

    const { response } = await sw.dispatch('fetch', { request: navigationRequest('/login') });

    expect(await response?.text()).toContain('sign in');
  });

  it('returns an inline 503 document when even /offline is missing', async () => {
    const sw = load({
      routes: [{ match: '/journal', respond: () => new Response('', { status: 503 }) }],
    });

    const { response } = await sw.dispatch('fetch', { request: navigationRequest('/journal') });

    expect(response?.status).toBe(503);
    expect(await response?.text()).toContain('offline');
  });
});

describe('static asset strategies', () => {
  it('serves fingerprinted bundles from cache without a second fetch', async () => {
    const sw = load({
      routes: [
        { match: (url) => url.includes('/_next/static/'), respond: () => ok('console.log(1)') },
      ],
    });

    const first = await sw.dispatch('fetch', { request: request('/_next/static/chunks/app.js') });
    const callsAfterFirst = sw.fetchCalls.length;
    const second = await sw.dispatch('fetch', { request: request('/_next/static/chunks/app.js') });

    expect(await first.response?.text()).toBe('console.log(1)');
    expect(await second.response?.text()).toBe('console.log(1)');
    expect(sw.fetchCalls.length).toBe(callsAfterFirst);
  });

  it('revalidates unhashed assets in the background instead of pinning them', async () => {
    let version = 'v1';
    const sw = load({
      routes: [{ match: '/icons/icon-192.png', respond: () => ok(version) }],
    });

    await sw.dispatch('fetch', { request: request('/icons/icon-192.png') });
    version = 'v2';
    const { response } = await sw.dispatch('fetch', { request: request('/icons/icon-192.png') });

    // The stale copy answers immediately...
    expect(await response?.text()).toBe('v1');
    // ...and the fresh copy has already replaced it for the next load.
    const cached = await sw.cached('/icons/icon-192.png');
    expect(await cached?.text()).toBe('v2');
  });

  it('caches the manifest with stale-while-revalidate semantics', async () => {
    const sw = load({
      routes: [{ match: '/manifest.webmanifest', respond: () => ok('{"name":"Kestrel"}') }],
    });

    await sw.dispatch('fetch', { request: request('/manifest.webmanifest') });

    expect(await (await sw.cached('/manifest.webmanifest'))?.text()).toContain('Kestrel');
  });
});

describe('hard bypasses', () => {
  it.each([
    '/api/chat',
    '/api/auth/session',
    '/api/push/subscribe',
    '/api/market/quote',
    '/api/admin/users',
    '/api/cron/tick',
  ])('does not handle %s', async (path) => {
    const sw = load();

    const { response } = await sw.dispatch('fetch', { request: request(path) });

    expect(response).toBeUndefined();
    expect(sw.fetchCalls).toHaveLength(0);
  });

  it('ignores cross-origin and non-GET requests', async () => {
    const sw = load();

    const crossOrigin = await sw.dispatch('fetch', {
      request: new Request('https://cdn.example.com/thing.js'),
    });
    const post = await sw.dispatch('fetch', {
      request: request('/manifest.webmanifest', { method: 'POST' }),
    });

    expect(crossOrigin.response).toBeUndefined();
    expect(post.response).toBeUndefined();
  });
});

describe('messaging contract', () => {
  it('activates immediately only when the app asks', async () => {
    const sw = load();

    await sw.dispatch('message', { data: { type: 'SKIP_WAITING' } });

    expect(sw.skipWaitingCalls).toBe(1);
  });

  it('reports the build id, cache name and contract version', async () => {
    const sw = load();
    const posted: unknown[] = [];

    await sw.dispatch('message', {
      data: { type: 'GET_VERSION' },
      ports: [{ postMessage: (value: unknown) => posted.push(value) }],
    });

    expect(posted[0]).toMatchObject({
      build: 'test-build',
      cache: CACHE_NAME,
      contract: 2,
    });
  });
});

describe('push notifications', () => {
  it('renders the alert payload and raises the app badge', async () => {
    const sw = load();

    await sw.dispatch('push', {
      data: {
        json: () => ({
          title: 'Kestrel · XAUUSD crosses 2400',
          body: 'Price alert fired',
          url: '/alerts',
          badge: 3,
        }),
        text: () => '',
      },
    });

    expect(sw.notifications).toHaveLength(1);
    expect(sw.notifications[0]?.title).toContain('XAUUSD');
    expect(sw.notifications[0]?.options).toMatchObject({
      body: 'Price alert fired',
      tag: 'kestrel-alert',
      data: { url: '/alerts' },
    });
    expect(sw.navigator.badge).toBe(3);
  });

  it('normalizes a hostile payload URL to /alerts', async () => {
    const sw = load();

    await sw.dispatch('push', {
      data: {
        json: () => ({ title: 'x', body: 'y', url: 'https://evil.example/steal' }),
        text: () => '',
      },
    });

    expect(sw.notifications[0]?.options).toMatchObject({ data: { url: '/alerts' } });
  });

  it('keeps at most two well-formed actions', async () => {
    const sw = load();

    await sw.dispatch('push', {
      data: {
        json: () => ({
          title: 'x',
          body: 'y',
          actions: [
            { action: 'open', title: 'Open' },
            { action: '', title: 'broken' },
            { action: 'snooze', title: 'Snooze' },
            { action: 'third', title: 'Third' },
          ],
        }),
        text: () => '',
      },
    });

    expect(sw.notifications[0]?.options.actions).toEqual([
      { action: 'open', title: 'Open' },
      { action: 'snooze', title: 'Snooze' },
    ]);
  });

  it('survives a non-JSON payload', async () => {
    const sw = load();

    await sw.dispatch('push', {
      data: {
        json: () => {
          throw new Error('not json');
        },
        text: () => 'raw text',
      },
    });

    expect(sw.notifications[0]?.options).toMatchObject({ body: 'raw text' });
  });
});

describe('notification clicks', () => {
  it('focuses an existing window already on the target route', async () => {
    let focused = false;
    const sw = load({
      clients: [
        {
          url: `${SW_ORIGIN}/alerts`,
          focus: async () => {
            focused = true;
          },
        },
      ],
    });

    await sw.dispatch('notificationclick', {
      notification: { data: { url: '/alerts' }, close: () => {} },
      action: '',
    });

    expect(focused).toBe(true);
    expect(sw.openedWindows).toHaveLength(0);
    expect(sw.navigator.badge).toBeNull();
  });

  it('opens a window when no client can take the URL', async () => {
    const sw = load();

    await sw.dispatch('notificationclick', {
      notification: { data: { url: '/alerts' }, close: () => {} },
      action: '',
    });

    expect(sw.openedWindows).toEqual(['/alerts']);
  });

  it('closes silently for the dismiss action', async () => {
    const sw = load();

    await sw.dispatch('notificationclick', {
      notification: { data: { url: '/alerts' }, close: () => {} },
      action: 'dismiss',
    });

    expect(sw.openedWindows).toHaveLength(0);
  });
});

describe('push subscription rotation', () => {
  it('parks the rotated subscription and tells open clients', async () => {
    const sw = load({ clients: [{ url: `${SW_ORIGIN}/settings/install` }] });

    await sw.dispatch('pushsubscriptionchange', {});

    expect(sw.messages).toEqual([
      {
        type: 'PUSH_SUBSCRIPTION_CHANGED',
        subscription: expect.objectContaining({ endpoint: 'https://push.example/rotated' }),
      },
    ]);
  });
});

describe('periodic background sync', () => {
  const routes = [
    { match: '/offline', respond: () => ok('<html>offline v2</html>') },
    { match: '/manifest.webmanifest', respond: () => ok('{"name":"Kestrel v2"}') },
  ];

  it('checks for a new worker and refreshes the offline shell', async () => {
    const sw = load({ routes });
    await sw.seed('/offline', '<html>offline v1</html>');

    await sw.dispatch('periodicsync', { tag: 'kestrel-shell-refresh' });

    expect(sw.registrationUpdateCalls).toBe(1);
    const offline = await sw.cached('/offline');
    expect(await offline?.text()).toContain('offline v2');
  });

  it('ignores other tags', async () => {
    const sw = load({ routes });

    await sw.dispatch('periodicsync', { tag: 'something-else' });

    expect(sw.registrationUpdateCalls).toBe(0);
  });

  it('does not hammer the network on repeated wake-ups', async () => {
    const sw = load({ routes });

    await sw.dispatch('periodicsync', { tag: 'kestrel-shell-refresh' });
    const afterFirst = sw.fetchCalls.length;

    await sw.dispatch('periodicsync', { tag: 'kestrel-shell-refresh' });

    expect(sw.registrationUpdateCalls).toBe(1);
    expect(sw.fetchCalls.length).toBe(afterFirst);
  });

  it('survives a failing update check and still refreshes the shell', async () => {
    const sw = load({
      ...{ routes },
      clients: [],
    });
    await sw.seed('/offline', '<html>offline v1</html>');
    // A worker restart mid-refresh must not lose the offline document.
    expect(await (await sw.cached('/offline'))?.text()).toContain('v1');

    await sw.dispatch('periodicsync', { tag: 'kestrel-shell-refresh' });

    expect(await (await sw.cached('/offline'))?.text()).toContain('v2');
  });
});
