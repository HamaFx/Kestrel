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
 *   - activate: drop stale build caches, enable navigation preload, guarantee
 *               the offline document exists, then claim clients.
 *   - fetch:    strategies table (immutable bundles cache-first, unhashed
 *               assets stale-while-revalidate, network-first navigations with
 *               a public-only offline fallback, hard bypass for APIs).
 *   - push:     render alert notifications, honour optional payload actions,
 *               update the app badge, and re-subscribe when the push service
 *               rotates the subscription.
 *
 * Privacy boundary (Kestrel is an authenticated trading terminal):
 *   - NO application HTML is ever written to a cache. Only `/offline` (and the
 *     small public-navigation allowlist below) may answer a navigation while
 *     offline, and `.js`/`.css`/font/icon responses are the only other cached
 *     payloads. A shared device can therefore never read another session's
 *     journal or chat out of the HTTP cache.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.11
 */

// `__ASSET_REV__` is a digest of the precache list. Folding it in means the
// cache still rotates when the build id repeats (same commit rebuilt, a Docker
// image with no git metadata) but the precached asset set changed.
const CACHE_NAME = 'kestrel-shell-v__BUILD_ID__-__ASSET_REV__';
/**
 * Bumped when the message/strategy contract changes so a client can tell a
 * stale worker from a current one (`GET_VERSION`).
 */
const SW_CONTRACT = 2;
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

/** Periodic sync tags + state, mirrored in src/lib/pwa/background-sync.ts. */
const SHELL_REFRESH_TAG = 'kestrel-shell-refresh';
const SHELL_STATE_DB = 'kestrel-shell-state';
const SHELL_STATE_STORE = 'meta';
const SHELL_REFRESH_KEY = 'last-shell-refresh';
/**
 * Floor between two background shell refreshes. The platform already throttles
 * periodic sync by engagement and battery; this keeps a device that opens the
 * app ten times an hour from revalidating ten times an hour.
 */
const SHELL_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Documents refreshed in the background. Deliberately not the icon/font set:
 * those are served stale-while-revalidate on use, which costs nothing when the
 * app is open. The offline document and the manifest are what an installed app
 * reads while it is *not* open.
 */
const SHELL_REFRESH_DOCUMENTS = [OFFLINE_URL, '/manifest.webmanifest'];

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

/**
 * Content-hashed bundles. The URL changes whenever the bytes change, so
 * serving them from cache forever is both safe and the fastest possible path.
 */
const IMMUTABLE_PREFIXES = ['/_next/static/'];

/**
 * Unhashed static assets (brand art, fonts, icons, manifest, favicon). These
 * URLs are stable across releases, so cache-first would pin the very first
 * version ever seen — the classic "stale icon after deploy" bug. They are
 * served from cache immediately and revalidated in the background instead.
 */
const REVALIDATE_PREFIXES = ['/icons/', '/fonts/', '/brand/'];
const REVALIDATE_EXACT = new Set(['/favicon.ico', '/manifest.webmanifest']);

/**
 * Public, non-personalised documents a failed navigation may answer with.
 * Anything outside this set resolves to `/offline`: authenticated pages must
 * never be replayed from a cache on a shared device.
 */
const PUBLIC_NAV_ALLOWLIST = new Set(['/offline', '/login', '/landing']);

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

      // Install is best-effort, so a partially failed precache can leave a
      // fresh worker with no offline document. Repair it here rather than
      // discovering the gap while the user is offline.
      await ensureOfflineShell();

      await self.clients.claim();
    })(),
  );
});

/**
 * Guarantee the offline document is cached. Cheap when install succeeded
 * (one cache lookup), self-healing when it did not.
 */
async function ensureOfflineShell() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(OFFLINE_URL);
    if (hit) return;
    const res = await fetch(
      new Request(OFFLINE_URL, { cache: 'no-cache', credentials: 'same-origin' }),
    );
    if (res.ok && !res.redirected) await cache.put(OFFLINE_URL, res.clone());
  } catch (err) {
    debug('offline shell warm-up skipped', err);
  }
}

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

  if (IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (
    REVALIDATE_EXACT.has(url.pathname) ||
    REVALIDATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
  ) {
    event.respondWith(staleWhileRevalidate(event, req));
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
 *   2. a cached document ONLY for the public allowlist above
 *   3. the cached offline page (public + static, no auth required)
 *   4. a minimal inline offline document as the last resort
 *
 * There is deliberately no "serve whatever HTML we happen to have cached for
 * this URL" step: that is how an authenticated page ends up replayed on the
 * next person's screen.
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

  const url = new URL(req.url);
  const cache = await caches.open(CACHE_NAME);

  if (PUBLIC_NAV_ALLOWLIST.has(url.pathname)) {
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
  }

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
 * Cache-first strategy for content-hashed URLs. On a cache miss, fetch from
 * the network and populate the cache (best-effort — opaque/error responses
 * are never cached).
 *
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);
  if (hit) return hit;
  const network = await fetch(req);
  await putIfCacheable(cache, req, network);
  return network;
}

/**
 * Stale-while-revalidate for stable-but-unhashed URLs: answer from cache
 * immediately, refresh the copy in the background so the next load (or the
 * next offline visit) has the current file.
 *
 * @param {FetchEvent} event
 * @param {Request} req
 * @returns {Promise<Response>}
 */
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(req);

  const refresh = fetch(req)
    .then((network) => putIfCacheable(cache, req, network))
    .catch((err) => {
      debug(`revalidate skipped for ${new URL(req.url).pathname}`, err);
    });

  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }

  await refresh;
  const fresh = await cache.match(req);
  if (fresh) return fresh;
  // Refresh failed and there was no cached copy: surface the network error
  // exactly as a normal fetch would.
  return fetch(req);
}

