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

// A ServiceWorkerGlobalScope stand-in for executing the real service-worker
// source inside Vitest.
//
// The previous SW test only grepped the template for substrings, which cannot
// tell "declares cacheFirst" from "actually serves a cached response". This
// harness runs the shipped code in a `node:vm` sandbox with the platform APIs a
// worker touches (caches, fetch, clients, registration, IndexedDB) so the
// strategies are exercised end to end. The platform fakes live in
// test/helpers/sw-platform-fakes.ts; this file wires them into the sandbox and
// drives events.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import {
  createFakeIndexedDb,
  MemoryCacheStorage,
  routeMatches,
  SW_ORIGIN,
  type FetchCall,
  type FetchRoute,
} from './sw-platform-fakes';

export { SW_ORIGIN, redirectedResponse } from './sw-platform-fakes';

export interface HarnessOptions {
  /** Route table: first matching rule wins; unmatched URLs 404. */
  routes?: FetchRoute[];
  /** Payload for `GET /sw-precache.json` when no explicit route matches it. */
  precache?: string[] | null;
  /** Window clients `clients.matchAll()` should report. */
  clients?: Array<{
    url: string;
    focus?: () => Promise<void>;
    navigate?: (url: string) => Promise<void>;
  }>;
}

export interface SwTestEvent {
  waitUntil(promise: Promise<unknown>): void;
  respondWith?(response: Promise<Response>): void;
  [key: string]: unknown;
}

export interface ServiceWorkerHarness {
  caches: MemoryCacheStorage;
  fetchCalls: FetchCall[];
  notifications: Array<{ title: string; options: Record<string, unknown> }>;
  openedWindows: string[];
  messages: unknown[];
  /** Number of times the worker asked to take over immediately. */
  skipWaitingCalls: number;
  /** Number of background worker-update checks the worker requested. */
  registrationUpdateCalls: number;
  registration: Record<string, unknown>;
  navigator: { badge: number | null };
  /** Absolute URL helper. */
  url(path: string): string;
  /**
   * Dispatch an event and settle every promise the handler handed to
   * `waitUntil` / `respondWith`.
   */
  dispatch(
    type: string,
    event?: Partial<SwTestEvent> & Record<string, unknown>,
  ): Promise<{ response?: Response; thrown?: unknown }>;
  /** Cached response for a URL (undefined when not cached). */
  cached(path: string): Promise<Response | undefined>;
  /** Seed the cache the way a previous run would have. */
  seed(path: string, body: string, init?: ResponseInit): Promise<void>;
  /** Cache name the worker derives from the stamped build id + asset revision. */
  cacheName: string;
  /** Direct access to the handler registered for an event type. */
  handlerRegistered(type: string): boolean;
}

/**
 * Evaluate the service-worker template in a sandbox with `__BUILD_ID__`,
 * `__ASSET_REV__` and `__VAPID_PUBLIC_KEY__` substituted, mirroring exactly
 * what `generate-sw.mjs` ships.
 */
