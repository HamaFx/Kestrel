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

/* eslint-disable no-undef, no-restricted-globals */
/**
 * sw.template.js — service worker source template.
 *
 * Consumed by apps/web/scripts/generate-sw.mjs, which substitutes
 * `__BUILD_ID__` / `__VAPID_PUBLIC_KEY__` and writes the result to
 * apps/web/public/sw.js. This file is NEVER served to the browser as-is.
 *
 * Responsibilities (see docs/pwa.md):
 *   - install:  pre-cache the public shell, one URL at a time so a single
 *               failure (404/offline/redirect) can never abort the batch.
 *               `cache.addAll` is atomic: it rejected on the first missing
 *               URL and left the app with no precache at all.
 *               Updates deliberately stay in `waiting`; the app decides when
 *               to `SKIP_WAITING` (src/components/providers/sw-register.tsx).
 *   - activate: drop stale build caches, enable navigation preload, claim.
 *   - fetch:    strategies table (cache-first statics, network-first
 *               navigations with an offline fallback, hard bypass for APIs).
 *   - push:     render alert notifications, update the app badge, and
 *               re-subscribe when the push service rotates the subscription.
 *
 * Bypass list (Kestrel is an authenticated trading terminal; nothing
 * personalised is cached): /api/auth, /api/cron, /api/chat (SSE),
 * /api/admin, /api/market, /api/push.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.11
 */

const CACHE_NAME = 'kestrel-shell-v__BUILD_ID__';
const PRECACHE_URL = '/sw-precache.json';
const NAV_TIMEOUT_MS = 3000;
/** Universal offline fallback — a public, static route (no auth). */
const OFFLINE_URL = '/offline';

/** VAPID public key stamped at build time (used when re-subscribing). */
const VAPID_PUBLIC_KEY = '__VAPID_PUBLIC_KEY__';
/** True when the build could not inject a usable VAPID key. */
const VAPID_UNAVAILABLE = VAPID_PUBLIC_KEY.startsWith('__') || VAPID_PUBLIC_KEY.length < 20;

/** Push-subscription handoff store, mirrored in src/lib/pwa/push-store.ts. */
const PUSH_DB = 'kestrel-pwa';
const PUSH_STORE = 'push-state';
const PUSH_PENDING_KEY = 'pending-subscription';

/**
 * Path prefixes the SW must NOT handle. Requests matching any of these fall
 * through to the browser's default networking with no caching.
 */
const BYPASS_PREFIXES = [
  '/api/auth',
  '/api/cron',
  '/api/admin',
  '/api/chat',
  '/api/market',
  '/api/push',
];

/** Cache-first path prefixes (fingerprinted bundles + static brand assets). */
const CACHE_FIRST_PREFIXES = ['/_next/static/', '/icons/', '/fonts/', '/brand/'];
const CACHE_FIRST_EXACT = new Set(['/favicon.ico', '/manifest.webmanifest']);

// --- install ---------------------------------------------------------------

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
});

/**
 * Populate the shell cache from the build-time manifest.
 * Every URL is fetched and cached independently; failures are reported and
 * skipped so one broken asset cannot empty the cache.
 */
async function precacheShell() {
  /** @type {string[]} */
  let urls;
  try {
    const res = await fetch(PRECACHE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`precache manifest HTTP ${res.status}`);
    const parsed = await res.json();
    if (!Array.isArray(parsed)) throw new Error('precache manifest is not an array');
    urls = parsed.filter((url) => typeof url === 'string');
  } catch (err) {
    // Best-effort: without a manifest the fetch handler degrades to
    // network-only plus whatever the runtime cache already holds.
    warn('precache manifest unavailable', err);
    return;
  }

  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(urls.map((url) => precacheOne(cache, url)));
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) warn(`precache: ${failed}/${urls.length} entries skipped`);
}

/**
 * Fetch and store a single shell URL.
 *
 * @param {Cache} cache
 * @param {string} url
 */
