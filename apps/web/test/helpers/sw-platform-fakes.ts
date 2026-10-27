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

// Platform fakes for the service-worker harness (test/helpers/service-worker-harness.ts).
//
// Deliberately minimal: each one implements exactly the surface
// `scripts/sw.template.js` touches, so an unknown API throws loudly instead of
// silently returning undefined.
/** Origin the simulated worker is served from. */
export const SW_ORIGIN = 'https://kestrel.test';

/** Minimal in-memory Cache implementation keyed by absolute URL. */
export class MemoryCache {
  readonly store = new Map<string, Response>();

  private key(request: RequestInfo | URL): string {
    if (typeof request === 'string') return new URL(request, SW_ORIGIN).href;
    if (request instanceof URL) return request.href;
    return request.url;
  }

  async match(request: RequestInfo | URL): Promise<Response | undefined> {
    return this.store.get(this.key(request));
  }

  async put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.store.set(this.key(request), response);
  }
}

/** Minimal CacheStorage over MemoryCache instances. */
export class MemoryCacheStorage {
  readonly caches = new Map<string, MemoryCache>();

  async open(name: string): Promise<MemoryCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new MemoryCache();
      this.caches.set(name, cache);
    }
    return cache;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

/** Minimal IndexedDB good enough for the push-handoff write. */
export function createFakeIndexedDb(): IDBFactory {
  const stores = new Map<string, Map<string, unknown>>();

  const makeDb = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const data = stores.get(name)!;
    return {
      objectStoreNames: {
        contains: (store: string) => data.has(store),
      },
      createObjectStore: (store: string) => {
        data.set(store, new Map());
        return {};
      },
      transaction: (_store: string) => {
        const tx: Record<string, unknown> = {};
        const store = {
          put: (value: unknown, key: string) => {
            data.set(key, value);
            queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
          },
          get: (key: string) => {
            const request: Record<string, unknown> = { result: data.get(key) };
            queueMicrotask(() => (request.onsuccess as (() => void) | undefined)?.());
            return request;
          },
          delete: (key: string) => {
            data.delete(key);
          },
        };
        tx.objectStore = () => store;
        return tx;
      },
      close: () => {},
    };
  };

  return {
    open(name: string) {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        request.result = makeDb(name);
        (request.onupgradeneeded as (() => void) | undefined)?.();
        (request.onsuccess as (() => void) | undefined)?.();
      });
      return request;
    },
  } as unknown as IDBFactory;
}

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export type FetchRoute = {
  match: string | RegExp | ((url: string) => boolean);
  respond: (url: string) => Response | Promise<Response>;
};

/** Does a route rule match a request URL? */
export function routeMatches(rule: FetchRoute, url: string): boolean {
  if (typeof rule.match === 'string') return url.endsWith(rule.match);
  if (rule.match instanceof RegExp) return rule.match.test(url);
  return rule.match(url);
}

/** Build a Response whose `redirected` flag is true. */
export function redirectedResponse(body: string, status = 200): Response {
  const res = new Response(body, { status });
  Object.defineProperty(res, 'redirected', { value: true });
  return res;
}