export function loadServiceWorker(
  options: HarnessOptions & {
    buildId?: string;
    assetRev?: string;
    vapidKey?: string;
    source?: string;
  } = {},
): ServiceWorkerHarness {
  const template =
    options.source ?? readFileSync(join(process.cwd(), 'scripts/sw.template.js'), 'utf8');
  const buildId = options.buildId ?? 'test-build';
  const assetRev = options.assetRev ?? 'deadbeef';
  const source = template
    .replace(/__BUILD_ID__/g, buildId)
    .replace(/__ASSET_REV__/g, assetRev)
    .replace(/__VAPID_PUBLIC_KEY__/g, options.vapidKey ?? '');

  const caches = new MemoryCacheStorage();
  const listeners = new Map<string, (event: SwTestEvent) => void>();
  const fetchCalls: FetchCall[] = [];
  const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
  const openedWindows: string[] = [];
  const messages: unknown[] = [];
  const badge = { count: null as number | null };
  const skipWaiting = { calls: 0 };
  const registrationState = { preloadEnabled: false };
  const updateChecks = { calls: 0 };

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? new URL(input, SW_ORIGIN).href
        : input instanceof URL
          ? input.href
          : input.url;
    fetchCalls.push({ url, ...(init ? { init } : {}) });

    for (const rule of options.routes ?? []) {
      if (routeMatches(rule, url)) return rule.respond(url);
    }
    if (url.endsWith('/sw-precache.json') && options.precache) {
      return new Response(JSON.stringify(options.precache), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };

  const registration = {
    showNotification: async (title: string, opts: Record<string, unknown>) => {
      notifications.push({ title, options: opts });
    },
    update: async () => {
      updateChecks.calls += 1;
    },
    navigationPreload: {
      enable: async () => {
        registrationState.preloadEnabled = true;
      },
    },
    pushManager: {
      subscribe: async () => ({
        toJSON: () => ({
          endpoint: 'https://push.example/rotated',
          keys: { p256dh: 'k', auth: 'a' },
        }),
      }),
    },
  };

  const clientEntries = (options.clients ?? []).map((client) => ({
    url: client.url,
    focus: client.focus ?? (async () => {}),
    navigate: client.navigate ?? (async () => {}),
    postMessage: (message: unknown) => {
      messages.push(message);
    },
  }));

  const sandbox: Record<string, unknown> = {
    caches,
    fetch: fetchMock,
    clients: {
      claim: async () => {},
      matchAll: async () => clientEntries,
      openWindow: async (url: string) => {
        openedWindows.push(url);
        return null;
      },
    },
    registration,
    skipWaiting: () => {
      skipWaiting.calls += 1;
    },
    navigator: {
      get badge(): number | null {
        return badge.count;
      },
      setAppBadge: async (count?: number) => {
        badge.count = count ?? 0;
      },
      clearAppBadge: async () => {
        badge.count = null;
      },
    },
    indexedDB: createFakeIndexedDb(),
    console: { warn: () => {}, debug: () => {}, log: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    URLSearchParams,
    // The worker builds Requests from relative paths (`/offline`), which the
    // fetch() constructor rejects; resolve them against the SW origin the way a
    // real worker resolves them against its scope.
    Request: class RequestShim extends Request {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, SW_ORIGIN).href : input, init);
      }
    },
    Response,
    Headers,
    addEventListener: (type: string, handler: (event: SwTestEvent) => void) => {
      listeners.set(type, handler);
    },
  };
  sandbox.location = { origin: SW_ORIGIN, href: `${SW_ORIGIN}/sw.js` };
  sandbox.postMessage = () => {};

  vm.createContext(sandbox);
  sandbox.self = sandbox;
  vm.runInContext(source, sandbox, { filename: 'sw.template.js' });

  const url = (path: string): string => new URL(path, SW_ORIGIN).href;
  const cacheName = `kestrel-shell-v${buildId}-${assetRev}`;

  const dispatch = async (
    type: string,
    event: Partial<SwTestEvent> & Record<string, unknown> = {},
  ): Promise<{ response?: Response; thrown?: unknown }> => {
    const handler = listeners.get(type);
    if (!handler) throw new Error(`service worker did not register a '${type}' handler`);

    const pending: Promise<unknown>[] = [];
    let responsePromise: Promise<Response> | undefined;
    try {
      handler({
        ...event,
        waitUntil: (promise: Promise<unknown>) => {
          pending.push(promise);
        },
        respondWith: (promise: Promise<Response>) => {
          responsePromise = promise;
        },
      });
    } catch (err) {
      return { thrown: err };
    }

    // Settle both queues; a rejected fetch is recorded, not thrown, so a test
    // can assert on the fallback path the worker chose.
    let response: Response | undefined;
    let thrown: unknown;
    try {
      response = responsePromise ? await responsePromise : undefined;
      await Promise.all(pending);
    } catch (err) {
      thrown = err;
    }
    return { ...(response ? { response } : {}), ...(thrown ? { thrown } : {}) };
  };

  return {
    caches,
    fetchCalls,
    notifications,
    openedWindows,
    messages,
    registration: { ...registration, state: registrationState },
    navigator: {
      get badge(): number | null {
        return badge.count;
      },
    },
    url,
    dispatch,
    cacheName,
    cached: async (path: string) => (await caches.open(cacheName)).match(url(path)),
    seed: async (path: string, body: string, init?: ResponseInit) => {
      const cache = await caches.open(cacheName);
      await cache.put(url(path), new Response(body, { status: 200, ...init }));
    },
    get skipWaitingCalls() {
      return skipWaiting.calls;
    },
    get registrationUpdateCalls() {
      return updateChecks.calls;
    },
    handlerRegistered: (type: string) => listeners.has(type),
  };
}