async function precacheOne(cache, url) {
  const res = await fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' }));
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  // A redirect means we captured a login bounce (expired session at install
  // time), not the asset we asked for — never cache that as the app shell.
  if (res.redirected) throw new Error(`${url} → redirected to ${res.url}`);
  await cache.put(url, res.clone());
}

// --- activate --------------------------------------------------------------

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));

      // Navigation preload: the browser starts the navigation request in
      // parallel with service-worker boot instead of after it.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (err) {
          warn('navigation preload unavailable', err);
        }
      }

      await self.clients.claim();
    })(),
  );
});

// --- fetch -----------------------------------------------------------------

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin: passthrough, never cache.
  if (url.origin !== self.location.origin) return;

  // Bypass list: never cache, never SW-handle.
  for (const prefix of BYPASS_PREFIXES) {
    if (url.pathname.startsWith(prefix)) return;
  }

  if (req.mode === 'navigate' || (req.headers.get('accept') ?? '').includes('text/html')) {
    event.respondWith(handleNavigation(event, req));
    return;
  }

  // Static fingerprinted assets + icons + fonts + manifest + favicon.
  if (
    CACHE_FIRST_EXACT.has(url.pathname) ||
    CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else (RSC payloads, server actions, API reads): network-only.
  // Personalised responses are deliberately never cached on the device.
});

/**
 * Network-first navigation handler.
 *
 * Order of resolution:
 *   1. navigation preload (or a 3s-timeouted fetch) when it returns < 500
 *   2. an exact cache match for the requested URL
 *   3. the cached offline page (public + static, no auth required)
 *   4. a minimal inline offline document as the last resort
 *
 * @param {FetchEvent} event
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function handleNavigation(event, req) {
  try {
    const network = await navigationResponse(event, req);
    if (network && network.status < 500) return network;
  } catch {
    /* offline or timed out → fall through to the cache */
  }

  const cache = await caches.open(CACHE_NAME);
  const exact = await cache.match(req.url);
  if (exact) return exact;

  const offline = await cache.match(OFFLINE_URL);
  if (offline) return offline;

  return new Response(minimalOfflineHtml(), {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * Resolve the network response for a navigation, preferring the preloaded
 * request the browser already started.
 *
 * @param {FetchEvent} event
 * @param {Request} req
 * @returns {Promise<Response | undefined>}
 */
async function navigationResponse(event, req) {
  if (event.preloadResponse) {
    const preloaded = await event.preloadResponse.catch(() => undefined);
    if (preloaded) return preloaded;
  }
  return fetchWithTimeout(req, NAV_TIMEOUT_MS);
}

/**
 * Cache-first strategy. On a cache miss, fetch from the network and populate
 * the cache (best-effort — opaque/error responses are not cached).
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const network = await fetch(req);
  if (network && network.ok && network.type !== 'opaque') {
    try {
      await cache.put(req, network.clone());
    } catch {
      /* quota / non-cacheable — ignore */
    }
  }
  return network;
}

/**
 * Wrap fetch with an abortable timeout.
 *
 * @param {Request} req
 * @param {number} ms
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    fetch(req, { signal: ctrl.signal })
      .then((r) => {
        clearTimeout(timer);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/** Last-resort offline document when even the cached offline page is gone. */
function minimalOfflineHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#121212"><title>Kestrel — offline</title>
<style>html{color-scheme:dark}body{margin:0;min-height:100svh;display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;background:#121212;color:#e5e5e5;font:16px system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
h1{font-size:20px;font-weight:600;margin:0}p{margin:0;color:#909090;max-width:28rem;line-height:1.5}
a{margin-top:8px;color:#ff3616;font-weight:600;text-decoration:none}</style></head>
<body><h1>You&rsquo;re offline</h1><p>Kestrel can&rsquo;t reach the market feed right now. Cached screens stay available.</p>
<a href="/offline">Retry</a></body></html>`;
}

// --- messaging -------------------------------------------------------------

self.addEventListener('message', (event) => {
  const data = event.data;
  const type = typeof data === 'string' ? data : data && data.type;
  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ build: '__BUILD_ID__', cache: CACHE_NAME });
  }
});

// --- push ------------------------------------------------------------------
//
// Payload contract (sent by packages/ai/src/alerts/delivery/adapters.ts):
//   { title, body, url, tag?, badge?, icon? }
// `badge` is an unread count for the app icon (Badging API).

self.addEventListener('push', (event) => {
  /** @type {{ title?: string; body?: string; url?: string; tag?: string; badge?: number; icon?: string }} */
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? 'Kestrel', {
        body: data.body ?? '',
        data: { url: normalizedUrl(data.url) },
        icon: data.icon ?? '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.tag ?? 'kestrel-alert',
        renotify: true,
      });
      await updateBadge(data.badge);
    })(),
  );
});

/**
 * Set the app-icon badge (dot when no count is supplied). iOS ignores the
 * number and shows a dot; Android draws its own notification badge.
 *
 * @param {number | undefined} count
 */
async function updateBadge(count) {
  const nav = self.navigator;
  if (!nav || typeof nav.setAppBadge !== 'function') return;
  try {
    if (typeof count === 'number' && count >= 0) await nav.setAppBadge(count);
    else await nav.setAppBadge();
  } catch (err) {
    debug('app badge unavailable', err);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = normalizedUrl(
    event.notification.data && event.notification.data.url
      ? String(event.notification.data.url)
      : '/alerts',
  );

  event.waitUntil(
    (async () => {
      if (self.navigator && typeof self.navigator.clearAppBadge === 'function') {
        await self.navigator.clearAppBadge().catch(() => {});
      }
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = all.find((client) => {
        try {
          return new URL(client.url).pathname === target;
        } catch {
          return false;
        }
      });
      if (existing && 'focus' in existing) {
        await existing.focus();
        return;
      }
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              /* cross-tab navigation may be blocked — ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// When the push service rotates a subscription the app must re-register it.
// Safari/iOS rotate silently, and a stale endpoint means alerts stop arriving.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(resyncPushSubscription(event));
});

/**
 * @param {Event & { oldSubscription?: PushSubscription; newSubscription?: PushSubscription }} event
 */
async function resyncPushSubscription(event) {
  try {
    const options =
      (event.oldSubscription && event.oldSubscription.options) ||
      (VAPID_UNAVAILABLE
        ? undefined
        : { userVisibleOnly: true, applicationServerKey: VAPID_PUBLIC_KEY });
    const subscription =
      event.newSubscription || (await self.registration.pushManager.subscribe(options));
    const json = subscription.toJSON();
    await storePendingSubscription(json);
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: json });
    }
  } catch (err) {
    warn('push subscription resync failed', err);
  }
}

/**
 * Persist a rotated subscription so the app can POST it to
 * /api/push/subscribe on the next foreground visit (the endpoint requires the
 * session cookie + CSRF header, which a service worker cannot read).
 *
 * @param {unknown} subscription
 */
async function storePendingSubscription(subscription) {
  await new Promise((resolve, reject) => {
    const open = indexedDB.open(PUSH_DB, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(PUSH_STORE)) {
        open.result.createObjectStore(PUSH_STORE);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(PUSH_STORE, 'readwrite');
      tx.objectStore(PUSH_STORE).put(subscription, PUSH_PENDING_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(undefined);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

// --- helpers ---------------------------------------------------------------

/**
 * Normalize a notification target to a same-origin path (never open an
 * attacker-supplied absolute URL from a push payload).
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizedUrl(value) {
  if (typeof value !== 'string') return '/alerts';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin
      ? `${parsed.pathname}${parsed.search}`
      : '/alerts';
  } catch {
    return '/alerts';
  }
}

/* eslint-disable no-console */
function warn(message, err) {
  console.warn('[sw]', message, err ?? '');
}
function debug(message, err) {
  console.debug('[sw]', message, err ?? '');
}
/* eslint-enable no-console */