/**
 * Store a response, ignoring quota, opaque and redirect responses.
 *
 * @param {Cache} cache
 * @param {Request} req
 * @param {Response} res
 */
async function putIfCacheable(cache, req, res) {
  if (!res || !res.ok || res.type === 'opaque' || res.redirected) return;
  try {
    await cache.put(req, res.clone());
  } catch (err) {
    debug('cache put skipped', err);
  }
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

// --- periodic background sync ----------------------------------------------
//
// A PWA that is installed but rarely opened never discovers a deploy: the update
// check lives in the page (`sw-register.tsx`), and the offline document is only
// refreshed while the app is running. Chromium's Periodic Background Sync lets
// the worker close that gap on its own schedule (engagement + battery
// permitting); everywhere else this handler simply never fires.

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== SHELL_REFRESH_TAG) return;
  event.waitUntil(refreshShellInBackground());
});

/** Ask the browser for a new worker and re-validate what the app boots into. */
async function refreshShellInBackground() {
  const last = await readShellRefreshAt();
  if (typeof last === 'number' && Date.now() - last < SHELL_REFRESH_INTERVAL_MS) {
    debug('background shell refresh skipped (recent)');
    return;
  }

  // `registration.update()` re-fetches /sw.js. A changed worker installs and
  // then waits for the app to accept it, exactly as an in-page check would.
  try {
    await self.registration.update();
  } catch (err) {
    debug('worker update check failed', err);
  }

  await refreshDocuments();

  try {
    await writeShellRefreshAt(Date.now());
  } catch (err) {
    debug('refresh stamp not persisted', err);
  }
}

/** Re-fetch the offline document and the manifest into the shell cache. */
async function refreshDocuments() {
  const urls = [PRECACHE_URL, ...SHELL_REFRESH_DOCUMENTS];
  const cache = await caches.open(CACHE_NAME);
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' }));
      if (!res.ok || res.redirected) return;
      // The precache list itself is data for the next install, not a shell file.
      if (url !== PRECACHE_URL) await cache.put(url, res.clone());
    }),
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) debug(`background refresh: ${failed}/${urls.length} documents skipped`);
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
    event.ports[0].postMessage({
      build: '__BUILD_ID__',
      cache: CACHE_NAME,
      contract: SW_CONTRACT,
    });
  }
});

// --- push ------------------------------------------------------------------
//
// Payload contract (sent by packages/ai/src/alerts/delivery/adapters.ts):
//   { title, body, url, tag?, badge?, icon?, actions? }
// `badge` is an unread count for the app icon (Badging API).
// `actions` is an optional array of { action, title } rendered on platforms
// that support notification buttons (Android/desktop Chrome).

self.addEventListener('push', (event) => {
  /**
   * @type {{ title?: string, body?: string, url?: string, tag?: string,
   *          badge?: number, icon?: string, actions?: Array<{ action?: string, title?: string }> }}
   */
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
        actions: notificationActions(data.actions),
      });
      await updateBadge(data.badge);
    })(),
  );
});

/**
 * Normalize payload actions: at most two, each with a non-empty id and title.
 * A malformed payload must never keep the notification from rendering.
 *
 * @param {unknown} value
 * @returns {Array<{ action: string, title: string }>}
 */
function notificationActions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry) =>
        entry &&
        typeof entry.action === 'string' &&
        entry.action.length > 0 &&
        typeof entry.title === 'string' &&
        entry.title.length > 0,
    )
    .slice(0, 2)
    .map((entry) => ({ action: entry.action, title: entry.title }));
}

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
  if (event.action === 'dismiss') return;

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
 * @param {Event & { oldSubscription?: PushSubscription, newSubscription?: PushSubscription }} event
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
  await idbPut(PUSH_DB, PUSH_STORE, PUSH_PENDING_KEY, subscription);
}

/** Epoch ms of the last background shell refresh (null when never / unavailable). */
function readShellRefreshAt() {
  return idbGet(SHELL_STATE_DB, SHELL_STATE_STORE, SHELL_REFRESH_KEY).catch(() => null);
}

/** @param {number} value */
function writeShellRefreshAt(value) {
  return idbPut(SHELL_STATE_DB, SHELL_STATE_STORE, SHELL_REFRESH_KEY, value);
}

// --- tiny IndexedDB helpers ------------------------------------------------
//
// The worker keeps exactly two records of its own (the push handoff and the
// background-refresh stamp). This is all the plumbing they need; a store is
// created on first use so neither side has to own a migration.

/**
 * @param {string} dbName
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<unknown>}
 */
function idbGet(dbName, storeName, key) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) {
        open.result.createObjectStore(storeName);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const get = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      get.onsuccess = () => {
        resolve(get.result);
        db.close();
      };
      get.onerror = () => {
        reject(get.error);
        db.close();
      };
    };
  });
}

/**
 * @param {string} dbName
 * @param {string} storeName
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
function idbPut(dbName, storeName, key, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(dbName, 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) {
        open.result.createObjectStore(storeName);
      }
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(undefined);
      };
      tx.onerror = () => {
        reject(tx.error);
        db.close();
      };
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
